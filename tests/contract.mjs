/**
 * 宿主契约测试 —— 专门盯「平台换了形状、我们静默瞎掉」这一类失败。
 *
 * 为什么单独有这一层（2026-10-16，一天里被同一类 bug 咬了四次）：
 *   · 会话列表 store 的 `current` 字段没了 → 卡片 `is-active` 一帧都不亮，
 *     连带 reconcile / seatWorkspace / claimPendingSeat 三处一起失效；
 *   · `tool/result` 的 callId 从 content block 挪到 `message.toolCallId` →
 *     「待答」清不掉（假阳性）、卡片「结果」行永远空的；
 *   · 宿主 `Config` 少了 `.volatile()` → settings 根本不服务这个命名空间；
 *   · DSH 客户端只把 localhost/::1/127.x 当 loopback → 整份 settings 降级 memory。
 *
 * 这四条**都不是逻辑错**，是「我们以为的宿主形状」过期了。既有两层测不到：
 *   · `evals.md` 是 conformance（实现 vs spec），spec 里没写宿主形状；
 *   · `tests/reconcile.mjs` 把 `current` 当**入参**喂进去 —— 纯函数全绿，
 *     而生产里那个值根本产不出来。这正是上面第一条能藏一整天的原因。
 *
 * 三层断言：
 *   A 行为层：拿**真机事件**喂进投影定义，断言 attention 被配对清除、result 落上；
 *   B 契约层：断言我们依赖的宿主设施仍在（uiSession.current 是 binding source）；
 *   C 静态层：断言我们自己的源码不再读已被移除的字段、且确实走新通道。
 *
 * 跑法：
 *   node tests/contract.mjs
 *   # mutation 验证（换掉解析器后必须 FAIL，否则这层测试是假的）：
 *   cp lib/index.js /tmp/mut.js && <把 resultOf 改回老形状> \
 *     && DSX_INDEX=/tmp/mut.js node tests/contract.mjs; echo "exit=$?（应为 1）"
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, isAbsolute, join } from "node:path";
import os from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..");

/** 允许指向别的副本，专为 mutation 验证留的口子。 */
const INDEX_PATH = process.env.DSX_INDEX
	? (isAbsolute(process.env.DSX_INDEX) ? process.env.DSX_INDEX : join(here, process.env.DSX_INDEX))
	: join(repo, "lib", "index.js");
/** 已安装的 DSH 包目录（宿主契约层的取样点）。 */
const DSH_MODULES = process.env.DSH_MODULES
	?? join(os.homedir(), ".dsh", "profiles", "node_modules", "@deepseek-ai");

let failures = 0;
let checks = 0;
let skipped = 0;
function check(name, ok, detail = "") {
	checks += 1;
	if (ok) {
		console.log("  ✓ " + name);
		return;
	}
	failures += 1;
	console.log("  ✗ " + name + (detail ? "  —— " + detail : ""));
}
function skip(name, why) {
	skipped += 1;
	console.log("  · " + name + "（跳过：" + why + "）");
}
function section(title) {
	console.log("\n" + title);
}

// ---------------------------------------------------------------- A 行为层
/**
 * 把宿主面挂到一个最小 ctx 上，取出投影定义，用真机事件驱动它。
 * 不 import 真 cordis：这里要测的是 apply 的**行为**，不是框架。
 */
async function driveProjection() {
	const mod = await import(pathToFileURL(INDEX_PATH).href);
	let def;
	const ctx = {
		sessionProjections: { register: (d) => { def = d; } },
		inject: () => {},
		effect: () => () => {},
		logger: { info() {}, warn() {}, error() {} },
	};
	mod.apply(ctx);
	if (def === undefined) throw new Error("宿主面没有注册 sessionProjections —— apply 形状变了？");
	return { def, Config: mod.Config };
}

const fixture = JSON.parse(readFileSync(join(here, "fixtures", "rc2-tool-result.json"), "utf8"));
const [askEvent, resultEvent] = fixture.events;
const CALL_ID = askEvent.data.callId;

