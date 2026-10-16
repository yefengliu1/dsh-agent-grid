/**
 * UI 冒烟 —— 连到**正在跑的** GUI，断言今天真机肉眼发现的四条 UI 契约。
 *
 * 为什么需要这一层：`tests/contract.mjs` 只能证明"源码/事件层面是对的"，
 * 而下面这些失败**只在真实渲染里成立** —— 它们今天全都是靠人眼看出来的：
 *   1. 侧栏左右内缩不对称（宿主的负 margin 把 `.dsx-root` 的 padding 放大成 左 16 / 右 4）；
 *   2. 选中态压根不亮（`is-active` 从来没出现过）；
 *   3. 选中态与「待答」共用同一条视觉通道（同形不同色 + 每席身份色，暗色下分不出）；
 *   4. 卡面不透明，把主题的山水全挡住。
 *
 * 用法：
 *   node tests/ui-smoke.mjs                     # 默认 http://localhost:8080/
 *   DSH_UI_URL=http://127.0.0.1:3080/?token=… node tests/ui-smoke.mjs
 *   SMOKE_SHOT=/tmp/board.png node tests/ui-smoke.mjs
 *   SMOKE_REQUIRE_ACTIVE=1 node tests/ui-smoke.mjs   # 没有选中卡就算失败（真实 GUI 上跑）
 *
 * 依赖：playwright。优先 `import("playwright")`；本地没装则退到 npx 缓存里已装的那份
 * （开发者机器上通常已经有，不必再下一次浏览器）。
 */
import { createRequire } from "node:module";
import { existsSync, readdirSync, mkdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import os from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const URL_ = process.env.DSH_UI_URL ?? "http://localhost:8080/";
const SHOT = process.env.SMOKE_SHOT ?? "/tmp/dsh-agent-grid-smoke.png";
const REQUIRE_ACTIVE = process.env.SMOKE_REQUIRE_ACTIVE === "1";

/**
 * 收集所有可用的 playwright 副本（正规依赖优先，然后是 npx 缓存里的若干份）。
 * 返回候选数组而不是单个：本地常见的坑是「版本对、浏览器没装」——
 * 所以由调用方逐个 launch，谁能起来用谁。
 */
async function playwrightCandidates() {
	const normalize = (mod) =>
		mod && mod.chromium ? mod : (mod && mod.default && mod.default.chromium ? mod.default : undefined);
	const out = [];
	const seen = new Set();
	const push = (mod, label) => {
		const found = normalize(mod);
		if (found !== undefined && !seen.has(label)) { seen.add(label); out.push({ pw: found, label }); }
	};
	try { push(await import("playwright"), "dependencies"); } catch { /* 继续 */ }
	const roots = [];
	if (process.env.PLAYWRIGHT_ROOT) roots.push(process.env.PLAYWRIGHT_ROOT);
	const npx = join(os.homedir(), ".npm", "_npx");
	if (existsSync(npx)) {
		for (const dir of readdirSync(npx)) {
			const mods = join(npx, dir, "node_modules");
			if (existsSync(join(mods, "playwright"))) roots.push(mods);
		}
	}
	for (const root of roots) {
		try {
			const require = createRequire(join(root, "noop.js"));
			push(await import(pathToFileURL(require.resolve("playwright")).href), root);
		} catch { /* 换下一个 */ }
	}
	if (out.length === 0) {
		throw new Error("找不到 playwright —— 装 `npm i -D playwright` 或设 PLAYWRIGHT_ROOT=<dir with playwright>");
	}
	return out;
}


/** 关掉挡路的浮层（首次运行的 Preview 公告、设置弹窗等）。
 *  CI 上是全新 profile → 「Preview Notice」必然出现，不处理会把所有点击卡死 30s。 */
async function dismissOverlays(page) {
	for (let i = 0; i < 3; i += 1) {
		const mask = await page.locator('[aria-hidden="true"][class*="_mask"]').count();
		if (mask === 0) return;
		const primary = page.locator('button[class*="_primary_"]').last();
		if (await primary.count() > 0) {
			await primary.click({ timeout: 3000 }).catch(() => {});
			await page.waitForTimeout(200);
			continue;
		}
		await page.keyboard.press("Escape").catch(() => {});
		await page.waitForTimeout(200);
	}
}

let failures = 0;
let checks = 0;
let skipped = 0;
function check(name, ok, detail = "") {
	checks += 1;
	if (ok) { console.log("  ✓ " + name); return; }
	failures += 1;
	console.log("  ✗ " + name + (detail ? "  —— " + detail : ""));
}
function skip(name, why) {
	skipped += 1;
	console.log("  · " + name + "（跳过：" + why + "）");
}
function section(t) { console.log("\n" + t); }

// ---- 颜色小工具 -----------------------------------------------------------
// 计算样式可能是 #RRGGBB / rgb() / rgba() / color(srgb …) / oklab(… / α) 多种形状：
// 「取 alpha」与「比较颜色」分开处理 —— oklab 那种只取 alpha。
function parseColor(value) {
	if (typeof value !== "string") return undefined;
	const hex = /^#([0-9a-f]{6})$/i.exec(value.trim());
	if (hex !== null) {
		const n = parseInt(hex[1], 16);
		return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
	}
	const srgb = /color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)/.exec(value);
	if (srgb !== null) {
		return [Number(srgb[1]) * 255, Number(srgb[2]) * 255, Number(srgb[3]) * 255, srgb[4] === undefined ? 1 : Number(srgb[4])];
	}
	const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)/.exec(value);
	if (m !== null) return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])];
	return undefined;
}
/** 只取 alpha：任何形状都认（rgb / color(srgb …) / oklab(… / α)）；缺省视为不透明。 */
function alphaOf(value) {
	if (typeof value !== "string") return 1;
	const slash = /\/\s*([\d.]+%?)\s*\)\s*$/.exec(value.trim());
	if (slash !== null) return slash[1].endsWith("%") ? Number(slash[1].slice(0, -1)) / 100 : Number(slash[1]);
	const rgba = /rgba\(\s*[\d.]+[,\s]+[\d.]+[,\s]+[\d.]+[,\s]+([\d.]+)\s*\)/.exec(value);
	if (rgba !== null) return Number(rgba[1]);
	return 1;
}
const sameColor = (a, b, tol = 8) => {
	const x = parseColor(a); const y = parseColor(b);
	if (x === undefined || y === undefined) return false;
	return Math.abs(x[0] - y[0]) <= tol && Math.abs(x[1] - y[1]) <= tol && Math.abs(x[2] - y[2]) <= tol;
};

