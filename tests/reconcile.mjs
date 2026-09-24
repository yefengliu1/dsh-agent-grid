/**
 * 席位绑定裁决（reconcile）的回归测试。
 *
 * 为什么单独测这一段：它是纯函数（只依赖 localStorage + 会话列表快照），
 * 而它的一条规则曾经在真实 GUI 上造成「clear 完一席之后就再也回不去」——
 * 平台 `sessions.clear()` 会把 current 置空（用户正看着「选择工作目录」），
 * 那一刻如果照常裁决，「空白槽只留 current 那一个」会把所有待命席位的绑定一次清光。
 *
 * 直接从 src/client.template.js 里抽出真源码来跑（不复制逻辑），
 * 这样源码改了而测试没跟上时，测试会立刻失败，而不是继续骗自己。
 *
 * 跑法：node tests/reconcile.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "..", "src", "client.template.js"), "utf8");

/** 从源码里按整段抽出需要的定义（缺一段就直接报错，免得静默跑到空实现上）。 */
function slice(startMarker, endMarker) {
	const from = src.indexOf(startMarker);
	if (from < 0) throw new Error("测试找不到片段起始：" + startMarker);
	const to = src.indexOf(endMarker, from);
	if (to < 0) throw new Error("测试找不到片段结束：" + endMarker);
	return src.slice(from, to);
}

/** 抽一整行（用于单行声明）。 */
function oneLine(marker) {
	const from = src.indexOf(marker);
	if (from < 0) throw new Error("测试找不到行：" + marker);
	return src.slice(from, src.indexOf("\n", from));
}

const seatBlock = slice("const SEATS = [", "// ---- 槽位绑定");
const bindingBlock = slice("const BIND_KEY =", "/**\n\t\t * 一个会话能不能坐进席位");
const eligibleBlock = slice("/**\n\t\t * 一个会话能不能坐进席位", "/**\n\t\t * 席位绑定。三条规则");
const reconcileBlock = slice("/**\n\t\t * 席位绑定。三条规则", "/** 清空一席：解绑当前会话");
// 「这一席在等哪个工作区的空白会话」的判据 —— 换目录后认领会不会挂在路径形式上，
// 全看这一段（见文件末尾第 6 组：canonical 路径与未投影 cwd 两个边界）。
const wsListBlock = oneLine("let workspaceListOf = () => [];");
const claimBlock = slice("const claimTarget = (seatId, workspace) => {", "/**\n\t\t\t\t * 目标空白会话");
const inClaimBlock = slice("const inClaimWorkspace = (claim, sessionId, summary) => {", "// 「这一席在等一个新空白会话」：记事实");
// 「新建时会不会端走别人的待命槽」的判据 —— 从八席起的对话被挪到别的格子，
// 正是这一段的返回值决定的（见第 9 组）。
const ownedBlankBlock = slice("const ownedBlankIn = (workspace, snapshot, bind) => {", "const createFreshSession");

/** 造一个只带 localStorage 的最小 window。 */
function makeSandbox() {
	const store = new Map();
	const localStorage = {
		getItem: (k) => (store.has(k) ? store.get(k) : null),
		setItem: (k, v) => store.set(k, String(v)),
		removeItem: (k) => store.delete(k),
	};
	const sandbox = { window: { localStorage }, console };
	vm.createContext(sandbox);
	// vm 里顶层的 const/let 不会挂到 sandbox 上，所以显式导出一份句柄给测试用。
	vm.runInContext(
		[seatBlock, bindingBlock, eligibleBlock, reconcileBlock, wsListBlock, claimBlock, inClaimBlock, ownedBlankBlock].join("\n")
			+ "\nglobalThis.__api = { SEATS, reconcile, readStore, writeStore, claimTarget, inClaimWorkspace, ownedBlankIn,"
			+ " setWorkspaceList: (items) => { workspaceListOf = () => items; } };",
		sandbox,
	);
	return { sandbox, store, api: sandbox.__api };
}

let failures = 0;
function check(name, condition, detail) {
	if (condition) {
		console.log("  ok   " + name);
		return;
	}
	failures += 1;
	console.error("  FAIL " + name + (detail === undefined ? "" : "  —— " + detail));
}

const BLANK = { blank: true, origin: "user" };
const LIVE = { blank: false, origin: "user" };
const SUBCON = { blank: false, origin: "subagent" };

