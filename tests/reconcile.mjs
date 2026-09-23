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

const seatBlock = slice("const SEATS = [", "// ---- 槽位绑定");
const bindingBlock = slice("const BIND_KEY =", "/**\n\t\t * 一个会话能不能坐进席位");
const eligibleBlock = slice("/**\n\t\t * 一个会话能不能坐进席位", "/**\n\t\t * 席位绑定。三条规则");
const reconcileBlock = slice("/**\n\t\t * 席位绑定。三条规则", "/** 清空一席：解绑当前会话");

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
		[seatBlock, bindingBlock, eligibleBlock, reconcileBlock].join("\n")
			+ "\nglobalThis.__api = { SEATS, reconcile, readStore, writeStore };",
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

// ---- 3. 非 current 的空白槽一律解绑 ----------------------------------------
{
	const { api } = makeSandbox();
	api.reconcile(["a", "b"], { a: BLANK, b: LIVE }, true, "a");
	const bind = api.reconcile(["a", "b"], { a: BLANK, b: LIVE }, true, "b");
	check("空白槽：current 易主后旧的解绑", bind.hanzhongli === undefined, JSON.stringify(bind));
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

	// current 回来（落在别处）之后，非 current 的空白槽仍然照常解绑 —— 旧规则没被削弱
	const restored = api.reconcile(["a", "b"], { a: BLANK, b: LIVE }, true, "b");
	check("current 恢复：裁决照旧生效", restored.hanzhongli === undefined && restored.ludongbin === "b", JSON.stringify(restored));
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

console.log(failures === 0 ? "\nreconcile: 全部通过" : `\nreconcile: ${failures} 项失败`);
process.exit(failures === 0 ? 0 : 1);
