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
import { existsSync, readdirSync, mkdirSync, readFileSync } from "node:fs";
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


// ---- 真像素采样 -------------------------------------------------------------
/**
 * Node 没有内置 PNG 解码器 —— 让**浏览器**去解码：把截图当 data URL 画进 canvas，
 * 再读 ImageData。这样拿到的就是最终渲染出来的像素，而不是"计算样式说它应该是"。
 * 返回 { points, region } 两个采样器：点采样 + 区域统计（对比度/方差）。
 */
async function makeSampler(context) {
	const page = await context.newPage();
	await page.setContent('<body style="margin:0;background:#000"><canvas id="c"></canvas></body>');
	return async (pngBuffer, request) => page.evaluate(async ({ dataUrl, request }) => {
		const img = new Image();
		img.src = dataUrl;
		await img.decode();
		const canvas = document.getElementById("c");
		canvas.width = img.naturalWidth;
		canvas.height = img.naturalHeight;
		const ctx = canvas.getContext("2d", { willReadFrequently: true });
		ctx.drawImage(img, 0, 0);
		const lum = ([r, g, b]) => {
			const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
			return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
		};
		/** 坐标必须是有限数：不然 getImageData 会抛「Value is not of type long」这种看不懂的错。 */
		const px = (v) => {
			const n = Number(v);
			if (!Number.isFinite(n)) throw new Error("采样坐标不是数字: " + JSON.stringify(v));
			return Math.round(n);
		};
		const out = { size: [canvas.width, canvas.height] };
		if (request.points) {
			out.points = request.points.map(([x, y]) => {
				const d = ctx.getImageData(px(x), px(y), 1, 1).data;
				return [d[0], d[1], d[2], d[3]];
			});
		}
		if (request.regions) {
			out.regions = request.regions.map((r) => {
				const x = Math.max(0, px(r.x)); const y = Math.max(0, px(r.y));
				const w = Math.max(1, px(r.w)); const h = Math.max(1, px(r.h));
				const data = ctx.getImageData(x, y, w, h).data;
				const lums = [];
				let rs = 0, gs = 0, bs = 0, n = 0;
				for (let i = 0; i < data.length; i += 4) {
					lums.push(lum([data[i], data[i + 1], data[i + 2]]));
					rs += data[i]; gs += data[i + 1]; bs += data[i + 2]; n += 1;
				}
				lums.sort((a, b) => a - b);
				const at = (q) => lums[Math.min(lums.length - 1, Math.floor(q * lums.length))];
				const mean = rs / n / 255 * 0.2126 + gs / n / 255 * 0.7152 + bs / n / 255 * 0.0722;
				let varSum = 0;
				for (const l of lums) varSum += (l - mean) * (l - mean);
				const lo = at(0.01); const hi = at(0.99);
				return {
					n, mean: Number(mean.toFixed(4)),
					std: Number(Math.sqrt(varSum / lums.length).toFixed(4)),
					lo: Number(lo.toFixed(4)), hi: Number(hi.toFixed(4)),
					contrast: Number(((hi + 0.05) / (lo + 0.05)).toFixed(2)),
				};
			});
		}
		return out;
	}, { dataUrl: "data:image/png;base64," + pngBuffer.toString("base64"), request });
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
// 显式建 context：采样器要用它再开一个页面去解码 PNG（browser.newPage 的隐式 context 不给开新页）。
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
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
				accent: cs.getPropertyValue("--dsx-accent").trim(),
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

	const sampler = await makeSampler(context);
	const SHOTS = process.env.SMOKE_SHOTS ?? "/tmp/dsh-agent-grid-shots";

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

	// ---- 4 VIS 断言（原 §6「人工设备验收」全部改成可判定的）----
	section("4 VIS-01/02/03/05（几何与颜色：不需要人眼）");
	{
		// VIS-05：卡片强调色必须与源码里的 SEATS 表逐字一致（松绿 vs 靛蓝必须可分辨）
		const seatsSrc = readFileSync(join(here, "..", "src", "client.template.js"), "utf8");
		const expected = [...seatsSrc.matchAll(/\{ id: "(\w+)",\s+key: "[^"]+", name: "([^"]+)", role: "[^"]+", color: "(#[0-9A-Fa-f]{6})"/g)]
			.map((m) => ({ id: m[1], name: m[2], color: m[3].toUpperCase() }));
		check("从源码解析出 8 席与各自主色", expected.length === 8, `解析到 ${expected.length} 条`);
		const rendered = probe.cards.map((c) => ({ name: c.name, accent: (c.accent ?? "").toUpperCase() }));
		const mismatched = expected.filter((e) => !rendered.some((r) => r.name === e.name && r.accent === e.color));
		check("8 席主色与 SEATS 表逐字一致（含 #3F7A55 松绿 / #3F4F9C 靛蓝）",
			mismatched.length === 0, JSON.stringify(mismatched));
		const greens = probe.cards.filter((c) => (c.accent ?? "").toUpperCase() === "#3F7A55");
		const blues = probe.cards.filter((c) => (c.accent ?? "").toUpperCase() === "#3F4F9C");
		check("松绿与靛蓝确实同时在场且是两种颜色",
			greens.length >= 1 && blues.length >= 1, `绿 ${greens.length} / 蓝 ${blues.length}`);

		// VIS-03：像素头像必须落在 24 网格上 —— 即「框 / viewBox」是**整数倍**。
		// （形状是 SVG + symbol，不是背景图；只看框尺寸会漏掉"框对但缩放非整数"这种糊法。）
		const avatars = await page.evaluate(() => {
			const read = (el, where) => {
				if (el === null) return null;
				const r = el.getBoundingClientRect();
				const vb = (el.getAttribute("viewBox") ?? "").split(/\s+/).map(Number);
				return {
					where,
					box: [Math.round(r.width), Math.round(r.height)],
					viewBox: vb.join(" "),
					scale: vb[2] > 0 ? [r.width / vb[2], r.height / vb[3]] : null,
					uses: [...el.querySelectorAll("use")].map((u) => [u.getAttribute("width"), u.getAttribute("height")]),
					anims: el.getAnimations({ subtree: true }).length,
				};
			};
			return {
				card: read(document.querySelector(".dsx-card .dsx-av"), "卡片舞台"),
				badge: read(document.querySelector(".dsx-badge .dsx-av"), "对话头徽章"),
			};
		});
		for (const [where, a] of Object.entries(avatars)) {
			if (a === null) { skip(`${where}的整数倍缩放`, "当前页面没有这个元素"); continue; }
			const [sx, sy] = a.scale ?? [0, 0];
			check(`${where}：框/viewBox 是整数倍（${a.box.join("×")} / viewBox ${a.viewBox} = ${sx}×${sy}）`,
				Number.isInteger(sx) && sx === sy && sx >= 1, JSON.stringify(a));
			check(`${where}：每个 <use> 都显式声明画布视口（否则 symbol 会按外层视口重缩放）`,
				a.uses.length > 0 && a.uses.every(([w, h]) => Number(w) > 0 && Number(h) > 0), JSON.stringify(a.uses));
		}
		check("卡片舞台必须是画布 2×（112×48）",
			avatars.card !== null && avatars.card.box[0] === 112 && avatars.card.box[1] === 48,
			JSON.stringify(avatars.card && avatars.card.box));

		// VIS-04（UI 半边）：没有空白格 + 运功态真的有动画在跑
		const spriteUI = await page.evaluate(() => [...document.querySelectorAll(".dsx-card")].map((c) => {
			const av = c.querySelector(".dsx-av");
			const cls = [...c.classList];
			const uses = av === null ? [] : [...av.querySelectorAll("use")];
			return {
				name: (c.querySelector(".dsx-name")?.textContent ?? "").trim(),
				working: cls.includes("is-working"),
				uses: uses.length,
				resolved: uses.filter((u) => document.querySelector(u.getAttribute("href")) !== null).length,
				anims: av === null ? 0 : av.getAnimations({ subtree: true }).length,
			};
		}));
		check("没有空白格：每张卡的头像都有解析得到的 sprite 图层",
			spriteUI.length === 8 && spriteUI.every((s) => s.uses >= 2 && s.resolved === s.uses),
			JSON.stringify(spriteUI.filter((s) => s.uses < 2 || s.resolved !== s.uses)));
		const workingUI = spriteUI.filter((s) => s.working);
		if (workingUI.length > 0) {
			check("运功态真的有动画在跑（不是静止帧）", workingUI.every((s) => s.anims >= 1),
				JSON.stringify(workingUI));
		} else {
			skip("运功态动画", "当前没有运功中的席位");
		}

		// VIS-01 / VIS-02：两种宽度下姓名都在、不截断，且窄宽度下一屏放得下
		for (const [w, h] of [[1280, 900], [1100, 800]]) {
			await page.setViewportSize({ width: w, height: h });
			await page.waitForTimeout(400);
			const m = await page.evaluate(() => {
				const cards = [...document.querySelectorAll(".dsx-card")];
				const names = cards.map((c) => {
					const el = c.querySelector(".dsx-name");
					if (el === null) return null;
					const cs = getComputedStyle(el);
					return {
						text: (el.textContent ?? "").trim(),
						visible: cs.display !== "none" && cs.visibility !== "hidden" && el.getBoundingClientRect().width > 0,
						clipped: el.scrollWidth > el.clientWidth + 1,
					};
				});
				const grid = document.querySelector(".dsx-grid");
				return {
					names,
					overflowY: grid === null ? null : grid.scrollHeight - grid.clientHeight,
					gridBox: grid === null ? null : { h: grid.clientHeight, sh: grid.scrollHeight },
				};
			});
			check(`${w}px：8 张卡的姓名都可见`, m.names.length === 8 && m.names.every((n) => n && n.visible && n.text.length > 0),
				JSON.stringify(m.names.filter((n) => !n || !n.visible || n.text.length === 0)));
			check(`${w}px：姓名没有被截断（scrollWidth ≤ clientWidth）`,
				m.names.every((n) => n !== null && !n.clipped), JSON.stringify(m.names.filter((n) => n && n.clipped)));
			check(`${w}px：八席一屏放得下、无纵向滚动条（溢出 ${m.overflowY}px，收起次要行是设计）`,
				m.overflowY !== null && m.overflowY <= 1, JSON.stringify(m.gridBox));
		}
		await page.setViewportSize({ width: 1280, height: 900 });
		await page.waitForTimeout(400);
	}

	// ---- 4b 窄轨模式（≤1000px 时宿主收起侧栏，插件切窄轨）----
	section("4b 窄轨模式（≤1000px）：1× 裁切 + 静态徽章");
	{
		await page.setViewportSize({ width: 900, height: 860 });
		await page.waitForTimeout(600);
		const rail = await page.evaluate(() => {
			const btns = [...document.querySelectorAll(".dsx-railbtn")];
			return {
				buttons: btns.length,
				active: btns.filter((b) => b.classList.contains("is-active")).length,
				titles: btns.map((b) => b.getAttribute("title") || ""),
				chips: btns.map((b) => {
					const chip = b.querySelector(".dsx-av");
					if (chip === null) return null;
					const r = chip.getBoundingClientRect();
					const vb = (chip.getAttribute("viewBox") ?? "").split(/\s+/).map(Number);
					return {
						box: [Math.round(r.width), Math.round(r.height)],
						viewBox: vb.join(" "),
						scale: vb[2] > 0 ? [r.width / vb[2], r.height / vb[3]] : null,
						uses: [...chip.querySelectorAll("use")].every((u) => Number(u.getAttribute("width")) > 0),
						anims: chip.getAnimations({ subtree: true }).length,
					};
				}),
			};
		});
		check(`窄轨渲染 8 个席位按钮（实际 ${rail.buttons}），且恰好一个选中（实际 ${rail.active}）`,
			rail.buttons === 8 && rail.active === 1);
		check("窄轨里姓名走 title（窄轨是「看得见谁在等」而不是「看得见全名」）",
			rail.titles.every((t) => t.split(" · ")[0].length > 0), JSON.stringify(rail.titles.slice(0, 3)));
		const chips = rail.chips.filter((c) => c !== null);
		check("每个 chip 都是 24×24 开在 24 列窗上 = 1× 整数倍（0.43× 缩放就是糊）",
			chips.length === 8 && chips.every((c) => c.scale !== null && c.scale[0] === 1 && c.scale[1] === 1),
			JSON.stringify(chips.slice(0, 2)));
		check("chip 里的 <use> 都显式声明画布视口（否则 symbol 按外层视口重缩放）",
			chips.every((c) => c.uses === true));
		// 裁切窗口只有 24 列，而编排有 ±8 格走位 —— 窄轨必须静态，否则小人走出窗口被切
		check("窄轨是静态徽章（无动画）：不然走位会把小人切出 24 列窗口",
			chips.every((c) => c.anims === 0), JSON.stringify(chips.map((c) => c.anims).slice(0, 4)));
		await page.setViewportSize({ width: 1280, height: 900 });
		await page.waitForTimeout(500);
	}

	// ---- 5 像素级视觉断言（矩阵里最接近"人眼"的那一层）----
	section("5 像素断言（真渲染出来的像素，不是计算样式）");
	{
		mkdirSync(SHOTS, { recursive: true });
		const boardShot = join(SHOTS, "board.png");
		await page.screenshot({ path: boardShot });
		const boardPng = readFileSync(boardShot);

		const activeCard = probe.cards.find((c) => c.cls.includes("is-active"));
		if (activeCard === undefined) {
			skip("选中卡色条的像素颜色", "当前没有选中卡");
		} else {
			const cardClip = { x: activeCard.rect.x, y: activeCard.rect.y, width: activeCard.rect.w, height: activeCard.rect.h };
			const shot = await page.screenshot({ clip: cardClip });
			const want = parseColor(activeCard.brand);
			const got = (await sampler(shot, { points: [[1.5, cardClip.height / 2]] })).points[0];
			const ok = want !== undefined
				&& Math.abs(got[0] - want[0]) <= 26 && Math.abs(got[1] - want[1]) <= 26 && Math.abs(got[2] - want[2]) <= 26;
			check(`选中卡左色条的像素就是强调色（want=${activeCard.brand} got=rgb(${got.slice(0, 3)})）`, ok);

			// 姓名那一行的像素对比度（字形核心 vs 背景）：暗色文字太暗那次就是这么漏的
			const nameBox = await page.evaluate(() => {
				const card = document.querySelector(".dsx-card.is-active");
				const el = card === null ? null : card.querySelector(".dsx-name");
				if (el === null) return null;
				const r = el.getBoundingClientRect();
				return { x: r.x, y: r.y, width: r.width, height: r.height };
			});
			if (nameBox === null || nameBox.width < 4 || nameBox.height < 4) {
				skip("选中卡姓名像素对比度", "量不到姓名元素");
			} else {
				const nameShot = await page.screenshot({ clip: nameBox });
				const st = (await sampler(nameShot, {
					regions: [{ x: 0, y: 0, w: nameBox.width, h: nameBox.height }],
				})).regions[0];
				check(`选中卡姓名像素对比度 ≥ 4.5:1（实测 ${st.contrast}:1）`, st.contrast >= 4.5, JSON.stringify(st));
			}
		}

		// 卡片必须透：拿卡片内部的像素跟侧栏背景比，两者不该是同一种平色
		const anyCard = probe.cards[0];
		const cardShot = await page.screenshot({
			clip: { x: anyCard.rect.x, y: anyCard.rect.y, width: anyCard.rect.w, height: anyCard.rect.h },
		});
		const inner = (await sampler(cardShot, {
			regions: [{ x: anyCard.rect.w * 0.35, y: anyCard.rect.h * 0.55, w: 16, h: 16 }],
		})).regions[0];
		if (probe.layerOn) {
			console.log(`  · 卡内 16×16 区域：std=${inner.std}（>0 说明卡面之下有内容，不是纯色块）`);
			check("卡面不是纯色块（下方山水/纹理能透出来）", inner.std > 0.002, JSON.stringify(inner));
		} else {
			// 没装主题时卡面之下本来就是宿主的纯色背景 —— 这条在这里没有意义，别误判成失败。
			skip("卡面不是纯色块", "宋律主题未启用（卡面之下没有山水可透）");
		}
	}

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
