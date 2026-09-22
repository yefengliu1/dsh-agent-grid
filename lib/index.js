/**
 * 八席 (Eight Seats) —— host face。
 *
 * ── 为什么必须有一个 host 半边 ─────────────────────────────────────────────
 * 需求是「侧栏 8 张卡各自能看到一部分内容和过程」。纯客户端做不到 ——
 * 实测（探针跑在真实 GUI 上）：
 *
 *     席位      binding   事件窗口 entries
 *     钟离      ✓            0
 *     洞宾      ✓            0
 *     …（其余 6 席）✓            0
 *     仙姑      ✓          265   ← 只有「上台」的那个
 *
 * 原因在 dsh-api-session-controller 的 `followCurrent()` 文档里写死了：
 * **"Staging IS the open signal — the window opens ⟺ the session is on stage"**
 * 事件窗口只为当前 session 打开，其余会话的 binding 存在但窗口是空的。
 *
 * 所以正确做法是走 **session-projection** 这条官方扩展缝：host 侧注册一个纯 fold，
 * 框架会在**每条已提交的会话事件**上主动驱动它（不需要自己订阅），
 * 计算结果经 `wire.view` 送到客户端，落在 `SessionSummary.projectionValues[key]`。
 * `title` 已经在用同一条路径，所以这不是偏方。
 *
 * ── 这个单元算什么 ─────────────────────────────────────────────────────────
 * 只做「最后一条工具调用 + 最后一段助手文本」，且**只保留展示所需的短字符串** ——
 * state 是纯 JSON（持久化缓存的前提），所以不能塞整个事件。
 */
import { z } from "zod";
import zc from "@deepseek-ai/schemastery";

/** cordis fiber 服务名。 */
export const inject = ["sessionProjections"];

/** 设置命名空间：侧边栏模式开关存在这里（host 侧 schema 校验 + 持久化）。 */
const SETTINGS_NAMESPACE = "agent-grid";
const SIDEBAR_FIELD = "sidebar";
/** 默认挂八席网格；用户在「设置 → 通用」里可切回 default（原生会话浏览）。 */
const SIDEBAR_DEFAULT = "grid";

/**
 * 设置 schema。`default()` 让「用户没设过」时有确定值 ——
 * 客户端读不到值时按同一个默认走，两边不会打架。
 */
const Settings = zc.object({
	[SIDEBAR_FIELD]: zc.string().default(SIDEBAR_DEFAULT),
});

/** 投影 key，同时也是客户端读取用的 projectionValues 键名。 */
const KEY = "seat-activity";

/** 单项截断长度：卡片只有 ~240px 宽，再长也是省略号。 */
const ARG_MAX = 52;
const TEXT_MAX = 120;
/** thinking（reasoning 块）与工具结果各留一行 —— 卡片是单行省略，再多也看不见。 */
const THINK_MAX = 132;
const RESULT_MAX = 120;
/** 「需要你接手」的两种来源：等你回答（ask_user_question）/ 等你批准（审批）。 */
const ATTENTION_QUESTION = "question";
const ATTENTION_APPROVAL = "approval";
/** 会阻塞等待人类输入的工具名。 */
const ASKING_TOOLS = new Set(["ask_user_question"]);

/**
 * 投影状态。全部是短字符串 + 数字 —— 纯 JSON，可安全持久化。
 * 空日志的初值由 init() 给出（全空串 / -1）。
 *
 * v2 相比 v1 增加了三项（卡片「看得见过程」的关键）：
 *   think     —— 最近一段 reasoning（模型想什么），来自 assistant/message 的 reasoning 块；
 *   result    —— 最近一次工具结果的摘要，来自 tool/result；
 *   attention —— '' | 'question' | 'approval'，配 attentionId 用来配对清除。
 */
const State = z.object({
	toolName: z.string(),
	toolArg: z.string(),
	text: z.string(),
	think: z.string(),
	result: z.string(),
	attention: z.string(),
	attentionId: z.string(),
	turn: z.number(),
	time: z.number(),
	/**
	 * `/clear` 的信号：非 0 表示这一席刚被 clear 过（值是命令事件的时间戳）。
	 * 客户端看到它变新，就去开一个新会话 —— 「界面清空 + 卡片初始化」只有新建会话能给，
	 * 同一个 session 的历史在 GUI 里清不掉（transcript 读 append-origin 事件）。
	 */
	clearedAt: z.number(),
});