/** 逐个候选 launch：本地常有「playwright 版本与已下载浏览器不匹配」的情况。 */
let browser;
let launchedWith = "";
const launchErrors = [];
for (const { pw, label } of await playwrightCandidates()) {
	try {
		browser = await pw.chromium.launch();
		launchedWith = label;
		break;
	} catch (error) {
		launchErrors.push(`${label}: ${String(error.message).split("\n")[0]}`);
	}
}
if (browser === undefined) {
	console.error("没有可用的 playwright 浏览器：\n  " + launchErrors.join("\n  "));
	console.error("修：npx playwright install chromium（或设 PLAYWRIGHT_ROOT 指向已装浏览器的那份）");
	process.exit(1);
}
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
try {
	const res = await page.goto(URL_, { waitUntil: "domcontentloaded" });
	check(`打开 GUI（HTTP ${res === null ? "?" : res.status()}）`, res !== null && res.status() < 400, URL_);
	await page.waitForSelector(".dsx-card", { timeout: 15000 }).catch(() => {});
	// 卡片的边框/底色带 .12s transition，插件也可能刚重挂 —— 等它落定再采样，
	// 否则会读到过渡中间色（实测读到过 rgba(166,195,199,0.28) 这种非终值）。
	await dismissOverlays(page);
	await page.waitForTimeout(700);

	// ---- 0 前置：八席模式确实在跑 ----
	section("0 前置");
	const gridMode = await page.evaluate(() => document.documentElement.classList.contains("dsx-grid-mode"));
	check("插件处于八席模式（html.dsx-grid-mode）", gridMode, "插件没加载 / 已被设置切回原生侧栏？");

	const probeBoard = () => page.evaluate(() => {
		const num = (v) => Math.round(v * 10) / 10;
		const rect = (el) => { const r = el.getBoundingClientRect(); return { x: num(r.x), y: num(r.y), w: num(r.width), right: num(r.right), h: num(r.height) }; };
		const sidebar = document.querySelector('[class*="_sidebarCol"]');
		const grid = document.querySelector(".dsx-grid");
		const head = document.querySelector(".dsx-head");
		const cards = [...document.querySelectorAll(".dsx-card")];
		const info = (c) => {
			const cs = getComputedStyle(c);
			const before = getComputedStyle(c, "::before");
			const nameEl = c.querySelector(".dsx-name");
			const brand = cs.getPropertyValue("--dsw-alias-brand-primary").trim();
			return {
				cls: [...c.classList].filter((x) => x !== "dsx-card"),
				name: (nameEl?.textContent ?? "").trim(),
				rect: rect(c),
				bg: cs.backgroundColor,
				border: cs.borderColor,
				nameColor: nameEl === null ? null : getComputedStyle(nameEl).color,
				anim: cs.animationName,
				rail: before.content === "none" ? null : { w: before.width, bg: before.backgroundColor },
				brand,
				errorColor: cs.getPropertyValue("--dsw-alias-state-error-primary").trim(),
			};
		};
		return {
			layerOn: document.documentElement.dataset.songgridTheme === "on",
			dark: document.body.hasAttribute("data-ds-dark-theme"),
			sidebar: sidebar === null ? null : rect(sidebar),
			grid: grid === null ? null : rect(grid),
			head: head === null ? null : rect(head),
			cards: cards.map(info),
		};
	});
	let probe = await probeBoard();

	// ---- 0.5 让选中态出现：点一个「有会话」的席位，把当前主窗口切过去 ----
	section("0.5 选中态（点击席位后必须亮）");
	{
		const before = probe.cards.filter((c) => c.cls.includes("is-active")).length;
		if (before > 0) {
			console.log("  · 已经有选中卡，无需点击");
		} else {
			const clickable = page.locator(".dsx-card:not(.is-empty)").first();
			const count = await page.locator(".dsx-card:not(.is-empty)").count();
			if (count === 0) {
				skip("点击席位后出现选中态", "八席全空（新 profile / CI 环境），没有可打开的会话");
			} else {
				await clickable.click({ timeout: 8000 }).catch((error) => {
					console.log("  · 点击席位失败：" + String(error.message).split("\n")[0]);
				});
				await page.waitForTimeout(900);
				probe = await probeBoard();
				const after = probe.cards.filter((c) => c.cls.includes("is-active")).length;
				check(`点击席位后出现且仅出现一张选中卡（实际 ${after}）`, after === 1,
					"rc.2 的会话列表 store 没有 current —— 老代码读它，卡片一帧都不亮");
			}
		}
	}

	// ---- 1 侧栏内缩对称 ----
	section("1 侧栏内缩（宿主的负 margin 曾把左右放大成 16 / 4）");
	if (probe.sidebar === null || probe.grid === null || probe.cards.length === 0) {
		check("取到侧栏 / 网格 / 卡片几何", false, "DOM 结构变了？");
	} else {
		const left = probe.cards[0].rect.x - probe.sidebar.x;
		const right = probe.sidebar.right - probe.cards[1].rect.right;
		check(`卡片左右内缩对称（左 ${left} / 右 ${right}）`, Math.abs(left - right) <= 1.5);
		if (probe.head !== null) {
			check("表头与卡片同一左右沿",
				Math.abs(probe.head.x - left - probe.sidebar.x) <= 1.5 && Math.abs(probe.head.right - probe.cards[1].rect.right) <= 1.5);
		}
	}

	// ---- 2 卡片与状态 ----
	section("2 卡片与状态通道");
	check(`八席卡片数 = 8（实际 ${probe.cards.length}）`, probe.cards.length === 8);
	check("每张卡都有姓名", probe.cards.every((c) => c.name.length > 0), JSON.stringify(probe.cards.map((c) => c.name)));

	const active = probe.cards.filter((c) => c.cls.includes("is-active"));
	const needsYou = probe.cards.filter((c) => c.cls.includes("is-needs-you"));
	check(`选中态至多一张（实际 ${active.length}）`, active.length <= 1, JSON.stringify(active.map((c) => c.name)));

	if (active.length === 1) {
		const a = active[0];
		check(`选中卡有强调色左色条（${a.name}）`, a.rail !== null && parseFloat(a.rail.w) >= 2 && sameColor(a.rail.bg, a.brand),
			JSON.stringify({ rail: a.rail, brand: a.brand }));
		check("选中卡边框用强调色，而不是「待答」的朱砂色",
			sameColor(a.border, a.brand) && !sameColor(a.border, a.errorColor), JSON.stringify({ border: a.border }));
		check("选中卡姓名用强调色", a.nameColor !== null && sameColor(a.nameColor, a.brand), JSON.stringify({ nameColor: a.nameColor }));
	} else if (REQUIRE_ACTIVE) {
		check("存在一张选中卡（SMOKE_REQUIRE_ACTIVE=1）", false, "当前主窗口的会话不属于任何席位？");
	} else {
		skip("选中卡的三条断言", "当前没有处于选中态的席位");
	}

	for (const c of needsYou) {
		if (c.cls.includes("is-active")) {
			// 当前席同时在等你：色条/边框保持强调色，等待只走外圈脉冲
			check(`「${c.name}」同时是当前席 + 待答：边框仍是强调色`,
				sameColor(c.border, c.brand), `border=${c.border}`);
			check(`「${c.name}」等待改用外圈脉冲（不是覆盖边框的那种）`, c.anim === "dsx-needs-you-active", `anim=${c.anim}`);
		} else {
			check(`「${c.name}」非当前席待答：边框用朱砂色`, sameColor(c.border, c.errorColor), `border=${c.border}`);
		}
	}

	// ---- 3 卡面半透明（只在主题开着时才有意义）----
	section("3 卡面透明度（不透明会把主题的山水全挡住）");
	if (!probe.layerOn) {
		skip("卡面 alpha < 1", "宋律主题未启用（卡面透明与否无意义）");
	} else {
		const opaque = probe.cards.filter((c) => alphaOf(c.bg) >= 1);
		check("所有卡面都带透明度（alpha < 1）", opaque.length === 0,
			JSON.stringify(opaque.map((c) => [c.name, c.bg])));
	}

	// ---- 4 存档截图 ----
	section("4 截图存档");
	mkdirSync(dirname(SHOT), { recursive: true });
	await page.screenshot({ path: SHOT });
	console.log("  · " + SHOT + "   (playwright: " + launchedWith + ")");
} finally {
	await browser.close();
}

console.log(
	failures === 0
		? `\nui-smoke: 全部通过（${checks} 项${skipped > 0 ? `，跳过 ${skipped} 项` : ""}）`
		: `\nui-smoke: ${failures}/${checks} 项失败`,
);
process.exit(failures === 0 ? 0 : 1);