// ---- 1. 播种：只挑顶层会话，一席一会话 ------------------------------------
{
	const { store, api } = makeSandbox();
	const ids = ["a", "b", "sub"];
	const byId = { a: LIVE, b: LIVE, sub: SUBCON };
	const bind = api.reconcile(ids, byId, true, "a");
	const seats = api.SEATS.map((s) => s.id);
	check("播种：只认顶层会话", Object.values(bind).every((v) => v !== "sub"), JSON.stringify(bind));
	check("播种：不重复占用同一个会话", new Set(Object.values(bind)).size === Object.values(bind).length);
	check("播种：两席各自就位", seats[0] === "hanzhongli" && bind.hanzhongli === "a" && bind.ludongbin === "b", JSON.stringify(bind));
	check("播种：写回 localStorage", store.get("dsh-agent-grid.bindings.v3").includes('"seeded":true'));
}

// ---- 2. 列表未就绪时一律不动（首次渲染会拿空列表来裁决）--------------------
{
	const { api } = makeSandbox();
	api.reconcile(["a"], { a: LIVE }, true, "a");
	const after = api.reconcile([], {}, false, undefined);
	check("未就绪：不清绑定", after.hanzhongli === "a", JSON.stringify(after));
}

// ---- 3. 空白槽的清理，只发生在「current 也是空白槽」时 ----------------------
{
	// 3a. current 换成了**另一个空白槽** —— 这是 connectWorkspace 弹跳的现场，照旧清理
	const { api } = makeSandbox();
	api.reconcile(["a", "b"], { a: BLANK, b: BLANK }, true, "a");
	const bind = api.reconcile(["a", "b"], { a: BLANK, b: BLANK }, true, "b");
	check("空白槽：current 换成另一个空白槽时，旧的解绑", bind.hanzhongli === undefined, JSON.stringify(bind));

	// 3b. current 换成了**正常会话** —— 用户只是切走看一眼，空白槽必须留住。
	// 真机复现过：按旧写法这里会解绑，于是那一席的对话在八席看板上消失，
	// 只能在默认侧栏（selected blank 可见）里找回来。
	const kept = makeSandbox();
	kept.api.reconcile(["a", "b"], { a: BLANK, b: LIVE }, true, "a");
	const after = kept.api.reconcile(["a", "b"], { a: BLANK, b: LIVE }, true, "b");
	check("空白槽：current 是正常会话时不解绑（本次修复）", after.hanzhongli === "a", JSON.stringify(after));
}

// ---- 4. 本次修复：current 为空时不得清空任何绑定 ----------------------------
{
	const { api } = makeSandbox();
	// 钟离席持有一个空白槽（待命，且是 current），洞宾席持有一个活会话。
	api.reconcile(["a", "b"], { a: BLANK, b: LIVE }, true, "a");
	const before = api.reconcile(["a", "b"], { a: BLANK, b: LIVE }, true, "a");
	check("前置：空白槽归 current 那一席", before.hanzhongli === "a" && before.ludongbin === "b", JSON.stringify(before));

	// 平台 sessions.clear()：current 变 undefined —— 用户正看着「选择工作目录」。
	// 旧实现在这里会把 hanzhongli 的空白槽一并删掉，于是那一席再也回不到自己的会话。
	const after = api.reconcile(["a", "b"], { a: BLANK, b: LIVE }, true, undefined);
	check("current 为空：不清绑定（本次修复）", after.hanzhongli === "a" && after.ludongbin === "b", JSON.stringify(after));

	// current 落到**另一个空白槽**时，别的空白槽仍然照常解绑；正常会话不受影响
	const restored = api.reconcile(["a", "b", "c"], { a: BLANK, b: LIVE, c: BLANK }, true, "c");
	check("current 落在另一个空白槽：裁决照旧生效",
		restored.hanzhongli === undefined && restored.ludongbin === "b", JSON.stringify(restored));
}

// ---- 5. 会话消失 / 变成子会话 → 解绑 --------------------------------------
{
	const { api } = makeSandbox();
	api.reconcile(["a", "b"], { a: LIVE, b: LIVE }, true, "a");
	const gone = api.reconcile(["b"], { b: LIVE }, true, "a");
	check("会话没了：解绑", gone.hanzhongli === undefined, JSON.stringify(gone));
	const sub = api.reconcile(["b"], { b: SUBCON }, true, "a");
	check("会话变成子会话：解绑", sub.ludongbin === undefined, JSON.stringify(sub));
}

// ---- 6. claim 的形状：canonical 的 WorkspaceView 是主判据 --------------------
{
	const { api } = makeSandbox();
	const t = api.claimTarget("hanzhongli", { workspaceId: "ws-1", path: "/private/tmp/x" });
	check("claim：从 WorkspaceView 取到 workspaceId", t.workspaceId === "ws-1", JSON.stringify(t));
	check("claim：从 WorkspaceView 取到 canonical path", t.cwd === "/private/tmp/x", JSON.stringify(t));

	const bare = api.claimTarget("hanzhongli", "/tmp/x");
	check("claim：仍接受裸 cwd 字符串（无 workspaceId）",
		bare.workspaceId === null && bare.cwd === "/tmp/x", JSON.stringify(bare));
	check("claim：空值不会造出假 workspaceId",
		api.claimTarget("hanzhongli", undefined).workspaceId === null);
}