section("A 投影行为（真机 0.2.0-rc.2 事件）");
{
	const { def } = await driveProjection();
	const s0 = def.init();
	const s1 = def.apply(s0, askEvent);
	check("asking 工具调用 → attention=question 且带 callId",
		s1.attention === "question" && s1.attentionId === CALL_ID,
		`attention=${s1.attention} id=${s1.attentionId}`);

	const s2 = def.apply(s1, resultEvent);
	check("同一 callId 的 tool/result → attention 被配对清除（「待答」不再假阳性）",
		s2.attention === "" && s2.attentionId === "",
		`attention=${JSON.stringify(s2.attention)} id=${JSON.stringify(s2.attentionId)}`);
	check("同一条结果 → 卡片「结果」行有内容（原来恒空）",
		typeof s2.result === "string" && s2.result.length > 0,
		`result=${JSON.stringify(s2.result)}`);

	// 不相关的事件必须返回同一引用（投影的性能契约：Object.is 相等 = 零下游工作）
	const unrelated = { type: "step/start", seq: 1, time: 1, data: {} };
	check("不关心的事件返回同一引用（投影性能契约）", def.apply(s2, unrelated) === s2);
}

// ------------------------------------------------------- A2（条件式）Config 可服务性
section("A2 宿主 Config（若声明了，就必须含 volatile 字段）");
{
	const { Config } = await driveProjection();
	if (Config === undefined) {
		console.log("  · 本仓宿主面没有 Config（agent-grid 的开关不走 settings）—— 跳过");
	} else {
		// 复刻 dsh-settings 的 volatileForm()：只有 volatile 字段算「可编辑的活配置」，
		// 一个都没有时整个条目会被 describe() 过滤掉：命名空间不被服务。
		// 主题插件就是这样白改了一版（见 dsh-theme-songgrid 的 tests/contract.mjs）。
		const volatileForm = (schema) => {
			if (schema === undefined) return undefined;
			if (schema.meta && schema.meta.volatile) return { ok: true };
			if (schema.type === "object") {
				const kept = Object.entries(schema.dict ?? {}).filter(([, child]) => volatileForm(child) !== undefined);
				return kept.length === 0 ? undefined : { ok: true, fields: kept.map(([k]) => k) };
			}
			return undefined;
		};
		const form = volatileForm(Config);
		check("Config 至少有一个 .volatile() 字段", form !== undefined && form.ok === true,
			"没有 volatile 字段 → 命名空间不会被服务");
	}
}

// ---------------------------------------------------------------- B 契约层
section("B 宿主契约（我们依赖的设施还在不在）");
{
	const uiSession = join(DSH_MODULES, "dsh-client-ui-session", "lib", "client.js");
	if (!existsSync(uiSession)) {
		// 纯 Node 的 CI job 里不会装 dsh —— 这一层就跳过，而不是判失败。
		// 真正的把关在 ui-smoke job：那里装了 dsh 并把 DSH_MODULES 指过去，这一层会照跑。
		skip("宿主契约层", `找不到已安装的 dsh（${DSH_MODULES}）—— 设 DSH_MODULES 指向 <install>/node_modules/@deepseek-ai 即可启用`);
	} else {
		const src = readFileSync(uiSession, "utf8");
		check("uiSession 服务仍在（super(ctx, \"uiSession\")）", /super\(ctx,\s*"uiSession"\)/.test(src));
		check("uiSession.current 仍是 binding source（createBindingSource）",
			/this\.current = createBindingSource\(/.test(src));
		check("binding source 仍暴露 value / getSnapshot / subscribe",
			/getSnapshot: \(\) => source\.value/.test(src) && /subscribe: \(listener\)/.test(src));
		check("主窗口会话仍按 retainedBy.mainView 选出（publishMain）",
			/publishMain\(\)/.test(src) && /retainedBy\.mainView/.test(src));

		const controller = join(DSH_MODULES, "dsh-api-session-controller", "lib", "client.js");
		const cs = existsSync(controller) ? readFileSync(controller, "utf8") : "";
		// 会话列表 store 的形状：确认它**仍然没有** current（我们不再读它），
		// 若哪天宿主把 current 加回来，这条会提醒我们重新评估。
		const at = cs.indexOf("createSnapshotStore)({");
		const storeInit = at < 0 ? "" : cs.slice(at, at + 260);
		check("会话列表 store 形状已记录（ids/byId/phase/projectionsBySession，无 current）",
			storeInit.includes("byId") && storeInit.includes("phase") && !/\bcurrent\b/.test(storeInit),
			storeInit.replace(/\s+/g, " ").slice(0, 160));
	}
}

// ---------------------------------------------------------------- C 静态层
section("C 我们自己的源码（不得再读被移除的字段）");
{
	const client = readFileSync(join(repo, "src", "client.template.js"), "utf8");
	/** 去掉注释后再扫，免得「注释里提过」被当成读过。 */
	const code = client
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/(^|[^:])\/\/[^\n]*/g, "$1");

	const forbidden = [
		["state.current", "会话列表 store 没有 current"],
		["list.getSnapshot().current", "会话列表 store 没有 current"],
		["snapshot.current", "会话列表 store 没有 current"],
	];
	for (const [needle, why] of forbidden) {
		check(`不读 ${needle}（${why}）`, !code.includes(needle));
	}
	check("当前会话改走 uiSession 绑定", /uiSession/.test(code) && /getSnapshot\(\)\.key|\.key\b/.test(code));
	check("宿主面按 message.toolCallId 取 callId", /message\.toolCallId/.test(readFileSync(INDEX_PATH, "utf8")));
}