/** 「什么动静都没有」的投影值 —— init 与 clear 复位共用同一份形状。 */
const IDLE_ACTIVITY = {
	toolName: "", toolArg: "", text: "", think: "", result: "",
	attention: "", attentionId: "", turn: -1, time: 0, clearedAt: 0,
};

/** 看起来像路径的参数键 —— 这些值取 basename，否则整条路径会撑爆卡片。 */
const PATH_KEYS = new Set(["file_path", "path", "filepath", "file", "dir", "directory", "cwd"]);

/** 优先取用的参数键（工具参数里最有信息量的那个）。 */
const PREFERRED_KEYS = [
	"pattern", "file_path", "path", "command", "query", "url", "prompt", "name", "description",
];

function clamp(s, n) {
	return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

/** 取 basename，兼容 POSIX 与 Windows 两种分隔符。 */
function baseName(p) {
	const parts = String(p).split(/[\\/]/);
	return parts[parts.length - 1] || p;
}

/**
 * 从工具调用的 `arguments`（JSON 字符串）里挑一个能看的摘要。
 *
 * 工具参数是模型生成的任意 JSON，形状不可控 —— 这里只做尽力而为的提取：
 * 优先已知键 → 退化为第一个字符串值 → 再退化为原始文本截断。
 * 拿不到就返回空串（卡片会显示别的行，不会显示 "undefined"）。
 */
function argPreview(raw) {
	if (typeof raw !== "string" || raw === "") return "";
	let parsed;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return clamp(raw.replace(/\s+/g, " "), ARG_MAX);
	}
	if (parsed === null || typeof parsed !== "object") return clamp(String(parsed), ARG_MAX);

	const pick = (key, value) => {
		const v = String(value).replace(/\s+/g, " ");
		return clamp(PATH_KEYS.has(key) ? baseName(v) : v, ARG_MAX);
	};
	for (const key of PREFERRED_KEYS) {
		const v = parsed[key];
		if (typeof v === "string" && v !== "") return pick(key, v);
	}
	for (const [key, v] of Object.entries(parsed)) {
		if (typeof v === "string" && v !== "") return pick(key, v);
	}
	return "";
}

/** 从 AssistantMessage 的 content blocks 里取第一段非空 text。 */
function textOf(message) {
	const blocks = message && Array.isArray(message.content) ? message.content : [];
	for (const block of blocks) {
		if (block && block.type === "text" && typeof block.text === "string" && block.text.trim() !== "") {
			return clamp(block.text.trim().replace(/\s+/g, " "), TEXT_MAX);
		}
	}
	return "";
}

/**
 * 取**最后一段**非空 reasoning（thinking）。
 *
 * 为什么取最后而不是第一：一轮里模型可能先想、调工具、再想；
 * 卡片要的是「它现在在想什么」，所以越靠后越新。
 */
function thinkOf(message) {
	const blocks = message && Array.isArray(message.content) ? message.content : [];
	for (let i = blocks.length - 1; i >= 0; i -= 1) {
		const block = blocks[i];
		if (block && block.type === "reasoning" && typeof block.text === "string" && block.text.trim() !== "") {
			return clamp(block.text.trim().replace(/\s+/g, " "), THINK_MAX);
		}
	}
	return "";
}

/**
 * 从 tool/result 事件里取结果摘要 + 对应的 callId（用于清除「等你回答」）。
 *
 * 事件形状（实测自 session.v3 日志）：
 *   data.message.content[] = { type:'tool-result', toolCallId, content:[{type:'text',text}] }
 * 非文本结果（图片等）给一个占位，避免卡片那一行空着让人以为没结果。
 */
function resultOf(event) {
	const message = event.data && event.data.message;
	const blocks = message && Array.isArray(message.content) ? message.content : [];
	for (const block of blocks) {
		if (!block || block.type !== "tool-result") continue;
		const callId = typeof block.toolCallId === "string" ? block.toolCallId : "";
		const parts = Array.isArray(block.content) ? block.content : [];
		for (const part of parts) {
			if (part && part.type === "text" && typeof part.text === "string" && part.text.trim() !== "") {
				return { text: clamp(part.text.trim().replace(/\s+/g, " "), RESULT_MAX), callId };
			}
		}
		return { text: "（非文本结果）", callId };
	}
	return undefined;
}