// ---- 7. 换目录后认领：路径形式不同也得认得上（走 host membership）-----------
// 这条钉的是一个真实丢对话的 bug：换目录时曾经把 pickDirectory() 的**原始**路径
// 拿去和 host 的 canonical cwd 比字符串 —— 路径含符号链接（macOS 的 /tmp、/var、
// /Volumes/...）时恒不匹配，新会话没有任何席位认领 = 八席里"这条对话不见了"。
{
	const { api } = makeSandbox();
	api.setWorkspaceList([{ workspaceId: "ws-1", path: "/private/tmp/x", sessionIds: ["s1"] }]);
	const claim = api.claimTarget("hanzhongli", { workspaceId: "ws-1", path: "/private/tmp/x" });

	// summary.cwd 故意给成"用户选的原始路径"，模拟未 realpath 的形式
	check("路径形式不同也能认领（判据是 membership，不是字符串）",
		api.inClaimWorkspace(claim, "s1", { cwd: "/tmp/x" }) === true);
	check("不在目标工作区的会话不认领",
		api.inClaimWorkspace(claim, "s-elsewhere", { cwd: "/private/tmp/x" }) === false);
	api.setWorkspaceList([]);
	check("工作区列表未就绪：不认领（继续等，不丢弃）",
		api.inClaimWorkspace(claim, "s1", { cwd: "/private/tmp/x" }) === false);
}

// ---- 8. summary.cwd 尚未投影时，不判为"不匹配" ------------------------------
// `SessionSummary.cwd` 是可选项，新会话刚建好那一刻可能还没有值。
// 旧实现拿 undefined 去比字符串 = 恒不等 -> 认领被卡到 TTL 过期。
{
	const { api } = makeSandbox();
	const bare = api.claimTarget("hanzhongli", "/tmp/x");
	check("cwd 未投影 -> 放行（无法证伪就别判死）",
		api.inClaimWorkspace(bare, "s1", { blank: true }) === true);
	check("兜底：cwd 可比时照旧比较（原有防错没被削弱）",
		api.inClaimWorkspace(bare, "s1", { cwd: "/tmp/x" }) === true
			&& api.inClaimWorkspace(bare, "s1", { cwd: "/tmp/y" }) === false);
	check("兜底：claim 没有 cwd 时放行",
		api.inClaimWorkspace(api.claimTarget("hanzhongli", undefined), "s1", { cwd: "/tmp/y" }) === true);
}

// ---- 9. 新建时不得端走别人的待命槽 ------------------------------------------
// 真机现象：**从八席起的对话被挪到别的格子**。机制是平台的 connectWorkspace() 会复用
// 「该工作区第一个 blank 会话」，而八席里「待命」是正式状态、多个席各自持有空白槽是常态 ——
// 于是复用到别人的槽上，认领再把它从原席移走。修复：发起新建前先探这个判据，有主就自己造。
{
	const { api } = makeSandbox();
	const bind = { hanzhongli: "s-other" };
	const ws = { workspaceId: "ws-1", path: "/p", sessionIds: ["s-blank-orphan", "s-other", "s-live"] };
	const snap = (entries) => ({ ids: Object.keys(entries), byId: entries });

	check("认出别人的待命槽（blank + 有主）",
		api.ownedBlankIn(ws, snap({ "s-other": { blank: true } }), bind)?.id === "hanzhongli");
	check("无主的 blank 不算 —— 平台复用它本来就是设计（空席新建走这条路）",
		api.ownedBlankIn(ws, snap({ "s-blank-orphan": { blank: true } }), {}) === null);
	check("有主但不是 blank（跑着任务）不算 —— 平台不会复用它",
		api.ownedBlankIn(ws, snap({ "s-other": { blank: false } }), bind) === null);
	check("有主的 blank 但不属于这个工作区 -> 不算（平台也不会端它）",
		api.ownedBlankIn({ workspaceId: "ws-2", path: "/q", sessionIds: ["s-x"] },
			snap({ "s-other": { blank: true } }), bind) === null);
	check("工作区解析不出来时不算（列表未就绪不误判）",
		api.ownedBlankIn(undefined, snap({ "s-other": { blank: true } }), bind) === null);
}

console.log(failures === 0 ? "\nreconcile: 全部通过" : `\nreconcile: ${failures} 项失败`);
process.exit(failures === 0 ? 0 : 1);