section("D 「收工」这一席的出口");
{
	const client = readFileSync(join(repo, "src", "client.template.js"), "utf8");
	const code = client
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/(^|[^:])\/\/[^\n]*/g, "$1");

	check("卡片末行渲染「收工」（dsx-end 出现在 JSX 与 CSS 里）",
		(code.match(/dsx-end/g) ?? []).length >= 2);
	check("末行合成一条 dsx-foot，且只在当前席展开",
		/className: "dsx-foot"/.test(code) && /\.dsx-card\.is-active \.dsx-foot\{display:flex;\}/.test(code));
	check("endSeatTask 既有声明也有赋值",
		/let endSeatTask = null;/.test(code) && /endSeatTask = \(seatId, sessionId, running\) => \{/.test(code));
	check("fiber dispose 时清掉 endSeatTask（否则热更后旧闭包还在）",
		/endSeatTask = null;\s*\n\s*\};\s*\n\s*\}\);/.test(code));
	check("只在 running 时才 cancel（空闲会话 cancel 会往输入框落错误条）",
		/if \(running\) \{/.test(code) && /session\.cancel\(\)/.test(code));
	check("解绑走 clearSeatBinding，并复位 lastSeatId",
		/clearSeatBinding\(seatId\);/.test(code) && /if \(lastSeatId === seatId\) lastSeatId = null;/.test(code));
}

// ---------------------------------------------------------------- E 状态判据
section("E 「虚席」的判据（绑定，不是快照）");
{
	const client = readFileSync(join(repo, "src", "client.template.js"), "utf8");
	const code = client
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/(^|[^:])\/\/[^\n]*/g, "$1");

	// 真机症状：某个已绑定的席在「没选中」时显示虚席、点开（列表投影到了）才变待命（当时的状态词）。
	// 根因是 stateOf 拿 `!summary` 判虚席 —— 把「没有绑定」和「快照暂时没有这条」混成
	// 同一个词。绑定才是「这一席有没有会话」的判据，summary 只回答「它在干什么」。
	check("stateOf 显式接收 bound（绑定事实与运行事实分开）",
		/function stateOf\(summary, bound\)/.test(code));
	check("虚席只由 !bound 判定，不再由 !summary 回落",
		/if \(!bound\) return \{ cls: "empty"/.test(code) && !/if \(!summary\) return \{ cls: "empty"/.test(code));
	check("调用点把 sid 的绑定事实传进去",
		/stateOf\(summary, sid !== undefined\)/.test(code));

	// 2026-11-17 P3：「待命」合并进「虚席」—— 点空席不再改状态词。
	// 空会话必须落 rest 样式（正常亮度、点它打开），而不是 empty（变暗、点它新建）。
	check("不再有「待命」状态标签", !/"待命"/.test(code));
	check("空会话落「虚席」（rest 样式，词不变）",
		/if \(summary\.blank\) return \{ cls: "rest", label: "虚席" \};/.test(code));

	// 2026-11-17 P2：空白槽清理的作用域从全局收成「同一工作区」。
	// 平台按工作区复用空白槽，全局 ≤1 会误伤别的区里正常就位的那一席。
	check("空白槽清理按工作区收敛（workspaceKeyOf）",
		/function workspaceKeyOf\(sessionId\)/.test(code)
			&& /currentKey !== key/.test(code)
			&& /workspaceKeyOf\(current\)/.test(code));
}

// ---------------------------------------------------------------- 结果
console.log(
	failures === 0
		? `\ncontract: 全部通过（${checks} 项${skipped > 0 ? `，跳过 ${skipped} 项` : ""}）`
		: `\ncontract: ${failures}/${checks} 项失败`,
);
process.exit(failures === 0 ? 0 : 1);