/**
 * Host 插件体：注册 `seat-activity` 投影单元。
 *
 * 契约要点（照 ProjectionDefinition 写的，别改坏）：
 *   - `apply` 必须**纯同步**，且对不关心的事件**返回同一个 state 引用** ——
 *     `Object.is` 相等会产生零下游工作量。这是这个 API 的性能前提。
 *   - `wire.view` 也必须在不变化时复用引用，否则会无谓地发布。
 *     state 只在 apply 里换新对象，所以直接返回 state 就满足这一条。
 */
export function apply(ctx) {
	ctx.sessionProjections.register({
		key: KEY,
		stateSchema: State,
		init: () => ({ ...IDLE_ACTIVITY }),
		apply: (state, event) => {
			const data = event.data;
			const time = typeof event.time === "number" ? event.time : state.time;

			// `/clear` = 这一席换一个新会话。命令事件（command/run）由平台的 commands
			// 服务写在当前会话上，这里只负责把「刚 clear 过」这件事落进投影；
			// 客户端看到 clearedAt 变新就去开新会话 —— 「界面清空 + 卡片初始化」
			// 只有新建会话能给，同一个 session 的历史在 GUI 里清不掉。
			// 顺手把动态行清空，所以卡片在切换完成前就已经是「没动静」的样子。
			if (event.type === "command/run" && data !== undefined && data.name === "clear") {
				return { ...IDLE_ACTIVITY, clearedAt: time };
			}

			if (event.type === "tool/call") {
				const name = typeof data.name === "string" ? data.name : "";
				const callId = typeof data.callId === "string" ? data.callId : "";
				// 会阻塞等人类回答的工具：卡片立刻切成「等你回答」
				const asks = ASKING_TOOLS.has(name);
				return {
					...state,
					toolName: name,
					toolArg: argPreview(data.arguments),
					turn: typeof data.turn === "number" ? data.turn : state.turn,
					time,
					...(asks ? { attention: ATTENTION_QUESTION, attentionId: callId } : {}),
				};
			}

			if (event.type === "tool/result") {
				const found = resultOf(event);
				// 这一条结果是否正是那句「等你回答」的回答
				const answers = state.attentionId !== "" && found !== undefined && found.callId === state.attentionId;
				if (found === undefined && !answers) return state;
				return {
					...state,
					...(found === undefined ? {} : { result: found.text, time }),
					...(answers ? { attention: "", attentionId: "" } : {}),
				};
			}

			if (event.type === "assistant/message") {
				const text = textOf(data.message);
				const think = thinkOf(data.message);
				// 空文本（纯 tool-call 的回复）不覆盖上一条，免得卡片闪成空白
				if (text === "" && think === "") return state;
				return {
					...state,
					...(text === "" ? {} : { text }),
					...(think === "" ? {} : { think }),
					time,
				};
			}

			if (event.type === "approval/asked") {
				const id = typeof data.id === "string" ? data.id : (typeof data.callId === "string" ? data.callId : "");
				return { ...state, attention: ATTENTION_APPROVAL, attentionId: id, time };
			}

			if (event.type === "approval/decided") {
				if (state.attention !== ATTENTION_APPROVAL) return state;
				const id = typeof data.id === "string" ? data.id : "";
				// id 对不上说明还有别的审批在等，别误清
				if (id !== "" && state.attentionId !== "" && id !== state.attentionId) return state;
				return { ...state, attention: "", attentionId: "", time };
			}

			// 人类说话了 —— 不管之前挂的是「等你回答」还是「等你批准」，这一席都不再等你
			if (event.type === "user/message") {
				return state.attention === "" ? state : { ...state, attention: "", attentionId: "" };
			}

			return state; // 不关心的事件：同一引用，零下游工作
		},
		wire: {
			viewSchema: State,
			view: (state) => state,
		},
		stateVersion: 3,
	});

	// 设置命名空间：侧边栏模式开关。
	// 用 ctx.inject 回调而不是顶层 inject 声明 —— 这样即使部署里没挂 settings，
	// 整个插件（含投影）仍然照常工作，只是少一个开关。
	ctx.inject(["settings"], (settingsCtx) => {
		settingsCtx.settings.register(SETTINGS_NAMESPACE, Settings);
	});
}

