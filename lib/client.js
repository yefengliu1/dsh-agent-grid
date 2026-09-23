/**
 * 八席 (Eight Seats) —— browser face。
 *
 * 结构对齐 @local/dsh-theme-songgrid 的 lib/client.js：
 *   window.__ModuleLoader__.load({ id, factory })，factory 内做副作用（CSS + sprite 注入），
 *   导出 exports.apply / exports.inject 给 cordis fiber。
 *
 * ── 设计立场（重要）───────────────────────────────────────────────────────
 * **主对话 UI 全部保留原装。** 本插件不注册任何 main 面板、不重写对话、不碰 composer。
 * 席位切换 = `sessions.open(sessionId)` 把该席的会话设为 current，主栏就是原装的 Conversation。
 * 本插件只在原装 UI 上做两处「基于新定位的设计升级」：
 *
 *   1. sidebar.workspaces —— 会话浏览区换成 2x4 的八席网格（常驻身份 + 状态 + 当前动作）
 *   2. conversation.session.header.actions —— 在原装对话头标题旁注入席位徽章，
 *      让「正在跟哪一席说话」这件事在原装 UI 里可见
 *
 * 上一版把主栏做成自制详情页（占位「完整信息区」），等于把原装对话扔了 —— 那是造轮子。
 *
 * 槽位约束（实测）：
 *   - sidebar.workspaces 是 single/root，**必须传 priority: -1**。single slot 每个 priority
 *     只允许一条注册，内置 WorkspaceBrowser 在 priority 0，渲染取 priority 升序的 index 0
 *     （最低者渲染）。不传直接抛 "already has a registration at priority 0"。
 *   - conversation.session.header.actions 是 list/session，owner props 为空，
 *     状态全部来自标准 session props（sessionId / useSession / useProjection）。
 *
 * 注意：浏览器半边是纯 JavaScript，无 JSX、无 TypeScript，一律 React.createElement。
 */
window.__ModuleLoader__.load({
	id: "@local/dsh-agent-grid",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		const React = require("react");
		const h = React.createElement;

		// ---- sprite 表（由 build_client.py 从 design/baxian.py 注入）------------
		const SPRITES = /*__SPRITES__*/ "<svg xmlns=\"http://www.w3.org/2000/svg\" style=\"display:none\" shape-rendering=\"crispEdges\">\n<symbol id=\"hanzhongli-body\" viewBox=\"0 0 56 24\"><path fill=\"#1A1A1A\" d=\"M25 2h2v1h-2zM30 2h2v1h-2zM24 3h3v1h-3zM30 3h3v1h-3zM24 4h1v1h-1zM27 4h1v1h-1zM29 4h1v1h-1zM32 4h1v1h-1zM24 5h1v1h-1zM32 5h1v1h-1zM24 6h1v1h-1zM32 6h1v1h-1zM24 7h1v1h-1zM32 7h1v1h-1zM24 8h1v1h-1zM32 8h1v1h-1zM24 9h1v1h-1zM32 9h1v1h-1zM24 10h1v1h-1zM32 10h1v1h-1zM24 11h1v1h-1zM32 11h1v1h-1zM24 12h1v1h-1zM32 12h1v1h-1zM25 13h1v1h-1zM31 13h1v1h-1zM20 14h1v1h-1zM26 14h1v1h-1zM30 14h1v1h-1zM35 14h1v1h-1zM20 15h1v1h-1zM35 15h1v1h-1zM20 16h1v1h-1zM35 16h1v1h-1zM20 17h1v1h-1zM35 17h1v1h-1zM20 18h1v1h-1zM35 18h1v1h-1zM19 19h1v1h-1zM36 19h1v1h-1zM19 20h1v1h-1zM36 20h1v1h-1zM19 21h1v1h-1zM36 21h1v1h-1zM19 22h1v1h-1zM36 22h1v1h-1z\"/><path fill=\"#3A3330\" d=\"M25 4h2v1h-2zM30 4h2v1h-2zM25 5h7v1h-7zM25 6h7v1h-7zM25 12h1v1h-1zM31 12h1v1h-1zM26 13h5v1h-5zM27 14h3v1h-3z\"/><path fill=\"#C9A47C\" d=\"M25 7h7v1h-7zM28 11h1v1h-1zM27 12h2v1h-2z\"/><path fill=\"#E8C9A0\" d=\"M25 8h7v1h-7zM25 9h1v1h-1zM28 9h1v1h-1zM31 9h1v1h-1zM25 10h1v1h-1zM28 10h1v1h-1zM31 10h1v1h-1zM25 11h3v1h-3zM29 11h3v1h-3zM26 12h1v1h-1zM29 12h2v1h-2z\"/><path fill=\"#2A2A2A\" d=\"M26 9h2v1h-2zM29 9h2v1h-2zM26 10h2v1h-2zM29 10h2v1h-2z\"/><path fill=\"#E3714E\" d=\"M21 14h2v1h-2zM33 14h2v1h-2zM21 15h2v1h-2zM33 15h2v1h-2zM21 16h2v1h-2zM33 16h2v1h-2zM21 17h2v1h-2zM33 17h2v1h-2zM20 19h2v1h-2zM34 19h2v1h-2zM20 20h2v1h-2zM34 20h2v1h-2z\"/><path fill=\"#723927\" d=\"M23 14h1v1h-1zM32 14h1v1h-1zM23 15h1v1h-1zM32 15h1v1h-1zM23 16h1v1h-1zM32 16h1v1h-1zM23 17h1v1h-1zM32 17h1v1h-1zM21 18h12v1h-12zM34 18h1v1h-1zM22 19h1v1h-1zM33 19h1v1h-1zM22 20h1v1h-1zM33 20h1v1h-1zM20 21h16v1h-16zM20 22h16v1h-16z\"/><path fill=\"#A8543A\" d=\"M24 14h2v1h-2zM31 14h1v1h-1zM24 15h8v1h-8zM24 16h8v1h-8zM24 17h8v1h-8zM23 19h10v1h-10zM23 20h10v1h-10z\"/><path fill=\"#8A939C\" d=\"M33 18h1v1h-1z\"/></symbol>\n<symbol id=\"hanzhongli-p-rest\" viewBox=\"0 0 56 24\"><path fill=\"#1A1A1A\" d=\"M35 5h2v1h-2zM34 6h1v1h-1zM37 6h1v1h-1zM33 7h1v1h-1zM37 7h1v1h-1zM32 8h1v1h-1zM37 8h1v1h-1zM32 9h1v1h-1zM37 9h1v1h-1zM32 10h1v1h-1zM37 10h1v1h-1zM32 11h1v1h-1zM37 11h1v1h-1zM33 12h1v1h-1zM37 12h1v1h-1zM33 13h1v1h-1zM36 13h1v1h-1zM34 14h1v1h-1zM36 14h1v1h-1zM35 15h2v1h-2zM35 16h2v1h-2z\"/><path fill=\"#4E8A3F\" d=\"M35 6h2v1h-2zM34 7h1v1h-1zM36 7h1v1h-1zM33 8h2v1h-2zM36 8h1v1h-1zM34 9h1v1h-1zM36 9h1v1h-1zM33 10h2v1h-2zM36 10h1v1h-1zM33 11h2v1h-2zM36 11h1v1h-1zM34 12h1v1h-1zM36 12h1v1h-1zM34 13h1v1h-1z\"/><path fill=\"#2F5A26\" d=\"M35 7h1v1h-1zM35 8h1v1h-1zM35 9h1v1h-1zM35 10h1v1h-1zM35 11h1v1h-1zM35 12h1v1h-1zM35 13h1v1h-1zM35 14h1v1h-1z\"/><path fill=\"#FFFFFF\" d=\"M33 9h1v1h-1z\"/></symbol>\n<symbol id=\"hanzhongli-x-rest\" viewBox=\"0 0 56 24\"></symbol>\n<symbol id=\"hanzhongli-p-work\" viewBox=\"0 0 56 24\"><path fill=\"#FFFFFF\" d=\"M38 1h1v1h-1zM39 2h1v1h-1zM38 3h1v1h-1zM34 6h1v1h-1z\"/><path fill=\"#1A1A1A\" d=\"M34 4h1v1h-1zM38 4h1v1h-1zM33 5h1v1h-1zM38 5h1v1h-1zM33 6h1v1h-1zM38 6h1v1h-1zM33 7h1v1h-1zM38 7h1v1h-1zM33 8h1v1h-1zM38 8h1v1h-1zM34 9h1v1h-1zM38 9h1v1h-1zM34 10h1v1h-1zM37 10h1v1h-1zM35 11h1v1h-1zM37 11h1v1h-1zM36 12h2v1h-2zM36 13h2v1h-2z\"/><path fill=\"#4E8A3F\" d=\"M35 4h1v1h-1zM37 4h1v1h-1zM34 5h2v1h-2zM37 5h1v1h-1zM35 6h1v1h-1zM37 6h1v1h-1zM34 7h2v1h-2zM37 7h1v1h-1zM34 8h2v1h-2zM37 8h1v1h-1zM35 9h1v1h-1zM37 9h1v1h-1zM35 10h1v1h-1z\"/><path fill=\"#2F5A26\" d=\"M36 4h1v1h-1zM36 5h1v1h-1zM36 6h1v1h-1zM36 7h1v1h-1zM36 8h1v1h-1zM36 9h1v1h-1zM36 10h1v1h-1zM36 11h1v1h-1z\"/></symbol>\n<symbol id=\"hanzhongli-x-work\" viewBox=\"0 0 56 24\"><path fill=\"#C2CAD2\" d=\"M40 2h7v1h-7zM42 5h9v1h-9zM40 8h5v1h-5z\"/></symbol>\n<symbol id=\"hanzhongli-p-ask\" viewBox=\"0 0 56 24\"><path fill=\"#1A1A1A\" d=\"M38 1h2v1h-2zM37 2h1v1h-1zM36 3h1v1h-1zM35 4h1v1h-1zM35 5h1v1h-1zM35 6h1v1h-1zM35 7h1v1h-1zM36 8h1v1h-1zM36 9h1v1h-1zM39 9h1v1h-1zM37 10h1v1h-1zM39 10h1v1h-1zM38 11h2v1h-2zM38 12h2v1h-2z\"/><path fill=\"#4E8A3F\" d=\"M38 2h2v1h-2zM37 3h1v1h-1zM39 3h1v1h-1zM36 4h2v1h-2zM39 4h1v1h-1zM37 5h1v1h-1zM39 5h1v1h-1zM36 6h2v1h-2zM39 6h1v1h-1zM36 7h2v1h-2zM39 7h1v1h-1zM37 8h1v1h-1zM39 8h1v1h-1zM37 9h1v1h-1z\"/><path fill=\"#2F5A26\" d=\"M38 3h1v1h-1zM38 4h1v1h-1zM38 5h1v1h-1zM38 6h1v1h-1zM38 7h1v1h-1zM38 8h1v1h-1zM38 9h1v1h-1zM38 10h1v1h-1z\"/><path fill=\"#FFFFFF\" d=\"M36 5h1v1h-1z\"/></symbol>\n<symbol id=\"hanzhongli-x-ask\" viewBox=\"0 0 56 24\"><path fill=\"#C9A227\" d=\"M9 4h3v1h-3z\"/><path fill=\"#8A6A3F\" d=\"M10 5h1v1h-1zM10 6h1v1h-1zM10 7h1v1h-1zM10 8h1v1h-1zM10 9h1v1h-1zM10 10h1v1h-1zM10 11h1v1h-1zM10 12h1v1h-1zM10 13h1v1h-1zM10 14h1v1h-1zM10 15h1v1h-1zM10 16h1v1h-1zM10 17h1v1h-1zM10 18h1v1h-1zM10 19h1v1h-1zM10 20h1v1h-1zM10 21h1v1h-1z\"/></symbol>\n<symbol id=\"hanzhongli-p-done\" viewBox=\"0 0 56 24\"><path fill=\"#1A1A1A\" d=\"M35 4h2v1h-2zM34 5h1v1h-1zM37 5h1v1h-1zM33 6h1v1h-1zM37 6h1v1h-1zM32 7h1v1h-1zM37 7h1v1h-1zM32 8h1v1h-1zM37 8h1v1h-1zM32 9h1v1h-1zM37 9h1v1h-1zM32 10h1v1h-1zM37 10h1v1h-1zM33 11h1v1h-1zM37 11h1v1h-1zM33 12h1v1h-1zM36 12h1v1h-1zM34 13h1v1h-1zM36 13h1v1h-1zM35 14h2v1h-2zM35 15h2v1h-2z\"/><path fill=\"#4E8A3F\" d=\"M35 5h2v1h-2zM34 6h1v1h-1zM36 6h1v1h-1zM33 7h2v1h-2zM36 7h1v1h-1zM34 8h1v1h-1zM36 8h1v1h-1zM33 9h2v1h-2zM36 9h1v1h-1zM33 10h2v1h-2zM36 10h1v1h-1zM34 11h1v1h-1zM36 11h1v1h-1zM34 12h1v1h-1z\"/><path fill=\"#2F5A26\" d=\"M35 6h1v1h-1zM35 7h1v1h-1zM35 8h1v1h-1zM35 9h1v1h-1zM35 10h1v1h-1zM35 11h1v1h-1zM35 12h1v1h-1zM35 13h1v1h-1z\"/><path fill=\"#FFFFFF\" d=\"M33 8h1v1h-1z\"/></symbol>\n<symbol id=\"hanzhongli-x-done\" viewBox=\"0 0 56 24\"><path fill=\"#C9A227\" d=\"M38 5h1v1h-1z\"/><path fill=\"#FFFFFF\" d=\"M39 7h1v1h-1z\"/></symbol>\n<symbol id=\"hanzhongli-f-ask\" viewBox=\"0 0 56 24\"><path fill=\"#B5453C\" d=\"M11 8h4v1h-4zM11 9h5v1h-5zM11 11h5v1h-5z\"/><path fill=\"#8E2F27\" d=\"M11 10h4v1h-4zM11 12h4v1h-4z\"/></symbol>\n<symbol id=\"ludongbin-body\" viewBox=\"0 0 56 24\"><path fill=\"#1A1A1A\" d=\"M26 2h4v1h-4zM25 3h1v1h-1zM30 3h1v1h-1zM24 4h1v1h-1zM31 4h1v1h-1zM24 5h1v1h-1zM31 5h1v1h-1zM24 6h9v1h-9zM24 7h1v1h-1zM32 7h2v1h-2zM24 8h1v1h-1zM32 8h1v1h-1zM24 9h1v1h-1zM32 9h1v1h-1zM24 10h1v1h-1zM32 10h1v1h-1zM24 11h1v1h-1zM32 11h1v1h-1zM24 12h1v1h-1zM32 12h1v1h-1zM26 13h2v1h-2zM29 13h1v1h-1zM22 14h1v1h-1zM33 14h1v1h-1zM22 15h1v1h-1zM33 15h1v1h-1zM22 16h1v1h-1zM33 16h1v1h-1zM22 17h1v1h-1zM27 17h1v1h-1zM29 17h1v1h-1zM33 17h1v1h-1zM22 18h1v1h-1zM33 18h1v1h-1zM22 19h1v1h-1zM33 19h1v1h-1zM22 20h1v1h-1zM33 20h1v1h-1zM22 21h1v1h-1zM33 21h1v1h-1zM22 22h1v1h-1zM33 22h1v1h-1z\"/><path fill=\"#3EBAD3\" d=\"M26 3h4v1h-4zM25 4h6v1h-6zM23 14h2v1h-2zM31 14h2v1h-2zM23 15h2v1h-2zM31 15h2v1h-2zM23 16h2v1h-2zM31 16h2v1h-2zM23 17h2v1h-2zM31 17h2v1h-2zM23 19h2v1h-2zM31 19h2v1h-2zM23 20h2v1h-2zM31 20h2v1h-2z\"/><path fill=\"#1F5E6A\" d=\"M25 5h6v1h-6zM25 14h1v1h-1zM30 14h1v1h-1zM25 15h1v1h-1zM30 15h1v1h-1zM25 16h1v1h-1zM30 16h1v1h-1zM25 17h1v1h-1zM30 17h1v1h-1zM23 18h8v1h-8zM32 18h1v1h-1zM25 19h1v1h-1zM30 19h1v1h-1zM25 20h1v1h-1zM30 20h1v1h-1zM23 21h10v1h-10zM23 22h10v1h-10z\"/><path fill=\"#3A3330\" d=\"M25 7h1v1h-1zM28 13h1v1h-1zM27 14h1v1h-1zM29 14h1v1h-1zM27 15h1v1h-1zM29 15h1v1h-1zM27 16h1v1h-1zM29 16h1v1h-1z\"/><path fill=\"#C9A47C\" d=\"M26 7h6v1h-6zM28 11h1v1h-1zM27 12h2v1h-2z\"/><path fill=\"#E8C9A0\" d=\"M25 8h7v1h-7zM25 9h1v1h-1zM28 9h1v1h-1zM31 9h1v1h-1zM25 10h1v1h-1zM28 10h1v1h-1zM31 10h1v1h-1zM25 11h3v1h-3zM29 11h3v1h-3zM25 12h2v1h-2zM29 12h3v1h-3z\"/><path fill=\"#2A2A2A\" d=\"M26 9h2v1h-2zM29 9h2v1h-2zM26 10h2v1h-2zM29 10h2v1h-2z\"/><path fill=\"#2E8A9C\" d=\"M26 14h1v1h-1zM28 14h1v1h-1zM26 15h1v1h-1zM28 15h1v1h-1zM26 16h1v1h-1zM28 16h1v1h-1zM26 17h1v1h-1zM28 17h1v1h-1zM26 19h4v1h-4zM26 20h4v1h-4z\"/><path fill=\"#8A939C\" d=\"M31 18h1v1h-1z\"/></symbol>\n<symbol id=\"ludongbin-p-rest\" viewBox=\"0 0 56 24\"><path fill=\"#1A1A1A\" d=\"M34 4h2v1h-2zM34 5h1v1h-1zM34 6h1v1h-1zM34 7h1v1h-1zM34 8h1v1h-1zM34 9h1v1h-1zM34 10h1v1h-1zM34 11h1v1h-1zM34 12h1v1h-1zM34 13h1v1h-1zM34 14h1v1h-1zM34 15h1v1h-1zM34 16h1v1h-1zM34 17h1v1h-1zM33 18h3v1h-3zM34 21h1v1h-1z\"/><path fill=\"#C2CAD2\" d=\"M35 5h1v1h-1zM35 6h1v1h-1zM35 7h1v1h-1zM35 8h1v1h-1zM35 9h1v1h-1zM35 10h1v1h-1zM35 11h1v1h-1zM35 12h1v1h-1zM35 13h1v1h-1zM35 14h1v1h-1zM35 15h1v1h-1zM35 16h1v1h-1zM35 17h1v1h-1z\"/><path fill=\"#8A6A3F\" d=\"M34 19h1v1h-1zM34 20h1v1h-1z\"/></symbol>\n<symbol id=\"ludongbin-x-rest\" viewBox=\"0 0 56 24\"></symbol>\n<symbol id=\"ludongbin-p-work\" viewBox=\"0 0 56 24\"><path fill=\"#1A1A1A\" d=\"M36 0h1v1h-1zM36 1h1v1h-1zM36 2h2v1h-2zM36 3h1v1h-1zM36 4h1v1h-1zM36 5h1v1h-1zM36 6h1v1h-1zM36 7h1v1h-1zM36 8h1v1h-1zM36 9h1v1h-1zM36 10h1v1h-1zM36 11h1v1h-1zM36 12h1v1h-1zM36 13h1v1h-1zM36 14h1v1h-1zM36 15h1v1h-1zM35 16h3v1h-3zM36 19h1v1h-1z\"/><path fill=\"#C2CAD2\" d=\"M37 0h1v1h-1zM37 1h1v1h-1zM37 3h1v1h-1zM37 4h1v1h-1zM37 6h1v1h-1zM37 7h1v1h-1zM37 8h1v1h-1zM37 9h1v1h-1zM37 10h1v1h-1zM37 12h1v1h-1zM37 13h1v1h-1zM37 14h1v1h-1zM37 15h1v1h-1z\"/><path fill=\"#FFFFFF\" d=\"M37 5h1v1h-1zM37 11h1v1h-1z\"/><path fill=\"#8A6A3F\" d=\"M36 17h1v1h-1zM36 18h1v1h-1z\"/></symbol>\n<symbol id=\"ludongbin-x-work\" viewBox=\"0 0 56 24\"><path fill=\"#FFFFFF\" d=\"M38 0h1v1h-1zM38 3h1v1h-1z\"/><path fill=\"#C2CAD2\" d=\"M39 1h1v1h-1zM40 2h1v1h-1zM41 3h1v1h-1z\"/></symbol>\n<symbol id=\"ludongbin-p-ask\" viewBox=\"0 0 56 24\"><path fill=\"#1A1A1A\" d=\"M37 0h2v1h-2zM37 1h1v1h-1zM37 2h1v1h-1zM37 3h1v1h-1zM37 4h1v1h-1zM37 5h1v1h-1zM37 6h1v1h-1zM37 7h1v1h-1zM37 8h1v1h-1zM37 9h1v1h-1zM37 10h1v1h-1zM37 11h1v1h-1zM37 12h1v1h-1zM37 13h1v1h-1zM36 14h3v1h-3zM37 17h1v1h-1z\"/><path fill=\"#C2CAD2\" d=\"M38 1h1v1h-1zM38 2h1v1h-1zM38 3h1v1h-1zM38 4h1v1h-1zM38 5h1v1h-1zM38 6h1v1h-1zM38 7h1v1h-1zM38 8h1v1h-1zM38 9h1v1h-1zM38 10h1v1h-1zM38 11h1v1h-1zM38 12h1v1h-1zM38 13h1v1h-1z\"/><path fill=\"#8A6A3F\" d=\"M37 15h1v1h-1zM37 16h1v1h-1z\"/></symbol>\n<symbol id=\"ludongbin-x-ask\" viewBox=\"0 0 56 24\"><path fill=\"#C9A227\" d=\"M9 4h3v1h-3z\"/><path fill=\"#8A6A3F\" d=\"M10 5h1v1h-1zM10 6h1v1h-1zM10 7h1v1h-1zM10 8h1v1h-1zM10 9h1v1h-1zM10 10h1v1h-1zM10 11h1v1h-1zM10 12h1v1h-1zM10 13h1v1h-1zM10 14h1v1h-1zM10 15h1v1h-1zM10 16h1v1h-1zM10 17h1v1h-1zM10 18h1v1h-1zM10 19h1v1h-1zM10 20h1v1h-1zM10 21h1v1h-1z\"/></symbol>\n<symbol id=\"ludongbin-p-done\" viewBox=\"0 0 56 24\"><path fill=\"#1A1A1A\" d=\"M34 3h2v1h-2zM34 4h1v1h-1zM34 5h1v1h-1zM34 6h1v1h-1zM34 7h1v1h-1zM34 8h1v1h-1zM34 9h1v1h-1zM34 10h1v1h-1zM34 11h1v1h-1zM34 12h1v1h-1zM34 13h1v1h-1zM34 14h1v1h-1zM34 15h1v1h-1zM34 16h1v1h-1zM33 17h3v1h-3zM34 20h1v1h-1z\"/><path fill=\"#C2CAD2\" d=\"M35 4h1v1h-1zM35 5h1v1h-1zM35 6h1v1h-1zM35 7h1v1h-1zM35 8h1v1h-1zM35 9h1v1h-1zM35 10h1v1h-1zM35 11h1v1h-1zM35 12h1v1h-1zM35 13h1v1h-1zM35 14h1v1h-1zM35 15h1v1h-1zM35 16h1v1h-1z\"/><path fill=\"#8A6A3F\" d=\"M34 18h1v1h-1zM34 19h1v1h-1z\"/></symbol>\n<symbol id=\"ludongbin-x-done\" viewBox=\"0 0 56 24\"><path fill=\"#C9A227\" d=\"M36 4h1v1h-1z\"/><path fill=\"#FFFFFF\" d=\"M37 6h1v1h-1z\"/></symbol>\n<symbol id=\"ludongbin-f-ask\" viewBox=\"0 0 56 24\"><path fill=\"#B5453C\" d=\"M11 8h4v1h-4zM11 9h5v1h-5zM11 11h5v1h-5z\"/><path fill=\"#8E2F27\" d=\"M11 10h4v1h-4zM11 12h4v1h-4z\"/></symbol>\n<symbol id=\"tieguali-body\" viewBox=\"0 0 56 24\"><path fill=\"#1A1A1A\" d=\"M25 3h1v1h-1zM27 3h1v1h-1zM29 3h1v1h-1zM24 4h1v1h-1zM31 4h1v1h-1zM24 5h1v1h-1zM31 5h1v1h-1zM23 6h1v1h-1zM33 6h1v1h-1zM24 7h1v1h-1zM32 7h1v1h-1zM24 8h1v1h-1zM32 8h1v1h-1zM24 9h1v1h-1zM32 9h1v1h-1zM24 10h1v1h-1zM32 10h1v1h-1zM24 11h1v1h-1zM32 11h1v1h-1zM24 12h1v1h-1zM32 12h1v1h-1zM24 13h1v1h-1zM32 13h1v1h-1zM26 14h1v1h-1zM29 14h2v1h-2zM23 15h1v1h-1zM32 15h1v1h-1zM23 16h1v1h-1zM32 16h1v1h-1zM23 17h1v1h-1zM32 17h1v1h-1zM23 18h1v1h-1zM32 18h1v1h-1zM23 19h1v1h-1zM32 19h1v1h-1zM23 20h1v1h-1zM32 20h1v1h-1zM23 21h1v1h-1zM32 21h1v1h-1zM23 22h1v1h-1zM32 22h1v1h-1zM23 23h1v1h-1zM32 23h1v1h-1z\"/><path fill=\"#D2CEC5\" d=\"M25 4h2v1h-2zM28 4h1v1h-1zM30 4h1v1h-1zM25 5h6v1h-6zM25 7h7v1h-7zM25 13h1v1h-1zM27 13h2v1h-2zM31 13h1v1h-1zM27 14h2v1h-2zM27 15h2v1h-2z\"/><path fill=\"#C9A227\" d=\"M24 6h9v1h-9z\"/><path fill=\"#C9A47C\" d=\"M25 8h7v1h-7zM28 12h1v1h-1z\"/><path fill=\"#E8C9A0\" d=\"M25 9h7v1h-7zM25 10h1v1h-1zM28 10h1v1h-1zM31 10h1v1h-1zM25 11h1v1h-1zM28 11h1v1h-1zM31 11h1v1h-1zM25 12h3v1h-3zM29 12h3v1h-3zM26 13h1v1h-1zM29 13h2v1h-2z\"/><path fill=\"#2A2A2A\" d=\"M26 10h2v1h-2zM29 10h2v1h-2zM26 11h2v1h-2zM29 11h2v1h-2z\"/><path fill=\"#7A808A\" d=\"M24 15h1v1h-1zM31 15h1v1h-1zM24 16h1v1h-1zM31 16h1v1h-1zM24 17h1v1h-1zM31 17h1v1h-1zM24 18h1v1h-1zM31 18h1v1h-1zM24 20h1v1h-1zM31 20h1v1h-1zM24 21h1v1h-1zM31 21h1v1h-1z\"/><path fill=\"#3D4145\" d=\"M25 15h1v1h-1zM30 15h1v1h-1zM25 16h1v1h-1zM30 16h1v1h-1zM25 17h1v1h-1zM30 17h1v1h-1zM25 18h1v1h-1zM30 18h1v1h-1zM24 19h6v1h-6zM31 19h1v1h-1zM25 20h1v1h-1zM30 20h1v1h-1zM25 21h1v1h-1zM30 21h1v1h-1zM24 22h8v1h-8zM24 23h8v1h-8z\"/><path fill=\"#5A5F66\" d=\"M26 15h1v1h-1zM29 15h1v1h-1zM26 16h4v1h-4zM26 17h4v1h-4zM26 18h4v1h-4zM26 20h4v1h-4zM26 21h4v1h-4z\"/><path fill=\"#8A939C\" d=\"M30 19h1v1h-1z\"/></symbol>\n<symbol id=\"tieguali-p-rest\" viewBox=\"0 0 56 24\"><path fill=\"#1A1A1A\" d=\"M20 6h3v1h-3zM21 7h1v1h-1zM21 8h1v1h-1zM21 9h1v1h-1zM21 10h1v1h-1zM23 11h3v1h-3zM23 12h1v1h-1zM25 12h1v1h-1zM23 13h1v1h-1zM25 13h1v1h-1zM23 14h3v1h-3zM21 15h1v1h-1zM21 16h1v1h-1zM21 17h1v1h-1zM21 18h1v1h-1zM21 19h1v1h-1zM21 20h1v1h-1zM21 21h1v1h-1zM21 22h1v1h-1zM21 23h1v1h-1z\"/><path fill=\"#8A6A3F\" d=\"M22 7h1v1h-1zM22 8h1v1h-1zM22 9h1v1h-1zM22 10h1v1h-1zM22 15h1v1h-1zM22 16h1v1h-1zM22 17h1v1h-1zM22 18h1v1h-1zM22 19h1v1h-1zM22 20h1v1h-1zM22 21h1v1h-1zM22 22h1v1h-1zM22 23h1v1h-1z\"/><path fill=\"#3D4145\" d=\"M24 12h1v1h-1z\"/><path fill=\"#7A808A\" d=\"M24 13h1v1h-1z\"/></symbol>\n<symbol id=\"tieguali-x-rest\" viewBox=\"0 0 56 24\"></symbol>\n<symbol id=\"tieguali-p-work\" viewBox=\"0 0 56 24\"><path fill=\"#1A1A1A\" d=\"M18 4h3v1h-3zM19 5h1v1h-1zM19 6h1v1h-1zM19 7h1v1h-1zM21 9h3v1h-3zM21 10h1v1h-1zM23 10h1v1h-1zM21 11h1v1h-1zM23 11h1v1h-1zM21 12h3v1h-3zM19 14h1v1h-1zM19 15h1v1h-1zM19 16h1v1h-1zM19 17h1v1h-1zM19 18h1v1h-1zM19 19h1v1h-1zM19 20h1v1h-1zM19 21h1v1h-1zM19 22h1v1h-1zM19 23h1v1h-1z\"/><path fill=\"#8A6A3F\" d=\"M20 5h1v1h-1zM20 6h1v1h-1zM20 7h1v1h-1zM20 14h1v1h-1zM20 15h1v1h-1zM20 16h1v1h-1zM20 17h1v1h-1zM20 18h1v1h-1zM20 19h1v1h-1zM20 20h1v1h-1zM20 21h1v1h-1zM20 22h1v1h-1zM20 23h1v1h-1z\"/><path fill=\"#FFFFFF\" d=\"M24 8h1v1h-1zM22 10h1v1h-1zM22 11h1v1h-1zM24 13h1v1h-1z\"/></symbol>\n<symbol id=\"tieguali-x-work\" viewBox=\"0 0 56 24\"><path fill=\"#FFFFFF\" d=\"M17 4h1v1h-1zM17 6h1v1h-1zM15 11h1v1h-1zM14 14h1v1h-1z\"/><path fill=\"#C9A227\" d=\"M16 6h1v1h-1zM15 8h1v1h-1z\"/></symbol>\n<symbol id=\"tieguali-p-ask\" viewBox=\"0 0 56 24\"><path fill=\"#1A1A1A\" d=\"M17 2h3v1h-3zM18 3h1v1h-1zM18 4h1v1h-1zM18 5h1v1h-1zM18 6h1v1h-1zM20 7h3v1h-3zM20 8h1v1h-1zM22 8h1v1h-1zM20 9h1v1h-1zM22 9h1v1h-1zM20 10h3v1h-3zM18 11h1v1h-1zM18 12h1v1h-1zM18 13h1v1h-1zM18 14h1v1h-1zM18 15h1v1h-1zM18 16h1v1h-1zM18 17h1v1h-1zM18 18h1v1h-1zM18 19h1v1h-1zM18 20h1v1h-1zM18 21h1v1h-1zM18 22h1v1h-1z\"/><path fill=\"#8A6A3F\" d=\"M19 3h1v1h-1zM19 4h1v1h-1zM19 5h1v1h-1zM19 6h1v1h-1zM19 11h1v1h-1zM19 12h1v1h-1zM19 13h1v1h-1zM19 14h1v1h-1zM19 15h1v1h-1zM19 16h1v1h-1zM19 17h1v1h-1zM19 18h1v1h-1zM19 19h1v1h-1zM19 20h1v1h-1zM19 21h1v1h-1zM19 22h1v1h-1z\"/><path fill=\"#3D4145\" d=\"M21 8h1v1h-1z\"/><path fill=\"#7A808A\" d=\"M21 9h1v1h-1z\"/></symbol>\n<symbol id=\"tieguali-x-ask\" viewBox=\"0 0 56 24\"><path fill=\"#C9A227\" d=\"M9 4h3v1h-3z\"/><path fill=\"#8A6A3F\" d=\"M10 5h1v1h-1zM10 6h1v1h-1zM10 7h1v1h-1zM10 8h1v1h-1zM10 9h1v1h-1zM10 10h1v1h-1zM10 11h1v1h-1zM10 12h1v1h-1zM10 13h1v1h-1zM10 14h1v1h-1zM10 15h1v1h-1zM10 16h1v1h-1zM10 17h1v1h-1zM10 18h1v1h-1zM10 19h1v1h-1zM10 20h1v1h-1zM10 21h1v1h-1z\"/></symbol>\n<symbol id=\"tieguali-p-done\" viewBox=\"0 0 56 24\"><path fill=\"#1A1A1A\" d=\"M20 5h3v1h-3zM21 6h1v1h-1zM21 7h1v1h-1zM21 8h1v1h-1zM21 9h1v1h-1zM23 10h3v1h-3zM23 11h1v1h-1zM25 11h1v1h-1zM23 12h1v1h-1zM25 12h1v1h-1zM23 13h3v1h-3zM21 14h1v1h-1zM21 15h1v1h-1zM21 16h1v1h-1zM21 17h1v1h-1zM21 18h1v1h-1zM21 19h1v1h-1zM21 20h1v1h-1zM21 21h1v1h-1zM21 22h1v1h-1zM21 23h1v1h-1z\"/><path fill=\"#8A6A3F\" d=\"M22 6h1v1h-1zM22 7h1v1h-1zM22 8h1v1h-1zM22 9h1v1h-1zM22 14h1v1h-1zM22 15h1v1h-1zM22 16h1v1h-1zM22 17h1v1h-1zM22 18h1v1h-1zM22 19h1v1h-1zM22 20h1v1h-1zM22 21h1v1h-1zM22 22h1v1h-1zM22 23h1v1h-1z\"/><path fill=\"#3D4145\" d=\"M24 11h1v1h-1z\"/><path fill=\"#7A808A\" d=\"M24 12h1v1h-1z\"/></symbol>\n<symbol id=\"tieguali-x-done\" viewBox=\"0 0 56 24\"><path fill=\"#C9A227\" d=\"M19 6h1v1h-1z\"/><path fill=\"#FFFFFF\" d=\"M18 8h1v1h-1z\"/></symbol>\n<symbol id=\"tieguali-f-ask\" viewBox=\"0 0 56 24\"><path fill=\"#B5453C\" d=\"M11 8h4v1h-4zM11 9h5v1h-5zM11 11h5v1h-5z\"/><path fill=\"#8E2F27\" d=\"M11 10h4v1h-4zM11 12h4v1h-4z\"/></symbol>\n<symbol id=\"zhangguolao-body\" viewBox=\"0 0 56 24\"><path fill=\"#1A1A1A\" d=\"M26 5h4v1h-4zM25 6h1v1h-1zM30 6h1v1h-1zM24 7h9v1h-9zM22 8h1v1h-1zM25 8h1v1h-1zM30 8h1v1h-1zM33 8h1v1h-1zM22 9h3v1h-3zM32 9h2v1h-2zM24 10h1v1h-1zM32 10h1v1h-1zM24 11h1v1h-1zM32 11h1v1h-1zM24 12h1v1h-1zM32 12h1v1h-1zM24 13h1v1h-1zM32 13h1v1h-1zM24 14h1v1h-1zM32 14h1v1h-1zM26 15h1v1h-1zM30 15h1v1h-1zM22 16h1v1h-1zM26 16h1v1h-1zM30 16h1v1h-1zM33 16h1v1h-1zM22 17h1v1h-1zM27 17h1v1h-1zM29 17h1v1h-1zM33 17h1v1h-1zM22 18h1v1h-1zM27 18h1v1h-1zM29 18h1v1h-1zM33 18h1v1h-1zM22 19h1v1h-1zM27 19h1v1h-1zM29 19h1v1h-1zM33 19h1v1h-1zM22 20h1v1h-1zM33 20h1v1h-1zM22 21h1v1h-1zM33 21h1v1h-1zM22 22h1v1h-1zM33 22h1v1h-1zM22 23h1v1h-1zM33 23h1v1h-1z\"/><path fill=\"#2B533A\" d=\"M26 6h4v1h-4zM23 8h2v1h-2zM26 8h4v1h-4zM31 8h2v1h-2zM24 16h1v1h-1zM31 16h1v1h-1zM24 17h1v1h-1zM31 17h1v1h-1zM24 18h1v1h-1zM31 18h1v1h-1zM24 19h1v1h-1zM31 19h1v1h-1zM23 20h8v1h-8zM32 20h1v1h-1zM24 21h1v1h-1zM31 21h1v1h-1zM24 22h1v1h-1zM31 22h1v1h-1zM23 23h10v1h-10z\"/><path fill=\"#C9A47C\" d=\"M25 9h7v1h-7zM28 13h1v1h-1zM27 14h2v1h-2z\"/><path fill=\"#E8C9A0\" d=\"M25 10h7v1h-7zM25 11h1v1h-1zM28 11h1v1h-1zM31 11h1v1h-1zM25 12h1v1h-1zM28 12h1v1h-1zM31 12h1v1h-1zM25 13h3v1h-3zM29 13h3v1h-3zM25 14h2v1h-2zM29 14h3v1h-3z\"/><path fill=\"#2A2A2A\" d=\"M26 11h2v1h-2zM29 11h2v1h-2zM26 12h2v1h-2zM29 12h2v1h-2z\"/><path fill=\"#D2CEC5\" d=\"M27 15h3v1h-3zM27 16h3v1h-3zM28 17h1v1h-1zM28 18h1v1h-1zM28 19h1v1h-1z\"/><path fill=\"#55A573\" d=\"M23 16h1v1h-1zM32 16h1v1h-1zM23 17h1v1h-1zM32 17h1v1h-1zM23 18h1v1h-1zM32 18h1v1h-1zM23 19h1v1h-1zM32 19h1v1h-1zM23 21h1v1h-1zM32 21h1v1h-1zM23 22h1v1h-1zM32 22h1v1h-1z\"/><path fill=\"#3F7A55\" d=\"M25 16h1v1h-1zM25 17h2v1h-2zM30 17h1v1h-1zM25 18h2v1h-2zM30 18h1v1h-1zM25 19h2v1h-2zM30 19h1v1h-1zM25 21h6v1h-6zM25 22h6v1h-6z\"/><path fill=\"#8A939C\" d=\"M31 20h1v1h-1z\"/></symbol>\n<symbol id=\"zhangguolao-p-rest\" viewBox=\"0 0 56 24\"><path fill=\"#1A1A1A\" d=\"M33 17h5v1h-5zM33 18h1v1h-1zM37 18h1v1h-1zM33 19h1v1h-1zM37 19h1v1h-1zM33 20h1v1h-1zM37 20h1v1h-1zM33 21h1v1h-1zM37 21h1v1h-1zM33 22h5v1h-5z\"/><path fill=\"#8A6A3F\" d=\"M34 18h3v1h-3zM34 20h3v1h-3zM34 21h3v1h-3z\"/><path fill=\"#F2EBD8\" d=\"M34 19h1v1h-1zM36 19h1v1h-1z\"/><path fill=\"#FFFFFF\" d=\"M35 19h1v1h-1z\"/></symbol>\n<symbol id=\"zhangguolao-x-rest\" viewBox=\"0 0 56 24\"></symbol>\n<symbol id=\"zhangguolao-p-work\" viewBox=\"0 0 56 24\"><path fill=\"#8A6A3F\" d=\"M37 11h1v1h-1zM37 12h1v1h-1zM37 13h1v1h-1zM36 16h3v1h-3zM36 18h3v1h-3zM36 19h3v1h-3z\"/><path fill=\"#1A1A1A\" d=\"M37 14h1v1h-1zM35 15h5v1h-5zM35 16h1v1h-1zM39 16h1v1h-1zM35 17h1v1h-1zM39 17h1v1h-1zM35 18h1v1h-1zM39 18h1v1h-1zM35 19h1v1h-1zM39 19h1v1h-1zM35 20h5v1h-5z\"/><path fill=\"#FFFFFF\" d=\"M36 17h2v1h-2z\"/><path fill=\"#F2EBD8\" d=\"M38 17h1v1h-1z\"/></symbol>\n<symbol id=\"zhangguolao-x-work\" viewBox=\"0 0 56 24\"><path fill=\"#C2CAD2\" d=\"M40 13h4v1h-4zM41 15h5v1h-5zM40 17h3v1h-3z\"/></symbol>\n<symbol id=\"zhangguolao-p-ask\" viewBox=\"0 0 56 24\"><path fill=\"#1A1A1A\" d=\"M36 13h4v1h-4zM36 14h1v1h-1zM36 15h1v1h-1zM36 16h1v1h-1zM36 17h1v1h-1zM36 18h4v1h-4z\"/><path fill=\"#8A6A3F\" d=\"M37 14h3v1h-3zM37 16h3v1h-3zM37 17h3v1h-3z\"/><path fill=\"#F2EBD8\" d=\"M37 15h1v1h-1zM39 15h1v1h-1z\"/><path fill=\"#FFFFFF\" d=\"M38 15h1v1h-1z\"/></symbol>\n<symbol id=\"zhangguolao-x-ask\" viewBox=\"0 0 56 24\"><path fill=\"#C9A227\" d=\"M9 4h3v1h-3z\"/><path fill=\"#8A6A3F\" d=\"M10 5h1v1h-1zM10 6h1v1h-1zM10 7h1v1h-1zM10 8h1v1h-1zM10 9h1v1h-1zM10 10h1v1h-1zM10 11h1v1h-1zM10 12h1v1h-1zM10 13h1v1h-1zM10 14h1v1h-1zM10 15h1v1h-1zM10 16h1v1h-1zM10 17h1v1h-1zM10 18h1v1h-1zM10 19h1v1h-1zM10 20h1v1h-1zM10 21h1v1h-1z\"/></symbol>\n<symbol id=\"zhangguolao-p-done\" viewBox=\"0 0 56 24\"><path fill=\"#1A1A1A\" d=\"M33 16h5v1h-5zM33 17h1v1h-1zM37 17h1v1h-1zM33 18h1v1h-1zM37 18h1v1h-1zM33 19h1v1h-1zM37 19h1v1h-1zM33 20h1v1h-1zM37 20h1v1h-1zM33 21h5v1h-5z\"/><path fill=\"#8A6A3F\" d=\"M34 17h3v1h-3zM34 19h3v1h-3zM34 20h3v1h-3z\"/><path fill=\"#F2EBD8\" d=\"M34 18h1v1h-1zM36 18h1v1h-1z\"/><path fill=\"#FFFFFF\" d=\"M35 18h1v1h-1z\"/></symbol>\n<symbol id=\"zhangguolao-x-done\" viewBox=\"0 0 56 24\"><path fill=\"#C9A227\" d=\"M38 17h1v1h-1z\"/><path fill=\"#FFFFFF\" d=\"M39 19h1v1h-1z\"/></symbol>\n<symbol id=\"zhangguolao-f-ask\" viewBox=\"0 0 56 24\"><path fill=\"#B5453C\" d=\"M11 8h4v1h-4zM11 9h5v1h-5zM11 11h5v1h-5z\"/><path fill=\"#8E2F27\" d=\"M11 10h4v1h-4zM11 12h4v1h-4z\"/></symbol>\n<symbol id=\"hexiangu-body\" viewBox=\"0 0 56 24\"><path fill=\"#1A1A1A\" d=\"M25 1h3v1h-3zM30 1h3v1h-3zM24 2h1v1h-1zM27 2h1v1h-1zM29 2h1v1h-1zM32 2h1v1h-1zM24 3h1v1h-1zM27 3h1v1h-1zM29 3h1v1h-1zM32 3h1v1h-1zM24 4h1v1h-1zM32 4h1v1h-1zM24 5h1v1h-1zM32 5h1v1h-1zM23 6h1v1h-1zM33 6h1v1h-1zM22 7h1v1h-1zM24 7h1v1h-1zM32 7h1v1h-1zM34 7h1v1h-1zM22 8h1v1h-1zM24 8h1v1h-1zM32 8h1v1h-1zM34 8h1v1h-1zM22 9h1v1h-1zM24 9h1v1h-1zM32 9h1v1h-1zM34 9h1v1h-1zM22 10h1v1h-1zM24 10h1v1h-1zM32 10h1v1h-1zM34 10h1v1h-1zM23 11h2v1h-2zM32 11h2v1h-2zM24 12h1v1h-1zM32 12h1v1h-1zM26 13h1v1h-1zM29 13h1v1h-1zM23 14h1v1h-1zM32 14h1v1h-1zM23 15h1v1h-1zM32 15h1v1h-1zM23 16h1v1h-1zM32 16h1v1h-1zM23 17h1v1h-1zM32 17h1v1h-1zM23 18h1v1h-1zM32 18h1v1h-1zM23 19h1v1h-1zM32 19h1v1h-1zM21 20h1v1h-1zM34 20h1v1h-1zM21 21h1v1h-1zM34 21h1v1h-1zM21 22h1v1h-1zM34 22h1v1h-1z\"/><path fill=\"#3A3330\" d=\"M25 2h2v1h-2zM30 2h2v1h-2zM25 3h2v1h-2zM30 3h2v1h-2zM25 4h7v1h-7zM25 5h7v1h-7zM24 6h9v1h-9zM23 7h1v1h-1zM33 7h1v1h-1zM23 8h1v1h-1zM33 8h1v1h-1zM23 9h1v1h-1zM33 9h1v1h-1zM23 10h1v1h-1zM33 10h1v1h-1z\"/><path fill=\"#C9A47C\" d=\"M25 7h7v1h-7zM28 11h1v1h-1zM27 12h2v1h-2zM27 13h2v1h-2z\"/><path fill=\"#E8C9A0\" d=\"M25 8h7v1h-7zM25 9h1v1h-1zM28 9h1v1h-1zM31 9h1v1h-1zM25 10h1v1h-1zM28 10h1v1h-1zM31 10h1v1h-1zM25 11h3v1h-3zM29 11h3v1h-3zM25 12h2v1h-2zM29 12h3v1h-3z\"/><path fill=\"#2A2A2A\" d=\"M26 9h2v1h-2zM29 9h2v1h-2zM26 10h2v1h-2zM29 10h2v1h-2z\"/><path fill=\"#F87AA5\" d=\"M24 14h1v1h-1zM31 14h1v1h-1zM24 15h1v1h-1zM31 15h1v1h-1zM24 16h1v1h-1zM31 16h1v1h-1zM24 17h1v1h-1zM31 17h1v1h-1zM24 19h1v1h-1zM31 19h1v1h-1zM22 20h1v1h-1zM33 20h1v1h-1z\"/><path fill=\"#7D3D53\" d=\"M25 14h1v1h-1zM30 14h1v1h-1zM25 15h1v1h-1zM30 15h1v1h-1zM25 16h1v1h-1zM30 16h1v1h-1zM25 17h1v1h-1zM30 17h1v1h-1zM24 18h6v1h-6zM31 18h1v1h-1zM25 19h1v1h-1zM30 19h1v1h-1zM23 20h1v1h-1zM32 20h1v1h-1zM22 21h12v1h-12zM22 22h12v1h-12z\"/><path fill=\"#B85A7A\" d=\"M26 14h4v1h-4zM26 15h4v1h-4zM26 16h4v1h-4zM26 17h4v1h-4zM26 19h4v1h-4zM24 20h8v1h-8z\"/><path fill=\"#8A939C\" d=\"M30 18h1v1h-1z\"/></symbol>\n<symbol id=\"hexiangu-p-rest\" viewBox=\"0 0 56 24\"><path fill=\"#1A1A1A\" d=\"M33 3h3v1h-3zM32 4h1v1h-1zM35 4h1v1h-1zM32 5h1v1h-1zM36 5h1v1h-1zM32 6h1v1h-1zM36 6h1v1h-1zM32 7h5v1h-5zM33 14h3v1h-3z\"/><path fill=\"#7D3D53\" d=\"M33 4h1v1h-1z\"/><path fill=\"#F87AA5\" d=\"M34 4h1v1h-1zM33 5h1v1h-1zM35 5h1v1h-1zM33 6h3v1h-3z\"/><path fill=\"#FFFFFF\" d=\"M34 5h1v1h-1z\"/><path fill=\"#4E8A3F\" d=\"M34 8h1v1h-1zM34 9h1v1h-1zM34 10h1v1h-1zM34 11h1v1h-1zM34 12h1v1h-1zM34 13h1v1h-1z\"/></symbol>\n<symbol id=\"hexiangu-x-rest\" viewBox=\"0 0 56 24\"></symbol>\n<symbol id=\"hexiangu-p-work\" viewBox=\"0 0 56 24\"><path fill=\"#1A1A1A\" d=\"M35 1h3v1h-3zM33 2h1v1h-1zM37 2h1v1h-1zM33 3h1v1h-1zM38 3h1v1h-1zM33 4h1v1h-1zM38 4h1v1h-1zM33 5h6v1h-6zM35 12h3v1h-3z\"/><path fill=\"#7D3D53\" d=\"M34 2h1v1h-1z\"/><path fill=\"#F87AA5\" d=\"M35 2h2v1h-2zM34 3h1v1h-1zM36 3h2v1h-2zM34 4h4v1h-4z\"/><path fill=\"#FFFFFF\" d=\"M35 3h1v1h-1z\"/><path fill=\"#4E8A3F\" d=\"M36 6h1v1h-1zM36 7h1v1h-1zM36 8h1v1h-1zM36 9h1v1h-1zM36 10h1v1h-1zM36 11h1v1h-1z\"/></symbol>\n<symbol id=\"hexiangu-x-work\" viewBox=\"0 0 56 24\"><path fill=\"#F87AA5\" d=\"M39 1h1v1h-1zM42 4h1v1h-1z\"/><path fill=\"#4E8A3F\" d=\"M43 6h1v1h-1z\"/><path fill=\"#7D3D53\" d=\"M40 7h1v1h-1z\"/></symbol>\n<symbol id=\"hexiangu-p-ask\" viewBox=\"0 0 56 24\"><path fill=\"#1A1A1A\" d=\"M35 0h1v1h-1zM38 0h1v1h-1zM35 1h1v1h-1zM39 1h1v1h-1zM35 2h1v1h-1zM39 2h1v1h-1zM35 3h5v1h-5zM36 10h3v1h-3z\"/><path fill=\"#7D3D53\" d=\"M36 0h1v1h-1z\"/><path fill=\"#F87AA5\" d=\"M37 0h1v1h-1zM36 1h1v1h-1zM38 1h1v1h-1zM36 2h3v1h-3z\"/><path fill=\"#FFFFFF\" d=\"M37 1h1v1h-1z\"/><path fill=\"#4E8A3F\" d=\"M37 4h1v1h-1zM37 5h1v1h-1zM37 6h1v1h-1zM37 7h1v1h-1zM37 8h1v1h-1zM37 9h1v1h-1z\"/></symbol>\n<symbol id=\"hexiangu-x-ask\" viewBox=\"0 0 56 24\"><path fill=\"#C9A227\" d=\"M9 4h3v1h-3z\"/><path fill=\"#8A6A3F\" d=\"M10 5h1v1h-1zM10 6h1v1h-1zM10 7h1v1h-1zM10 8h1v1h-1zM10 9h1v1h-1zM10 10h1v1h-1zM10 11h1v1h-1zM10 12h1v1h-1zM10 13h1v1h-1zM10 14h1v1h-1zM10 15h1v1h-1zM10 16h1v1h-1zM10 17h1v1h-1zM10 18h1v1h-1zM10 19h1v1h-1zM10 20h1v1h-1zM10 21h1v1h-1z\"/></symbol>\n<symbol id=\"hexiangu-p-done\" viewBox=\"0 0 56 24\"><path fill=\"#1A1A1A\" d=\"M33 2h3v1h-3zM32 3h1v1h-1zM35 3h1v1h-1zM32 4h1v1h-1zM36 4h1v1h-1zM32 5h1v1h-1zM36 5h1v1h-1zM32 6h5v1h-5zM33 13h3v1h-3z\"/><path fill=\"#7D3D53\" d=\"M33 3h1v1h-1z\"/><path fill=\"#F87AA5\" d=\"M34 3h1v1h-1zM33 4h1v1h-1zM35 4h1v1h-1zM33 5h3v1h-3z\"/><path fill=\"#FFFFFF\" d=\"M34 4h1v1h-1z\"/><path fill=\"#4E8A3F\" d=\"M34 7h1v1h-1zM34 8h1v1h-1zM34 9h1v1h-1zM34 10h1v1h-1zM34 11h1v1h-1zM34 12h1v1h-1z\"/></symbol>\n<symbol id=\"hexiangu-x-done\" viewBox=\"0 0 56 24\"><path fill=\"#C9A227\" d=\"M37 3h1v1h-1z\"/><path fill=\"#FFFFFF\" d=\"M38 5h1v1h-1z\"/></symbol>\n<symbol id=\"hexiangu-f-ask\" viewBox=\"0 0 56 24\"><path fill=\"#B5453C\" d=\"M11 8h4v1h-4zM11 9h5v1h-5zM11 11h5v1h-5z\"/><path fill=\"#8E2F27\" d=\"M11 10h4v1h-4zM11 12h4v1h-4z\"/></symbol>\n<symbol id=\"lancaihe-body\" viewBox=\"0 0 56 24\"><path fill=\"#1A1A1A\" d=\"M26 4h1v1h-1zM29 4h1v1h-1zM26 5h1v1h-1zM29 5h1v1h-1zM24 6h1v1h-1zM27 6h2v1h-2zM32 6h1v1h-1zM24 7h1v1h-1zM32 7h1v1h-1zM24 8h1v1h-1zM32 8h1v1h-1zM24 9h1v1h-1zM32 9h1v1h-1zM24 10h1v1h-1zM32 10h1v1h-1zM24 11h1v1h-1zM32 11h1v1h-1zM24 12h1v1h-1zM32 12h1v1h-1zM24 13h1v1h-1zM32 13h1v1h-1zM24 14h1v1h-1zM32 14h1v1h-1zM26 15h1v1h-1zM29 15h1v1h-1zM23 16h1v1h-1zM32 16h1v1h-1zM23 17h1v1h-1zM32 17h1v1h-1zM23 18h1v1h-1zM32 18h1v1h-1zM23 19h1v1h-1zM32 19h1v1h-1zM23 20h1v1h-1zM32 20h1v1h-1zM23 21h1v1h-1zM32 21h1v1h-1zM23 22h1v1h-1zM32 22h1v1h-1zM23 23h1v1h-1zM32 23h1v1h-1z\"/><path fill=\"#3A3330\" d=\"M25 6h2v1h-2zM29 6h2v1h-2zM25 7h7v1h-7zM25 8h7v1h-7z\"/><path fill=\"#C9A47C\" d=\"M25 9h7v1h-7zM28 13h1v1h-1zM27 14h2v1h-2zM27 15h2v1h-2z\"/><path fill=\"#E8C9A0\" d=\"M25 10h7v1h-7zM25 11h1v1h-1zM28 11h1v1h-1zM31 11h1v1h-1zM25 12h1v1h-1zM28 12h1v1h-1zM31 12h1v1h-1zM25 13h3v1h-3zM29 13h3v1h-3zM25 14h2v1h-2zM29 14h3v1h-3z\"/><path fill=\"#2A2A2A\" d=\"M26 11h2v1h-2zM29 11h2v1h-2zM26 12h2v1h-2zM29 12h2v1h-2z\"/><path fill=\"#556BD3\" d=\"M24 16h1v1h-1zM31 16h1v1h-1zM24 17h1v1h-1zM31 17h1v1h-1zM24 18h1v1h-1zM31 18h1v1h-1zM24 19h1v1h-1zM31 19h1v1h-1zM24 21h1v1h-1zM31 21h1v1h-1zM24 22h1v1h-1zM31 22h1v1h-1z\"/><path fill=\"#2B366A\" d=\"M25 16h1v1h-1zM30 16h1v1h-1zM25 17h1v1h-1zM30 17h1v1h-1zM25 18h1v1h-1zM30 18h1v1h-1zM25 19h1v1h-1zM30 19h1v1h-1zM24 20h6v1h-6zM31 20h1v1h-1zM25 21h1v1h-1zM30 21h1v1h-1zM25 22h1v1h-1zM30 22h1v1h-1zM24 23h8v1h-8z\"/><path fill=\"#3F4F9C\" d=\"M26 16h4v1h-4zM26 17h4v1h-4zM26 18h4v1h-4zM26 19h4v1h-4zM26 21h4v1h-4zM26 22h4v1h-4z\"/><path fill=\"#8A939C\" d=\"M30 20h1v1h-1z\"/></symbol>\n<symbol id=\"lancaihe-p-rest\" viewBox=\"0 0 56 24\"><path fill=\"#1A1A1A\" d=\"M34 14h2v1h-2zM33 15h1v1h-1zM35 15h1v1h-1zM33 16h4v1h-4zM33 17h1v1h-1zM36 17h1v1h-1zM33 18h1v1h-1zM36 18h1v1h-1zM33 19h1v1h-1zM36 19h1v1h-1zM33 20h1v1h-1zM36 20h1v1h-1zM33 21h1v1h-1zM36 21h1v1h-1zM33 22h1v1h-1zM36 22h1v1h-1zM33 23h1v1h-1zM36 23h1v1h-1z\"/><path fill=\"#556BD3\" d=\"M34 17h1v1h-1z\"/><path fill=\"#2B366A\" d=\"M35 17h1v1h-1z\"/><path fill=\"#8A6A3F\" d=\"M34 18h2v1h-2zM34 19h2v1h-2zM34 20h2v1h-2zM34 21h2v1h-2zM34 22h2v1h-2zM34 23h2v1h-2z\"/></symbol>\n<symbol id=\"lancaihe-x-rest\" viewBox=\"0 0 56 24\"></symbol>\n<symbol id=\"lancaihe-p-work\" viewBox=\"0 0 56 24\"><path fill=\"#556BD3\" d=\"M36 9h1v1h-1zM37 10h1v1h-1zM36 11h1v1h-1zM36 15h1v1h-1z\"/><path fill=\"#2B366A\" d=\"M38 9h1v1h-1zM37 11h1v1h-1zM37 15h1v1h-1z\"/><path fill=\"#1A1A1A\" d=\"M35 10h1v1h-1zM38 10h1v1h-1zM35 11h1v1h-1zM38 11h1v1h-1zM36 12h2v1h-2zM35 13h1v1h-1zM37 13h1v1h-1zM35 14h4v1h-4zM35 15h1v1h-1zM38 15h1v1h-1zM35 16h1v1h-1zM38 16h1v1h-1zM35 17h1v1h-1zM38 17h1v1h-1zM35 18h1v1h-1zM38 18h1v1h-1zM35 19h1v1h-1zM38 19h1v1h-1zM35 20h1v1h-1zM38 20h1v1h-1zM35 21h1v1h-1zM38 21h1v1h-1zM35 22h4v1h-4z\"/><path fill=\"#FFFFFF\" d=\"M36 10h1v1h-1z\"/><path fill=\"#8A6A3F\" d=\"M36 16h2v1h-2zM36 17h2v1h-2zM36 18h2v1h-2zM36 19h2v1h-2zM36 20h2v1h-2zM36 21h2v1h-2z\"/></symbol>\n<symbol id=\"lancaihe-x-work\" viewBox=\"0 0 56 24\"><path fill=\"#556BD3\" d=\"M42 9h1v1h-1zM39 12h1v1h-1z\"/><path fill=\"#4E8A3F\" d=\"M43 12h1v1h-1z\"/><path fill=\"#2B366A\" d=\"M40 15h1v1h-1z\"/></symbol>\n<symbol id=\"lancaihe-p-ask\" viewBox=\"0 0 56 24\"><path fill=\"#1A1A1A\" d=\"M37 10h2v1h-2zM36 11h1v1h-1zM38 11h1v1h-1zM36 12h4v1h-4zM36 13h1v1h-1zM39 13h1v1h-1zM36 14h1v1h-1zM39 14h1v1h-1zM36 15h1v1h-1zM39 15h1v1h-1zM36 16h1v1h-1zM39 16h1v1h-1zM36 17h1v1h-1zM39 17h1v1h-1zM36 18h1v1h-1zM39 18h1v1h-1zM36 19h1v1h-1zM39 19h1v1h-1zM36 20h4v1h-4z\"/><path fill=\"#556BD3\" d=\"M37 13h1v1h-1z\"/><path fill=\"#2B366A\" d=\"M38 13h1v1h-1z\"/><path fill=\"#8A6A3F\" d=\"M37 14h2v1h-2zM37 15h2v1h-2zM37 16h2v1h-2zM37 17h2v1h-2zM37 18h2v1h-2zM37 19h2v1h-2z\"/></symbol>\n<symbol id=\"lancaihe-x-ask\" viewBox=\"0 0 56 24\"><path fill=\"#C9A227\" d=\"M9 4h3v1h-3z\"/><path fill=\"#8A6A3F\" d=\"M10 5h1v1h-1zM10 6h1v1h-1zM10 7h1v1h-1zM10 8h1v1h-1zM10 9h1v1h-1zM10 10h1v1h-1zM10 11h1v1h-1zM10 12h1v1h-1zM10 13h1v1h-1zM10 14h1v1h-1zM10 15h1v1h-1zM10 16h1v1h-1zM10 17h1v1h-1zM10 18h1v1h-1zM10 19h1v1h-1zM10 20h1v1h-1zM10 21h1v1h-1z\"/></symbol>\n<symbol id=\"lancaihe-p-done\" viewBox=\"0 0 56 24\"><path fill=\"#1A1A1A\" d=\"M34 13h2v1h-2zM33 14h1v1h-1zM35 14h1v1h-1zM33 15h4v1h-4zM33 16h1v1h-1zM36 16h1v1h-1zM33 17h1v1h-1zM36 17h1v1h-1zM33 18h1v1h-1zM36 18h1v1h-1zM33 19h1v1h-1zM36 19h1v1h-1zM33 20h1v1h-1zM36 20h1v1h-1zM33 21h1v1h-1zM36 21h1v1h-1zM33 22h1v1h-1zM36 22h1v1h-1zM33 23h4v1h-4z\"/><path fill=\"#556BD3\" d=\"M34 16h1v1h-1z\"/><path fill=\"#2B366A\" d=\"M35 16h1v1h-1z\"/><path fill=\"#8A6A3F\" d=\"M34 17h2v1h-2zM34 18h2v1h-2zM34 19h2v1h-2zM34 20h2v1h-2zM34 21h2v1h-2zM34 22h2v1h-2z\"/></symbol>\n<symbol id=\"lancaihe-x-done\" viewBox=\"0 0 56 24\"><path fill=\"#C9A227\" d=\"M37 14h1v1h-1z\"/><path fill=\"#FFFFFF\" d=\"M38 16h1v1h-1z\"/></symbol>\n<symbol id=\"lancaihe-f-ask\" viewBox=\"0 0 56 24\"><path fill=\"#B5453C\" d=\"M11 8h4v1h-4zM11 9h5v1h-5zM11 11h5v1h-5z\"/><path fill=\"#8E2F27\" d=\"M11 10h4v1h-4zM11 12h4v1h-4z\"/></symbol>\n<symbol id=\"hanxiangzi-body\" viewBox=\"0 0 56 24\"><path fill=\"#1A1A1A\" d=\"M27 1h2v1h-2zM26 2h1v1h-1zM29 2h1v1h-1zM25 3h6v1h-6zM24 4h1v1h-1zM31 4h1v1h-1zM24 5h1v1h-1zM31 5h1v1h-1zM24 6h9v1h-9zM24 7h1v1h-1zM32 7h1v1h-1zM24 8h1v1h-1zM32 8h1v1h-1zM24 9h1v1h-1zM32 9h1v1h-1zM24 10h1v1h-1zM32 10h1v1h-1zM24 11h1v1h-1zM32 11h1v1h-1zM24 12h1v1h-1zM32 12h1v1h-1zM26 13h1v1h-1zM29 13h1v1h-1zM22 14h1v1h-1zM33 14h1v1h-1zM22 15h1v1h-1zM33 15h1v1h-1zM22 16h1v1h-1zM33 16h1v1h-1zM22 17h1v1h-1zM33 17h1v1h-1zM22 18h1v1h-1zM33 18h1v1h-1zM22 19h1v1h-1zM33 19h1v1h-1zM22 20h1v1h-1zM33 20h1v1h-1zM22 21h1v1h-1zM33 21h1v1h-1zM22 22h1v1h-1zM33 22h1v1h-1z\"/><path fill=\"#A564D3\" d=\"M27 2h2v1h-2zM25 4h6v1h-6zM23 14h1v1h-1zM32 14h1v1h-1zM23 15h1v1h-1zM32 15h1v1h-1zM23 16h1v1h-1zM32 16h1v1h-1zM23 17h1v1h-1zM32 17h1v1h-1zM23 19h1v1h-1zM32 19h1v1h-1zM23 20h1v1h-1zM32 20h1v1h-1z\"/><path fill=\"#53326A\" d=\"M25 5h6v1h-6zM24 14h1v1h-1zM31 14h1v1h-1zM24 15h1v1h-1zM31 15h1v1h-1zM24 16h1v1h-1zM31 16h1v1h-1zM24 17h1v1h-1zM31 17h1v1h-1zM23 18h8v1h-8zM32 18h1v1h-1zM24 19h1v1h-1zM31 19h1v1h-1zM24 20h1v1h-1zM31 20h1v1h-1zM23 21h10v1h-10zM23 22h10v1h-10z\"/><path fill=\"#C9A47C\" d=\"M25 7h7v1h-7zM28 11h1v1h-1zM27 12h2v1h-2zM27 13h2v1h-2z\"/><path fill=\"#E8C9A0\" d=\"M25 8h7v1h-7zM25 9h1v1h-1zM28 9h1v1h-1zM31 9h1v1h-1zM25 10h1v1h-1zM28 10h1v1h-1zM31 10h1v1h-1zM25 11h3v1h-3zM29 11h3v1h-3zM25 12h2v1h-2zM29 12h3v1h-3z\"/><path fill=\"#2A2A2A\" d=\"M26 9h2v1h-2zM29 9h2v1h-2zM26 10h2v1h-2zM29 10h2v1h-2z\"/><path fill=\"#7A4A9C\" d=\"M25 14h6v1h-6zM25 15h6v1h-6zM25 16h6v1h-6zM25 17h6v1h-6zM25 19h6v1h-6zM25 20h6v1h-6z\"/><path fill=\"#8A939C\" d=\"M31 18h1v1h-1z\"/></symbol>\n<symbol id=\"hanxiangzi-p-rest\" viewBox=\"0 0 56 24\"><path fill=\"#1A1A1A\" d=\"M35 14h1v1h-1zM34 15h2v1h-2zM34 16h1v1h-1zM33 17h1v1h-1zM32 18h1v1h-1zM31 19h1v1h-1zM30 20h1v1h-1zM29 21h1v1h-1zM28 22h1v1h-1zM27 23h1v1h-1z\"/><path fill=\"#C9A227\" d=\"M35 16h1v1h-1zM34 17h1v1h-1zM33 18h1v1h-1zM32 19h1v1h-1zM31 20h1v1h-1zM30 21h1v1h-1zM29 22h1v1h-1zM28 23h1v1h-1z\"/></symbol>\n<symbol id=\"hanxiangzi-x-rest\" viewBox=\"0 0 56 24\"></symbol>\n<symbol id=\"hanxiangzi-p-work\" viewBox=\"0 0 56 24\"><path fill=\"#1A1A1A\" d=\"M35 9h2v1h-2zM35 10h1v1h-1zM37 11h2v1h-2zM37 12h1v1h-1zM34 13h2v1h-2zM34 14h1v1h-1zM33 15h1v1h-1zM32 16h1v1h-1zM31 17h1v1h-1zM30 18h1v1h-1zM29 19h1v1h-1zM28 20h1v1h-1zM27 21h1v1h-1z\"/><path fill=\"#C9A227\" d=\"M35 14h1v1h-1zM34 15h1v1h-1zM33 16h1v1h-1zM32 17h1v1h-1zM31 18h1v1h-1zM30 19h1v1h-1zM29 20h1v1h-1zM28 21h1v1h-1z\"/></symbol>\n<symbol id=\"hanxiangzi-x-work\" viewBox=\"0 0 56 24\"><path fill=\"#FFFFFF\" d=\"M35 10h1v1h-1zM35 11h1v1h-1zM34 12h2v1h-2zM38 16h1v1h-1zM38 17h1v1h-1zM37 18h2v1h-2z\"/></symbol>\n<symbol id=\"hanxiangzi-p-ask\" viewBox=\"0 0 56 24\"><path fill=\"#1A1A1A\" d=\"M35 10h1v1h-1zM34 11h2v1h-2zM34 12h1v1h-1zM33 13h1v1h-1zM32 14h1v1h-1zM31 15h1v1h-1zM30 16h1v1h-1zM29 17h1v1h-1zM28 18h1v1h-1zM27 19h1v1h-1z\"/><path fill=\"#C9A227\" d=\"M35 12h1v1h-1zM34 13h1v1h-1zM33 14h1v1h-1zM32 15h1v1h-1zM31 16h1v1h-1zM30 17h1v1h-1zM29 18h1v1h-1zM28 19h1v1h-1z\"/></symbol>\n<symbol id=\"hanxiangzi-x-ask\" viewBox=\"0 0 56 24\"><path fill=\"#C9A227\" d=\"M9 4h3v1h-3z\"/><path fill=\"#8A6A3F\" d=\"M10 5h1v1h-1zM10 6h1v1h-1zM10 7h1v1h-1zM10 8h1v1h-1zM10 9h1v1h-1zM10 10h1v1h-1zM10 11h1v1h-1zM10 12h1v1h-1zM10 13h1v1h-1zM10 14h1v1h-1zM10 15h1v1h-1zM10 16h1v1h-1zM10 17h1v1h-1zM10 18h1v1h-1zM10 19h1v1h-1zM10 20h1v1h-1zM10 21h1v1h-1z\"/></symbol>\n<symbol id=\"hanxiangzi-p-done\" viewBox=\"0 0 56 24\"><path fill=\"#1A1A1A\" d=\"M35 13h1v1h-1zM34 14h2v1h-2zM34 15h1v1h-1zM33 16h1v1h-1zM32 17h1v1h-1zM31 18h1v1h-1zM30 19h1v1h-1zM29 20h1v1h-1zM28 21h1v1h-1zM27 22h1v1h-1z\"/><path fill=\"#C9A227\" d=\"M35 15h1v1h-1zM34 16h1v1h-1zM33 17h1v1h-1zM32 18h1v1h-1zM31 19h1v1h-1zM30 20h1v1h-1zM29 21h1v1h-1zM28 22h1v1h-1z\"/></symbol>\n<symbol id=\"hanxiangzi-x-done\" viewBox=\"0 0 56 24\"><path fill=\"#C9A227\" d=\"M34 14h1v1h-1z\"/><path fill=\"#FFFFFF\" d=\"M35 16h1v1h-1z\"/></symbol>\n<symbol id=\"hanxiangzi-f-ask\" viewBox=\"0 0 56 24\"><path fill=\"#B5453C\" d=\"M11 8h4v1h-4zM11 9h5v1h-5zM11 11h5v1h-5z\"/><path fill=\"#8E2F27\" d=\"M11 10h4v1h-4zM11 12h4v1h-4z\"/></symbol>\n<symbol id=\"caoguoju-body\" viewBox=\"0 0 56 24\"><path fill=\"#1A1A1A\" d=\"M26 2h4v1h-4zM25 3h1v1h-1zM30 3h1v1h-1zM24 4h9v1h-9zM20 5h1v1h-1zM25 5h6v1h-6zM35 5h1v1h-1zM20 6h16v1h-16zM24 7h1v1h-1zM32 7h1v1h-1zM24 8h1v1h-1zM32 8h1v1h-1zM24 9h1v1h-1zM32 9h1v1h-1zM24 10h1v1h-1zM32 10h1v1h-1zM24 11h1v1h-1zM32 11h1v1h-1zM24 12h1v1h-1zM32 12h1v1h-1zM25 13h1v1h-1zM30 13h1v1h-1zM21 14h1v1h-1zM34 14h1v1h-1zM21 15h1v1h-1zM34 15h1v1h-1zM21 16h1v1h-1zM34 16h1v1h-1zM21 17h1v1h-1zM34 17h1v1h-1zM21 18h1v1h-1zM34 18h1v1h-1zM21 19h1v1h-1zM34 19h1v1h-1zM21 20h1v1h-1zM34 20h1v1h-1zM21 21h1v1h-1zM34 21h1v1h-1zM21 22h1v1h-1zM34 22h1v1h-1z\"/><path fill=\"#785D14\" d=\"M26 3h4v1h-4zM21 5h4v1h-4zM31 5h4v1h-4zM24 14h1v1h-1zM31 14h1v1h-1zM24 15h1v1h-1zM31 15h1v1h-1zM24 16h1v1h-1zM31 16h1v1h-1zM24 17h1v1h-1zM31 17h1v1h-1zM22 18h10v1h-10zM33 18h1v1h-1zM24 19h1v1h-1zM31 19h1v1h-1zM24 20h1v1h-1zM31 20h1v1h-1zM22 21h12v1h-12zM22 22h12v1h-12z\"/><path fill=\"#3A3330\" d=\"M25 7h7v1h-7zM26 12h1v1h-1zM29 12h1v1h-1zM26 13h4v1h-4z\"/><path fill=\"#E8C9A0\" d=\"M25 8h7v1h-7zM25 9h1v1h-1zM28 9h1v1h-1zM31 9h1v1h-1zM25 10h1v1h-1zM28 10h1v1h-1zM31 10h1v1h-1zM25 11h3v1h-3zM29 11h3v1h-3zM25 12h1v1h-1zM30 12h2v1h-2z\"/><path fill=\"#2A2A2A\" d=\"M26 9h2v1h-2zM29 9h2v1h-2zM26 10h2v1h-2zM29 10h2v1h-2z\"/><path fill=\"#C9A47C\" d=\"M28 11h1v1h-1zM27 12h2v1h-2z\"/><path fill=\"#EEB928\" d=\"M22 14h2v1h-2zM32 14h2v1h-2zM22 15h2v1h-2zM32 15h2v1h-2zM22 16h2v1h-2zM32 16h2v1h-2zM22 17h2v1h-2zM32 17h2v1h-2zM22 19h2v1h-2zM32 19h2v1h-2zM22 20h2v1h-2zM32 20h2v1h-2z\"/><path fill=\"#B0891E\" d=\"M25 14h6v1h-6zM25 15h6v1h-6zM25 16h6v1h-6zM25 17h6v1h-6zM25 19h6v1h-6zM25 20h6v1h-6z\"/><path fill=\"#8A939C\" d=\"M32 18h1v1h-1z\"/></symbol>\n<symbol id=\"caoguoju-p-rest\" viewBox=\"0 0 56 24\"><path fill=\"#1A1A1A\" d=\"M26 16h4v1h-4zM26 17h1v1h-1zM29 17h1v1h-1zM26 18h1v1h-1zM29 18h1v1h-1zM26 19h1v1h-1zM29 19h1v1h-1zM26 20h1v1h-1zM29 20h1v1h-1zM26 21h1v1h-1zM29 21h1v1h-1zM26 22h1v1h-1zM29 22h1v1h-1zM26 23h4v1h-4z\"/><path fill=\"#F2EBD8\" d=\"M27 17h1v1h-1zM27 18h1v1h-1zM27 19h1v1h-1zM27 20h1v1h-1zM27 21h1v1h-1zM27 22h1v1h-1z\"/><path fill=\"#EEB928\" d=\"M28 17h1v1h-1zM28 18h1v1h-1zM28 19h1v1h-1zM28 20h1v1h-1zM28 21h1v1h-1zM28 22h1v1h-1z\"/></symbol>\n<symbol id=\"caoguoju-x-rest\" viewBox=\"0 0 56 24\"></symbol>\n<symbol id=\"caoguoju-p-work\" viewBox=\"0 0 56 24\"><path fill=\"#1A1A1A\" d=\"M26 14h3v1h-3zM30 14h3v1h-3zM26 15h1v1h-1zM28 15h1v1h-1zM30 15h1v1h-1zM32 15h1v1h-1zM26 16h1v1h-1zM28 16h1v1h-1zM30 16h1v1h-1zM32 16h1v1h-1zM26 17h1v1h-1zM28 17h1v1h-1zM30 17h1v1h-1zM32 17h1v1h-1zM26 18h1v1h-1zM28 18h1v1h-1zM30 18h1v1h-1zM32 18h1v1h-1zM26 19h1v1h-1zM28 19h1v1h-1zM30 19h1v1h-1zM32 19h1v1h-1zM26 20h1v1h-1zM28 20h1v1h-1zM30 20h1v1h-1zM32 20h1v1h-1zM26 21h3v1h-3zM30 21h3v1h-3z\"/><path fill=\"#F2EBD8\" d=\"M27 15h1v1h-1zM31 15h1v1h-1zM27 16h1v1h-1zM31 16h1v1h-1zM27 17h1v1h-1zM31 17h1v1h-1zM27 18h1v1h-1zM31 18h1v1h-1zM27 19h1v1h-1zM31 19h1v1h-1zM27 20h1v1h-1zM31 20h1v1h-1z\"/></symbol>\n<symbol id=\"caoguoju-x-work\" viewBox=\"0 0 56 24\"><path fill=\"#C2CAD2\" d=\"M36 15h1v1h-1zM36 16h1v1h-1zM38 18h1v1h-1zM38 19h1v1h-1z\"/></symbol>\n<symbol id=\"caoguoju-p-ask\" viewBox=\"0 0 56 24\"><path fill=\"#1A1A1A\" d=\"M26 12h4v1h-4zM26 13h1v1h-1zM29 13h1v1h-1zM26 14h1v1h-1zM29 14h1v1h-1zM26 15h1v1h-1zM29 15h1v1h-1zM26 16h1v1h-1zM29 16h1v1h-1zM26 17h1v1h-1zM29 17h1v1h-1zM26 18h1v1h-1zM29 18h1v1h-1zM26 19h4v1h-4z\"/><path fill=\"#F2EBD8\" d=\"M27 13h1v1h-1zM27 14h1v1h-1zM27 15h1v1h-1zM27 16h1v1h-1zM27 17h1v1h-1zM27 18h1v1h-1z\"/><path fill=\"#EEB928\" d=\"M28 13h1v1h-1zM28 14h1v1h-1zM28 15h1v1h-1zM28 16h1v1h-1zM28 17h1v1h-1zM28 18h1v1h-1z\"/></symbol>\n<symbol id=\"caoguoju-x-ask\" viewBox=\"0 0 56 24\"><path fill=\"#C9A227\" d=\"M9 4h3v1h-3z\"/><path fill=\"#8A6A3F\" d=\"M10 5h1v1h-1zM10 6h1v1h-1zM10 7h1v1h-1zM10 8h1v1h-1zM10 9h1v1h-1zM10 10h1v1h-1zM10 11h1v1h-1zM10 12h1v1h-1zM10 13h1v1h-1zM10 14h1v1h-1zM10 15h1v1h-1zM10 16h1v1h-1zM10 17h1v1h-1zM10 18h1v1h-1zM10 19h1v1h-1zM10 20h1v1h-1zM10 21h1v1h-1z\"/></symbol>\n<symbol id=\"caoguoju-p-done\" viewBox=\"0 0 56 24\"><path fill=\"#1A1A1A\" d=\"M26 15h4v1h-4zM26 16h1v1h-1zM29 16h1v1h-1zM26 17h1v1h-1zM29 17h1v1h-1zM26 18h1v1h-1zM29 18h1v1h-1zM26 19h1v1h-1zM29 19h1v1h-1zM26 20h1v1h-1zM29 20h1v1h-1zM26 21h1v1h-1zM29 21h1v1h-1zM26 22h4v1h-4z\"/><path fill=\"#F2EBD8\" d=\"M27 16h1v1h-1zM27 17h1v1h-1zM27 18h1v1h-1zM27 19h1v1h-1zM27 20h1v1h-1zM27 21h1v1h-1z\"/><path fill=\"#EEB928\" d=\"M28 16h1v1h-1zM28 17h1v1h-1zM28 18h1v1h-1zM28 19h1v1h-1zM28 20h1v1h-1zM28 21h1v1h-1z\"/></symbol>\n<symbol id=\"caoguoju-x-done\" viewBox=\"0 0 56 24\"><path fill=\"#C9A227\" d=\"M36 16h1v1h-1z\"/><path fill=\"#FFFFFF\" d=\"M37 18h1v1h-1z\"/></symbol>\n<symbol id=\"caoguoju-f-ask\" viewBox=\"0 0 56 24\"><path fill=\"#B5453C\" d=\"M11 8h4v1h-4zM11 9h5v1h-5zM11 11h5v1h-5z\"/><path fill=\"#8E2F27\" d=\"M11 10h4v1h-4zM11 12h4v1h-4z\"/></symbol>\n</svg>";

		// 顶栏文案的沿革（三步，都留在注释里免得后人重走）：
		//   ①「八席」——用户原话「看着莫名其妙」：只说了数量、没说关系。
		//   ②「八仙列坐」+ 五行悬停 —— 讲清了，但用户判定「写得太具体、太解释设计了」。
		//   ③ 现在的对句（见下方 BOARD_TITLE）：严格对仗、句中不带「八」、**顶栏直出且无悬停**。
		// 教训写在这里：匾额不该解释设计；它只需是一句挂得住的话，8 这个数字交给计数圆标。
		// 每个状态一句话解释。悬停给全 —— 免得「待过目」「待命」之间又要靠猜。
		// 注意「待过目」的解释里必须写明「不保证成功」：平台是在 running 的 true→false
		// 边沿点亮提醒的（client.js syncCompletedNotifications），失败/中断同样会点亮。
		const STATE_HINT = {
			"虚席": "虚席：这一席还没绑会话，点它就位（点一下=在这一席新建会话）",
			"待命": "待命：已就位，尚未开工",
			"运功": "运功：这一席正在干活（会话在跑；法宝动 = 在运功）",
			"待过目": "待过目：有一轮结束了、你还没看过它。一阅即消；不保证成功（失败或中断也会点亮）",
			"休息": "休息：闲置中，没有待阅的结果",
			"待答": "待答：它抛了问题卡在这里，等你回话（点开即接手）",
			"待裁": "待裁：有未审的审批卡在这里，等你定夺（点开即接手）",
		};

		// 顶栏就是这句对句本身 —— 没有独立标题、**也不配悬停解释**（用户明确要求）。
		// 所以它必须自己站得住：一句严格对仗的古文，不解释任何设计机制。
		//   出处：《周易·系辞上》「夫乾，其静也专，其动也直，是以大生焉。」
		//   取它，是因为它写的正是这块板的**两种状态**：
		//     其静也专 —— 闲着时蓄势专一（待命/休息/待过目）
		//     其动也直 —— 跑起来时直取目标（运功）
		//   用字全为正面（专、直），不会被读成「板子不动了」。
		//   约束（用户两次给出）：**对仗** + **句中不带「八」**；8 这个数字只由右侧计数圆标承担。
		//   实宽 107px / 栏内可用 214px（11px 字号、letter-spacing .08em，实测）。
		const BOARD_TITLE = "其静也专，其动也直";

		// ---- 八席 ---------------------------------------------------------------
		const SEATS = [
			{ id: "hanzhongli",   key: "seat-1", name: "钟离", role: "总控 · 规划", color: "#A8543A" },
			{ id: "ludongbin",    key: "seat-2", name: "洞宾", role: "执行 · 攻坚", color: "#2E8A9C" },
			{ id: "tieguali",     key: "seat-3", name: "铁拐", role: "修复 · 值守", color: "#5A5F66" },
			{ id: "zhangguolao",  key: "seat-4", name: "张果", role: "审查 · 复盘", color: "#3F7A55" },
			{ id: "hexiangu",     key: "seat-5", name: "仙姑", role: "文档 · 整理", color: "#B85A7A" },
			{ id: "lancaihe",     key: "seat-6", name: "采和", role: "检索 · 收集", color: "#3F4F9C" },
			{ id: "hanxiangzi",   key: "seat-7", name: "湘子", role: "谋议 · 协调", color: "#7A4A9C" },
			{ id: "caoguoju",     key: "seat-8", name: "国舅", role: "决断 · 验证", color: "#B0891E" },
		];

		// ---- 槽位绑定（持久化 + 可订阅，让席位身份稳定）--------------------------
		/**
		 * 存储 v3。**v1/v2 一律不读、直接重新播种** ——
		 * v2 的播种逻辑没过滤子会话，实测 8 席里 6 席绑到了 `delegationDepth=1` 的子会话，
		 * 点开席位看到的是「subagent 的 transcript」而不是自己的会话。这份数据没有修复价值。
		 */
		const BIND_KEY = "dsh-agent-grid.bindings.v3";

		const bindListeners = new Set();
		function subscribeBindings(fn) {
			bindListeners.add(fn);
			return () => { bindListeners.delete(fn); };
		}
		function emitBindings() { bindListeners.forEach((fn) => fn()); }

		function readStore() {
			try {
				const raw = window.localStorage.getItem(BIND_KEY);
				if (raw) {
					const parsed = JSON.parse(raw);
					if (parsed && typeof parsed === "object" && parsed.bind) {
						return { seeded: parsed.seeded === true, bind: parsed.bind };
					}
				}
			} catch (e) { /* localStorage 不可用就退化成不持久 */ }
			return { seeded: false, bind: {} };
		}

		function writeStore(store) {
			try { window.localStorage.setItem(BIND_KEY, JSON.stringify(store)); } catch (e) { /* 同上 */ }
		}

		/**
		 * 一个会话能不能坐进席位。
		 *
		 * **必须排除子会话**（`origin === 'subagent'` 或带 `parentId`）。
		 * 实测踩过：播种时没过滤，8 席里 6 席绑到了 `delegationDepth=1` 的子会话，
		 * 点开席位看到的是子 agent 的 transcript（正文写着 "Result sent to the parent agent"），
		 * 自己的会话反而一个都看不到。
		 */
		function isSeatEligible(summary) {
			return !!summary && summary.origin !== "subagent" && summary.parentId === undefined;
		}

		/**
		 * 席位绑定。三条规则，每条都是实测踩出来的：
		 *
		 * 1. `ready` 才动 —— 只能信 `phase === 'ready'` 的会话列表。首次渲染时列表还是
		 *    `pending`（ids 为空），拿空列表去判定「会话已死」会把全部绑定一次清光。
		 * 2. 播种只挑**顶层**会话，且不重复占用同一个。
		 * 3. `seeded` 之后绑定归用户；只清理失效的（会话没了 / 变成子会话），
		 *    不自动补位 —— 否则「清空重做」会当场自我撤销。
		 */
		function reconcile(ids, byId, ready, current) {
			const store = readStore();
			if (!ready) return store.bind; // 列表未就绪：一律不动

			const eligible = ids.filter((id) => isSeatEligible(byId[id]));

			if (!store.seeded) {
				const taken = new Set();
				SEATS.forEach((seat) => {
					const pick = eligible.find((id) => !taken.has(id));
					if (pick !== undefined) {
						store.bind[seat.id] = pick;
						taken.add(pick);
					}
				});
				store.seeded = true;
				writeStore(store);
				return store.bind;
			}

			let changed = false;
			SEATS.forEach((seat) => {
				const cur = store.bind[seat.id];
				if (cur === undefined) return;
				// 会话没了，或者它其实是子会话 -> 解绑（子会话占席位毫无意义）
				if (!isSeatEligible(byId[cur])) {
					delete store.bind[seat.id];
					changed = true;
					return;
				}
				// 空白会话只允许一个席位持有，而且必须是**当前**那一个。
				//
				// 为什么：平台的 connectWorkspace() 在切换工作区时会打开「该工作区里
				// 第一个 blank 会话」（源码写死）。如果每个空席都留着自己的空白会话，
				// 用户一选工作区就会被弹到别的席位去（实测踩过：国舅选目录 → 跳到洞宾）。
				//
				// **但触发条件必须收紧到「current 本身也是空白槽」。** 真机复现过一条：
				// 用户在某一席开了一个空白对话，然后点去看别的**正常**对话 —— 按原来的
				// 「current 一变就清」写法，那一席的空白槽立刻被解绑，八席看板上它就此
				// 消失（看板只渲染 bindings，无主会话没有任何呈现）。而它是个 blank 会话，
				// 在默认侧栏里**只有作为 selected 时才可见** —— 用户体验就是
				// 「这条对话从八仙开始，然后不见了，只能切回原始侧边栏才找得到」。
				//
				// connectWorkspace 弹跳的现场特征是 **current 变成了另一个空白槽**（收件人
				// 是那个新 blank），所以只在那一点上清理别的 blank，既保住原有防护，
				// 又不会因为用户「切走看一眼」就丢掉待命席位。
				//
				// 另外 current 为空时必须整个跳过：平台 `sessions.clear()` 之后（用户正看着
				// 「选择工作目录」空态）列表处在中间态，按它裁决会把**所有**「待命」席位的
				// 绑定一次清光 —— 于是 clear 完那一席就再也回不到自己的会话了。
				const summary = byId[cur];
				const currentIsBlank = current !== undefined
					&& byId[current] !== undefined
					&& byId[current].blank === true;
				if (currentIsBlank && summary && summary.blank === true && cur !== current) {
					delete store.bind[seat.id];
					changed = true;
				}
			});
			if (changed) writeStore(store);
			return store.bind;
		}

		/** 清空一席：解绑当前会话，但保留席位身份（人设/编号/主色都不动）。 */
		function clearSeatBinding(seatId) {
			const store = readStore();
			store.seeded = true;
			if (store.bind[seatId] !== undefined) {
				delete store.bind[seatId];
				writeStore(store);
			}
			emitBindings();
		}

		/**
		 * 把一席绑到某个会话。
		 *
		 * 设计前提：**八席是固定上限，不存在「无限再加一个对话」的入口**。
		 * 所以空席点击 = 在这一席新建会话（而不是去别处新建再回来绑）。
		 */
		function setSeatBinding(seatId, sessionId) {
			const store = readStore();
			store.seeded = true;
			store.bind[seatId] = sessionId;
			writeStore(store);
			emitBindings();
		}

		/** 反查：某个 session 属于哪一席（原装对话头用它决定要不要显示席位徽章）。 */
		function seatForSession(sessionId) {
			if (sessionId === undefined || sessionId === null) return null;
			const bind = readStore().bind;
			for (const seat of SEATS) {
				if (bind[seat.id] === sessionId) return seat;
			}
			return null;
		}

		function useBindings() {
			const [, force] = React.useReducer((n) => n + 1, 0);
			React.useEffect(() => subscribeBindings(force), []);
			return null;
		}

		// ---- 侧边栏模式开关 -----------------------------------------------------
		/**
		 * 「随时切回默认侧边栏」的实现要点：**卸载注册**，而不是隐藏组件。
		 *
		 * 八席网格是以 `priority: -1` 遮蔽内置 WorkspaceBrowser（priority 0）的。
		 * single slot 的渲染取 priority 升序的 index 0 —— 所以只要把我们的注册 dispose 掉，
		 * 内置的会话浏览器就自动回到渲染位。不需要重启、不需要改 patch 文件。
		 */
		const SETTINGS_NS = "agent-grid";
		const SIDEBAR_FIELD = "sidebar";
		const SIDEBAR_DEFAULT = "grid";

		let sidebarMode = SIDEBAR_DEFAULT;
		/** 八席网格的注册句柄；null = 当前没挂（内置浏览器生效）。 */
		let gridDisposer = null;
		/** workspace slot 是否已声明 + 注册函数（apply 注入，避免闭包循环依赖）。 */
		let slotReady = false;
		let registerGrid = null;
		/** 设置 scope；持久化不可用时保持 null，开关仍然本地可用。 */
		let sidebarScope = null;
		/** 用户本次会话内的显式选择：优先于 scope 的首次同步，免得被旧值盖回去。 */
		let localChoice = null;

		const modeListeners = new Set();
		function emitMode() {
			modeListeners.forEach((fn) => fn());
		}

		function useSidebarMode() {
			const [, force] = React.useReducer((n) => n + 1, 0);
			React.useEffect(() => {
				modeListeners.add(force);
				return () => { modeListeners.delete(force); };
			}, []);
			return sidebarMode;
		}

		/** 真正决定「挂不挂八席网格」。卸载后内置 WorkspaceBrowser 自动回到渲染位。 */
		function applySidebarMode(mode) {
			sidebarMode = mode === "default" ? "default" : "grid";
			// 只在网格模式下隐藏原生「新建会话」按钮（切回默认模式要还回去）
			if (typeof document !== "undefined") {
				document.documentElement.classList.toggle("dsx-grid-mode", sidebarMode === "grid");
			}
			if (slotReady && registerGrid !== null) {
				const wantGrid = sidebarMode === "grid";
				if (wantGrid && gridDisposer === null) {
					gridDisposer = registerGrid();
				} else if (!wantGrid && gridDisposer !== null) {
					const dispose = gridDisposer;
					gridDisposer = null;
					dispose();
				}
			}
			emitMode();
		}

		/**
		 * 切换侧边栏模式的唯一入口（设置 → 通用 里的那一行）。
		 * 先本地生效（立刻看得到效果），再尽力持久化。
		 */
		function chooseSidebarMode(next) {
			localChoice = next;
			applySidebarMode(next);
			if (sidebarScope !== null) sidebarScope.set(SIDEBAR_FIELD, next);
		}

		/**
		 * 「设置 → 通用」里的一行。
		 * 该 slot 的契约明说 owner 不传任何 props、也不投影 label —— 整行自己画。
		 */
		function SidebarModeRow() {
			const mode = useSidebarMode();
			const persistable = sidebarScope !== null;
			const pick = chooseSidebarMode;
			const options = [["grid", "仙班"], ["default", "默认"]];
			return h("div", { className: "dsx-setrow" }, [
				h("div", { key: "l", className: "dsx-settext" }, [
					h("div", { key: "t", className: "dsx-settitle" }, "侧边栏"),
					h("div", { key: "d", className: "dsx-setdesc" },
						"仙班 = 定员席位网格（其静也专，其动也直）；默认 = 原生会话浏览"
							+ (persistable ? "" : "（当前无法持久化，重启后复原）")),
				]),
				h("div", { key: "c", className: "dsx-seg", role: "radiogroup", "aria-label": "侧边栏模式" },
					options.map(([value, label]) => h("button", {
						key: value,
						type: "button",
						role: "radio",
						"aria-checked": mode === value,
						className: "dsx-segbtn" + (mode === value ? " is-on" : ""),
						onClick: () => pick(value),
					}, label))),
			]);
		}

		// ---- 状态与「当前动作」--------------------------------------------------
		/**
		 * 活动状态（正交维度之一）。全部由 SessionSummary 的真实字段派生，不编造。
		 *
		 * 注意 `empty`（灰色）只留给**没有绑定会话**的席位。
		 * 「绑了一个空白会话」是「已就绪待命」，不是「未启用」—— 两者混在一起会让人
		 * 以为席位是坏的（实测：三个席位被误画成灰的）。
		 */
		function stateOf(summary) {
			if (!summary) return { cls: "empty", label: "虚席" };   // 与格内「此位虚席 · 点此就位」同一套词
			// 「运功」：仙侠语，与「仙班 / 各持法宝」这套词同一语境 ——
			// 法宝动就是运功，正好对上格子里小人法宝的动效（也正是顶栏「其动也直」的那个「动」）。
			// 原来的「工作中」是唯一一处现代白话，和虚席/待命/待过目摆在一起不对账。
			// （备选：当值=值守语更实，但和 铁拐 的职守「修复·值守」撞「值」字，故取运功。）
			if (summary.running) return { cls: "working", label: "运功" };
			// 这个不是生命周期，是**未读提醒**：平台在 running 的 true→false 边沿点亮，
			// 不判成败（失败/中断同样点亮），选中该会话即清除。所以名字不许声称成功。
			if (summary.completed) return { cls: "done", label: "待过目" };
			if (summary.blank) return { cls: "rest", label: "待命" };
			return { cls: "rest", label: "休息" };
		}

		/** 紧凑的相对时间：12s / 3m / 2h / 1d —— 格子太窄，放不下「N 分钟前」。 */
		function shortAgo(ms) {
			if (!ms) return "";
			const d = Date.now() - ms;
			if (d < 60e3) return Math.max(1, Math.round(d / 1e3)) + "s";
			if (d < 3600e3) return Math.round(d / 60e3) + "m";
			if (d < 86400e3) return Math.round(d / 3600e3) + "h";
			return Math.round(d / 86400e3) + "d";
		}

		function relTime(ms) {
			if (!ms) return "";
			const d = Date.now() - ms;
			if (d < 60e3) return "刚刚";
			if (d < 3600e3) return Math.floor(d / 60e3) + " 分钟前";
			if (d < 86400e3) return Math.floor(d / 3600e3) + " 小时前";
			return Math.floor(d / 86400e3) + " 天前";
		}

		/**
		 * 路径 basename —— 卡片宽 ~120px，放不下完整路径（设计文档：完整路径进 tooltip）。
		 * 同时认 `/` 和 `\`，末尾斜杠先去掉，免得 "/a/b/" 显示成空。
		 */
		function baseName(path) {
			if (typeof path !== "string") return "";
			const trimmed = path.replace(/[/\\]+$/, "");
			const cut = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
			return cut >= 0 ? trimmed.slice(cut + 1) : trimmed;
		}

		/**
		 * 卡片上的「一行当前动作」。
		 *
		 * 这是**兜底行**：只有当 host 投影（seat-activity）没有值时才会被看到。
		 * 工具名 / 想 / ↳ / 说 那四行现在由投影提供（见 lib/index.js 的 seat-activity），
		 * 不再受「SessionSummary 只有 running/blank/updatedAt」的限制 ——
		 * 那条限制是老版本的说法，早已被 host 侧投影解决。
		 * 投影为空的情形：纯历史会话（本进程这一轮没活过）、或 host 未加载插件。
		 */
		function actionLine(summary, jobs) {
			if (!summary || summary.blank) return "";
			const n = jobs ? jobs.length : 0;
			if (summary.running) return n > 0 ? "运功 · " + n + " 事" : "运功";
			if (summary.completed) return "待过目 · 一阅即消";
			if (n > 0) return "另有 " + n + " 事";
			return summary.updatedAt ? relTime(summary.updatedAt) : "";
		}

		// ---- 头像（两帧；只有 live 才动）----------------------------------------
		// ---- 小人（分层 sprite）：身体 / 法宝 / 广域动效 / 朱砂旗 -------------------
		/**
		 * 精灵表是**分层**的（生成器 design/baxian.py 每席产 10 个 symbol）：
		 *   {id}-body    头身冠须 —— 四态共用，动作靠 CSS 平移，不重画
		 *   {id}-p-<态>  法宝在该态的位姿（收起 / 在用 / 举起 / 归位）
		 *   {id}-x-<态>  贴着法宝外缘长出来的广域动效（画在画布左右边距里）
		 *   {id}-f-ask   朱砂旗面 —— 单独一层，因为只有它要单独摆
		 * 好处：四态 × 八席 = 32 种姿势，但矩形数只比原来的 2 态多一成，
		 * 因为身体只画一份、动作交给 CSS；合成表按行游程压成 path，实测 38KB。
		 */
		const AV_STATES = { rest: 1, work: 1, ask: 1, done: 1 };
		function Avatar(id, state, opts) {
			const st = AV_STATES[state] ? state : "rest";
			const o = opts || {};
			return h("svg", {
				// dsx-s-<席位> 是给「一席一套动作」用的：动作按**法宝**分语法，不共用
				className: "dsx-av dsx-s-" + id + " is-" + st + (o.chip ? " is-chip" : "")
					+ (o.empty ? " is-empty" : "") + (o.live ? " is-live" : ""),
				viewBox: "0 0 56 24",
				preserveAspectRatio: "xMidYMid meet",
				shapeRendering: "crispEdges",
				"aria-hidden": "true",
				focusable: "false",
			}, [
				// 图层顺序（后画在上）：身体 → （动效 + 旗 + 法宝）
				// 为什么合成一组：法宝动作要**带着自己的出效一起走**（扇子挥到哪儿，风就从哪儿出去）；
				// 旗也进组 —— 它是「他举的旗」，站位一偏移（−8…+7 格）就必须跟着人走，
				// 否则会出现「人站左边、旗还钉在画面中央」。动效在外缘，压在身上也不碍事。
				h("use", { key: "b", className: "dsx-bd", href: "#" + id + "-body" }),
				h("g", { key: "g", className: "dsx-grp" }, [
					h("use", { key: "x", className: "dsx-fx", href: "#" + id + "-x-" + st }),
					st === "ask"
						? h("use", { key: "f", className: "dsx-fl", href: "#" + id + "-f-ask" })
						: null,
					h("use", { key: "p", className: "dsx-pp", href: "#" + id + "-p-" + st }),
				]),
			]);
		}

		/**
		 * 拦掉原生「新建会话」的触发（鼠标 + 键盘）。
		 *
		 * 为什么不用 display:none 了事：那个按钮**同时承载左上角的品牌 logo**，
		 * 隐藏它左上角就空一块。所以保留外观、只拦行为 —— 八席模式下新建只能点空席。
		 * 只在网格模式生效，切回「默认」模式按钮完全恢复正常。
		 */
		function registerNewSessionGuard() {
			// 三重匹配：独立新建按钮、aria（中英两版）、以及 logo 那个 hash 类名的 brand 按钮。
			// 类名子串再兜一层 —— 平台的构建 hash 会变，但 `_newSession` / `_brand` 是稳定语义名。
			const hit = (node) => node instanceof Element
				? node.closest('button[aria-label="新建会话"], button[aria-label="New session"], [class*="_newSession"], button[class*="_brand"]')
				: null;
			const swallow = (event) => {
				if (sidebarMode !== "grid") return;
				if (hit(event.target) === null) return;
				event.preventDefault();
				event.stopPropagation();
			};
			const onKey = (event) => {
				if (event.key !== "Enter" && event.key !== " " && event.key !== "Spacebar") return;
				swallow(event);
			};
			if (typeof document === "undefined") return () => {};
			document.addEventListener("click", swallow, true);
			document.addEventListener("keydown", onKey, true);
			return () => {
				document.removeEventListener("click", swallow, true);
				document.removeEventListener("keydown", onKey, true);
			};
		}

		// ---- apply 注入的闭包 ---------------------------------------------------
		/** 打开某席的会话 —— 主栏随后显示的是**原装** Conversation。 */
		let openSeatSession = () => {};
		/** 空席新建会话（由 apply 里注入 sessions 服务后赋值）。 */
		let createSeatSession = null;
		/** 把某席换到另一个工作目录：选目录 → 登记工作区 → 在该工作区开新会话。 */
		let switchSeatDirectory = null;
		/** 「这一席马上会认领一个新空白会话」——只记事实，定时器归 sessions fiber 管。 */
		let beginSeatClaim = null;
		/** 同席接力：这一席还在防连点窗口里，但用户刚又选了一次目录，这次必须生效。 */
		let claimSeatNow = null;
		/**
		 * 正在等平台把「空白会话」准备好、好认领的那一席。
		 *
		 * 形状是 `{ seatId, cwd, at }` 而不是裸的 seatId —— 两个字段都必须跟着走：
		 *
		 *   cwd —— 只认领**这个工作目录**里的空白会话。平台的 `connectWorkspace()` 会
		 *     复用「该工作区里第一个 blank 会话」，而八席模式下别的席位也可能留着空白槽；
		 *     没有这道校验，clear 国舅会认领到钟离留在别处的空席（实测踩过）。
		 *
		 *   at —— claim 是有寿命的。`/clear` 信号在 20s 窗口里会被重放，一个永不失效的
		 *     claim 会在几十秒后劫持一个毫不相干的空白会话，把人送到别的席位上。
		 */
		let pendingSeat = null;
		/** 认领有效期：超过就丢弃 —— 宁可不认，也不能认错。 */
		const CLAIM_TTL_MS = 30000;
		/** 最近一次「当前会话」所属的席位 —— 换工作区文件夹后靠它把新空白槽归位。 */
		let lastSeatId = null;
		/** 平台的新建流程（uiWorkspace.startSession）—— 会复用工作区唯一的空白会话。 */
		let startNewSessionFlow = () => {};
		/** 工作区列表读取器（由 uiWorkspace fiber 注入，避免两个 fiber 互相依赖）。 */
		let workspaceListOf = () => [];
		/** 正在创建中的席位 —— 防手抖连点（点两下就多出两个会话，与八席上限的设计相悖）。 */
		const creatingSeats = new Set();

		// ---- 侧栏：8 格 ---------------------------------------------------------
		function SeatGrid(props) {
			const useSessions = props.useSessions;
			const wide = props.wide !== false;
			const expandSidebar = props.expandSidebar;

			useBindings();
			// 每 30s 重渲染一次：格子里的「多久没动」得跟着走
			const [, tickAgo] = React.useReducer((n) => n + 1, 0);
			React.useEffect(() => {
				const id = setInterval(tickAgo, 30000);
				return () => clearInterval(id);
			}, []);
			const state = useSessions ? useSessions((s) => s) : null;

			const ids = state ? state.ids : [];
			const byId = state ? state.byId : {};
			const jobs = state && state.jobsBySession ? state.jobsBySession : {};
			const current = state ? state.current : undefined;
			// 只有 phase==='ready' 的列表才可信 —— pending 时 ids 为空，裁剪会误伤全部绑定
			const bindings = reconcile(ids, byId, !!state && state.phase === "ready", current);

			const cells = SEATS.map((seat) => {
				const sid = bindings[seat.id];
				const summary = sid !== undefined ? byId[sid] : undefined;
				const st0 = stateOf(summary);
				const jobList = sid !== undefined ? jobs[sid] : undefined;
				// host 侧投影：最后一条工具调用 + thinking + 工具结果 + 最后一段助手文本 + 是否在等你。
				// 读不到（host 未加载 / 空日志）时是 undefined，卡片自动降级。
				const act = summary && summary.projectionValues
					? summary.projectionValues["seat-activity"]
					: undefined;
				// 「需要你接手」优先于一切普通状态 —— 这一席已经卡住不动，必须一眼扫到
				const needsYou = !!(act && act.attention);
				const st = needsYou
					? {
						cls: "blocked",
						// 「待裁/待答」与「待命/待过目」共用「待」字，也和顶栏「N 位待你」同族。
						label: act.attention === "approval" ? "待裁" : "待答",
						} 
					: st0;
				// 「选中」= 当前会话就是这一席的会话（不是某个自制的 main 面板）
				const active = sid !== undefined && sid === current;
				const live = active || st0.cls === "working";
				// 小人姿势跟着**事实**走，不是跟着装饰走：
				//   等你 → 举旗召你 ｜ 干活 → 法宝出效 + 单向步进 ｜ 待过目 → 归位余晖 ｜ 其余 → 收起静止
				const sprite = needsYou ? "ask"
					: st0.cls === "working" ? "work"
						: st0.cls === "done" ? "done" : "rest";
				return {
					seat, sid, summary, st, active, live, jobList, act, needsYou, sprite,
					vars: { "--dsx-accent": seat.color },
					line: actionLine(summary, jobList),
					// 这一席在哪干活（SessionSummary.cwd，宿主会话创建时定下）。
					// 空席没有会话，也就没有目录 —— 那行整个不渲染。
					cwd: summary && typeof summary.cwd === "string" ? summary.cwd : "",
				};
			});

			// `/clear` 的信号：某席投影里的 clearedAt 变新 = 用户刚 clear 了那一席。
			// 响应方式就是「空席新建」那一套 —— 在同一工作区开一个**新会话**并绑回本席：
			// 界面空白、卡片 init，正是「跟新开一个对话一样」；旧会话原样留着，随时能回去。
			//
			// 为什么必须新建会话而不是就地清：GUI 的对话历史按 append-origin 事件渲染，
			// replacement 只对模型生效 —— 同一个 session 的界面在设计上就清不掉。
			//
			// 只认最近 20 秒内的信号：页面刷新会把历史上每次 clear 都重放一遍，
			// 没有这道闸，刷新一次就会莫名其妙连开好几个会话。
			//
			// 而且一轮里**只处理最新的那一个**。逐席触发的话，重放出来的一串信号会
			// 连着开好几个会话，而**最后被处理的那一席**会把当前焦点抢走 —— 表现就是
			// 「clear 了国舅，焦点却跑到钟离」。只认最近一次，就只开一个、也只跳一次。
			const handledClear = React.useRef({});
			React.useEffect(() => {
				if (createSeatSession === null) return;
				const now = Date.now();
				let newest = null;
				for (const c of cells) {
					const at = c.act && typeof c.act.clearedAt === "number" ? c.act.clearedAt : 0;
					if (at === 0 || now - at > 20000) continue;
					if (handledClear.current[c.seat.id] === at) continue;
					handledClear.current[c.seat.id] = at;
					if (newest === null || at > newest.at) newest = { seatId: c.seat.id, at };
				}
				if (newest !== null) createSeatSession(newest.seatId);
			});

			if (!wide) {
				return h("div", { className: "dsx-rail" },
					cells.map((c) => h("button", {
						key: c.seat.id,
						type: "button",
						title: c.seat.name + " · " + c.st.label,
						className: "dsx-railbtn" + (c.active ? " is-active" : "") + " is-" + c.st.cls
							+ (c.needsYou ? " is-needs-you" : ""),
						style: c.vars,
						onClick: () => {
							if (expandSidebar) expandSidebar();
							if (c.sid !== undefined) openSeatSession(c.sid);
							else if (createSeatSession !== null) createSeatSession(c.seat.id);
						},
					}, Avatar(c.seat.id, c.sprite, { chip: true, empty: c.sid === undefined, live: c.live }))));
			}

			return h("div", { className: "dsx-root" }, [
				h("div", { key: "head", className: "dsx-head" }, [
					h("span", { key: "t", className: "dsx-title" }, BOARD_TITLE),
					cells.some((c) => c.needsYou)
						? h("span", { key: "a", className: "dsx-attn" }, cells.filter((c) => c.needsYou).length + " 位待你")
						: h("span", { key: "c", className: "dsx-count" }, "8"),
				]),
				// 2 列 x 4 行：每格 ~120px —— 刚好够「头像 + 名字/状态 + 工具 + 想 + ↳ + 说」。
				// 4 列的话每格只剩 ~57px，任何动态文字都放不下（实测过），
				// 而「八席各自的实时动态同时可见」才是这个看板的意义。
				h("div", { key: "grid", className: "dsx-grid" },
					cells.map((c) => h("button", {
						key: c.seat.id,
						type: "button",
						className: "dsx-card" + (c.active ? " is-active" : "") + " is-" + c.st.cls
							+ (c.needsYou ? " is-needs-you" : ""),
						style: c.vars,
						title: [c.seat.name + " · " + c.seat.role + " · " + c.st.label]
							.concat(STATE_HINT[c.st.label] ? [STATE_HINT[c.st.label]] : [])
							.concat(c.act && c.act.toolName ? [c.act.toolName + " " + c.act.toolArg] : [])
							.concat(c.act && c.act.think ? ["想: " + c.act.think] : [])
							.concat(c.act && c.act.result ? ["结果: " + c.act.result] : [])
							.concat(c.act && c.act.text ? ["说: " + c.act.text] : [])
							.join("\n"),
						// 点席位 = 打开该席会话；空席 = 在这一席新建。
						onClick: () => {
							if (c.sid !== undefined) openSeatSession(c.sid);
							else if (createSeatSession !== null) createSeatSession(c.seat.id);
						},
					}, [
						h("span", { key: "av", className: "dsx-avslot" },
							Avatar(c.seat.id, c.sprite, { empty: c.sid === undefined, live: c.live })),
						h("span", { key: "h", className: "dsx-row1" }, [
							h("span", { key: "n", className: "dsx-name" }, c.seat.name),
							h("span", { key: "s", className: "dsx-state " + c.st.cls }, c.st.label),
						]),
						// 过程第 1 行：当前工具 + 距上次活动多久（「还活着吗」最直接的证据）
						c.act && c.act.toolName
							? h("span", { key: "t", className: "dsx-tool" }, [
								h("span", { key: "k", className: "dsx-toolname" }, c.act.toolName),
								c.act.toolArg ? h("span", { key: "a", className: "dsx-toolarg" }, c.act.toolArg) : null,
								c.act.time ? h("span", { key: "e", className: "dsx-elapsed" }, shortAgo(c.act.time)) : null,
							])
							: h("span", { key: "t", className: "dsx-tool is-quiet" },
								c.needsYou ? (c.act.attention === "approval" ? "待你定夺" : "待你回话")
									: c.sid === undefined ? "此位虚席 · 点此就位" : (c.line || "—")),
						// 过程第 2 行：思考（最后一段 reasoning）
						c.act && c.act.think
							? h("span", { key: "k", className: "dsx-think" }, [
								h("span", { key: "tag", className: "dsx-tag" }, "想"),
								h("span", { key: "v", className: "dsx-thinktext" }, c.act.think),
							])
							: null,
						// 过程第 3 行：最后一条工具结果
						c.act && c.act.result
							? h("span", { key: "r", className: "dsx-result" }, [
								h("span", { key: "tag", className: "dsx-tag" }, "↳"),
								h("span", { key: "v", className: "dsx-restext" }, c.act.result),
							])
							: null,
						// 过程第 4 行：最后一段助手正文
						c.act && c.act.text
							? h("span", { key: "x", className: "dsx-text" }, [
								h("span", { key: "tag", className: "dsx-tag" }, "说"),
								h("span", { key: "v", className: "dsx-thinktext" }, c.act.text),
							])
							: null,
						// 常驻一行：这一席在哪个目录干活 —— 点它就是「换工作目录」。
						// 卡片本身是 <button>，所以这里只能用带 role 的 span（嵌套 button 非法），
						// 而且必须 stopPropagation，否则外层会当成「打开该席会话」。
						c.cwd
							? h("span", {
								key: "cwd",
								className: "dsx-cwd",
								role: "button",
								tabIndex: 0,
								title: c.cwd + "\n点此换工作目录（这一席在新目录重开会话）",
								onClick: (event) => {
									event.preventDefault();
									event.stopPropagation();
									if (switchSeatDirectory !== null) switchSeatDirectory(c.seat.id);
								},
								onKeyDown: (event) => {
									if (event.key !== "Enter" && event.key !== " ") return;
									event.preventDefault();
									event.stopPropagation();
									if (switchSeatDirectory !== null) switchSeatDirectory(c.seat.id);
								},
							}, [
								// 与「想 / ↳ / 说」同一个 .dsx-tag —— 同一族标签，天然对齐
								h("span", { key: "tag", className: "dsx-tag" }, "驻"),
								h("span", { key: "v", className: "dsx-cwdtext" }, baseName(c.cwd)),
							])
							: null,
					]))),
			]);
		}

		// ---- 原装对话头：席位徽章（这一层才是「在原装 UI 上做定位升级」）----------
		function SeatBadge(props) {
			useBindings();
			const seat = seatForSession(props.sessionId);
			if (!seat) return null; // 不属于任何席位 -> 原装对话头保持原样，不打扰
			return h("span", {
				className: "dsx-badge",
				style: { "--dsx-accent": seat.color },
				title: seat.name + " · " + seat.role,
			}, [
				Avatar(seat.id, "rest", { chip: true }),
				h("span", { key: "t", className: "dsx-badge-t" }, [
					h("span", { key: "n", className: "dsx-badge-n" }, seat.name),
					h("span", { key: "r", className: "dsx-badge-r" }, seat.role),
				]),
			]);
		}

		// ---- 样式 ---------------------------------------------------------------
		const CSS = `
.dsx-root{display:flex;flex-direction:column;gap:8px;min-height:0;height:100%;padding:2px 4px 8px;overflow-y:auto;}
.dsx-head{display:flex;align-items:center;justify-content:space-between;padding:0 2px;}
.dsx-title{font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary,#8B8478);}
.dsx-count{font-size:10px;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-tertiary,#8B8478);
  border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.12));border-radius:999px;padding:1px 7px;}

/* 2 列 x 4 行 —— 八席各自的动态同时可见（这才是看板的意义）。
   为什么不是 4 列：侧栏 256px 时 4 列每格只剩 ~57px，任何动态文字都放不下；
   2 列每格 ~120px，刚好装下「头像 + 名字/状态 + 工具 + 想 + ↳ + 说」，
   且 4 行总高约 360px，八席一屏看全、不用滚。 */
.dsx-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px;align-content:start;}
/* gap 3→2 / padding 8,7→6,6：给 48px 舞台让出的竖向预算。
   算过最坏情况（八席全满、每席 5 行：工具 + 想2行 + ↳ + 说2行）：
   单卡 160 × 4 行 + 3×5 = 655，加表头 26 = 681，860 高视口下可用 704 —— 不滚动。 */
.dsx-card{position:relative;display:flex;flex-direction:column;align-items:stretch;gap:2px;
  padding:6px 6px;border-radius:12px;cursor:pointer;font:inherit;text-align:left;
  background:var(--dsw-alias-bg-layer-1,#FBFAF6);
  border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.12));
  color:var(--dsw-alias-label-primary,#26221C);
  transition:background .12s ease,border-color .12s ease,transform .12s ease;}
.dsx-card:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06));transform:translateY(-1px);}
.dsx-card:active{transform:translateY(0);}
.dsx-card.is-active{border-color:var(--dsx-accent);
  background:var(--dsw-specific-sidebar-nav-item-active,#E7E3D8);
  box-shadow:inset 0 0 0 1px var(--dsx-accent);}
.dsx-card.is-empty{opacity:.55;cursor:default;}
.dsx-card.is-empty:hover{transform:none;background:var(--dsw-alias-bg-layer-1,#FBFAF6);}
.dsx-card.is-empty .dsx-av{filter:grayscale(1);}

/* ── 小人舞台：56×24 逻辑画布 @2× 整数放大 = 112×48 ───────────────────────
   为什么非得上 2×：上一版渲染在 32px = 1.33×，每个像素落成 1px/2px 不均的宽度，
   像素一糊，八席之间好不容易拉开的剪影差别也跟着糊。2× 下每个像素恰好 2×2 设备像素。
   为什么是 56×24：横向加宽到 56 格（2× = 112px，把 116px 的卡片内宽基本吃满），
   纵向**不加高** —— 卡片高度是稀缺资源，起伏做成 1-2 格的小幅就够，
   不值得为「飘 3 格」把整块板垫高（用户：「不要加大高度，动作起伏高低一点」）。 */
.dsx-avslot{display:flex;justify-content:center;}
.dsx-av{position:relative;display:block;width:112px;height:48px;flex:none;overflow:visible;}
.dsx-av.is-chip{width:56px;height:24px;}

/* ── 动作 ────────────────────────────────────────────────────────────────
   三条纪律，每条都是被实测（和用户反馈）逼出来的：

   一、**静止就是静止**。休息/空闲的席位一个像素都不动：八席里常态有五六席闲着，
   每席都动等于整块板一直在抖，注意力被「没在干活的人」占掉，还白烧六份动画。
   闲着交给色点 + 压暗的法宝 + 「多久没动」那行字去说。

   二、**身体必须动，而且八席八套**。上一版只动了法宝 1 个精灵像素（= 2 CSS px），
   肉眼就是静止（用户原话：「工作中的怎么也不动了？」）；再上一版又共用一个踱步
   （「每个人都一样，只是衣服不一样」）。所以现在每个席位一条**完整编排**：
   基准站位 + 身体步态 + 法宝动作 + 出效 + 节奏，四个通道全按人不同。
   编排数据在 design/baxian.py 的 CHOREO 里（和 sprite 同源），构建期注入下面标记。

   三、位移一律**整数精灵像素**且 steps(1,end) 逐格停留，绝不插值 ——
   2× 下 1 单位 = 2 CSS px，一插值就出现半像素，整只小人就糊了。 */
.dsx-av.is-rest .dsx-pp{filter:saturate(.55) brightness(.9);}

/* 「等你」是唯一该打扰你的状态：身体不动（不跳），只举宝 + 朱砂旗摆。
   旗杆在 fx 层、旗面单独一层，所以「旗面摆、杆不摆」做得到。 */
.dsx-av.is-ask .dsx-pp{animation:dsx-m-ask 1.6s steps(1,end) infinite;}
.dsx-av.is-ask .dsx-fl{animation:dsx-m-flag .9s steps(1,end) infinite;}
@keyframes dsx-m-ask{0%,49%{transform:translateY(0)}50%,100%{transform:translateY(-1px)}}
@keyframes dsx-m-flag{0%,49%{transform:translateX(0)}50%,100%{transform:translateX(1px)}}

/* 「归位」同样不跳：只有法宝余晖在明暗上呼吸（纯 opacity，位置不动）。 */
.dsx-av.is-done .dsx-fx{animation:dsx-m-glow 2.4s steps(1,end) infinite;}
@keyframes dsx-m-glow{0%,49%{opacity:.3}50%,100%{opacity:1}}

/* 对话头那个小徽章只做静态展示，不参与编排（不然会被站位偏移推出画面）。 */
.dsx-av.is-chip .dsx-bd,.dsx-av.is-chip .dsx-grp{animation:none !important;transform:none !important;}

/* ── 八席编排（由 design/baxian.py 的 CHOREO 生成，勿手改）─────────────
   四条通道：基准站位 / 身体步态 / 法宝动作 / 出效漂移，全部按人不同。 */
/* 钟离 · 总控 · 规划 —— 踱方步（三步一跨回）：站位 -8 格，身体 3.6s，出效 1.8s */
.dsx-av.dsx-s-hanzhongli .dsx-bd,.dsx-av.dsx-s-hanzhongli .dsx-grp{transform:translate(-8px,0px);}
.dsx-av.dsx-s-hanzhongli.is-work .dsx-bd{animation:dsx-k-hanzhongli-bd 3600ms steps(1,end) infinite;}
.dsx-av.dsx-s-hanzhongli.is-work .dsx-grp{animation:dsx-k-hanzhongli-gp 3600ms steps(1,end) infinite;}
.dsx-av.dsx-s-hanzhongli.is-work .dsx-fx{animation:dsx-k-hanzhongli-fx 1800ms steps(1,end) infinite;}
@keyframes dsx-k-hanzhongli-bd{0%,24%{transform:translate(-8px,0px)}25%,49%{transform:translate(-12px,1px)}50%,74%{transform:translate(-16px,0px)}75%,99%{transform:translate(-11px,1px)}}
@keyframes dsx-k-hanzhongli-gp{0%,24%{transform:translate(-8px,0px)}25%,49%{transform:translate(-9px,-2px)}50%,74%{transform:translate(-8px,-1px)}75%,99%{transform:translate(-7px,0px)}}
@keyframes dsx-k-hanzhongli-fx{0%,32%{transform:translate(1px,0px);opacity:0.45}33%,66%{transform:translate(-3px,0px);opacity:1.0}67%,99%{transform:translate(2px,0px);opacity:0.6}}
/* 洞宾 · 执行 · 攻坚 —— 出剑前刺（突进两拍）：站位 +3 格，身体 1.5s，出效 1.5s */
.dsx-av.dsx-s-ludongbin .dsx-bd,.dsx-av.dsx-s-ludongbin .dsx-grp{transform:translate(3px,0px);}
.dsx-av.dsx-s-ludongbin.is-work .dsx-bd{animation:dsx-k-ludongbin-bd 1500ms steps(1,end) infinite;}
.dsx-av.dsx-s-ludongbin.is-work .dsx-grp{animation:dsx-k-ludongbin-gp 1500ms steps(1,end) infinite;}
.dsx-av.dsx-s-ludongbin.is-work .dsx-fx{animation:dsx-k-ludongbin-fx 1500ms steps(1,end) infinite;}
@keyframes dsx-k-ludongbin-bd{0%,24%{transform:translate(3px,0px)}25%,49%{transform:translate(7px,-1px)}50%,74%{transform:translate(9px,-1px)}75%,99%{transform:translate(4px,0px)}}
@keyframes dsx-k-ludongbin-gp{0%,24%{transform:translate(4px,0px)}25%,49%{transform:translate(7px,0px)}50%,74%{transform:translate(7px,-1px)}75%,99%{transform:translate(3px,0px)}}
@keyframes dsx-k-ludongbin-fx{0%,32%{transform:translate(0px,0px);opacity:0.35}33%,66%{transform:translate(0px,2px);opacity:1.0}67%,99%{transform:translate(0px,1px);opacity:0.7}}
/* 铁拐 · 修复 · 值守 —— 瘸步巡行（单向挪步）：站位 +7 格，身体 2.8s，出效 2.8s */
.dsx-av.dsx-s-tieguali .dsx-bd,.dsx-av.dsx-s-tieguali .dsx-grp{transform:translate(7px,0px);}
.dsx-av.dsx-s-tieguali.is-work .dsx-bd{animation:dsx-k-tieguali-bd 2800ms steps(1,end) infinite;}
.dsx-av.dsx-s-tieguali.is-work .dsx-grp{animation:dsx-k-tieguali-gp 2800ms steps(1,end) infinite;}
.dsx-av.dsx-s-tieguali.is-work .dsx-fx{animation:dsx-k-tieguali-fx 2800ms steps(1,end) infinite;}
@keyframes dsx-k-tieguali-bd{0%,24%{transform:translate(6px,0px)}25%,49%{transform:translate(1px,1px)}50%,74%{transform:translate(3px,0px)}75%,99%{transform:translate(-2px,0px)}}
@keyframes dsx-k-tieguali-gp{0%,24%{transform:translate(7px,0px)}25%,49%{transform:translate(6px,0px)}50%,74%{transform:translate(7px,-1px)}75%,99%{transform:translate(8px,0px)}}
@keyframes dsx-k-tieguali-fx{0%,24%{transform:translate(0px,0px);opacity:0.35}25%,49%{transform:translate(0px,-2px);opacity:0.8}50%,74%{transform:translate(0px,-4px);opacity:0.5}75%,99%{transform:translate(0px,-1px);opacity:0.9}}
/* 张果 · 审查 · 复盘 —— 倒骑慢摇（大摆一停）：站位 -4 格，身体 4.0s，出效 2.0s */
.dsx-av.dsx-s-zhangguolao .dsx-bd,.dsx-av.dsx-s-zhangguolao .dsx-grp{transform:translate(-4px,0px);}
.dsx-av.dsx-s-zhangguolao.is-work .dsx-bd{animation:dsx-k-zhangguolao-bd 4000ms steps(1,end) infinite;}
.dsx-av.dsx-s-zhangguolao.is-work .dsx-grp{animation:dsx-k-zhangguolao-gp 4000ms steps(1,end) infinite;}
.dsx-av.dsx-s-zhangguolao.is-work .dsx-fx{animation:dsx-k-zhangguolao-fx 2000ms steps(1,end) infinite;}
@keyframes dsx-k-zhangguolao-bd{0%,24%{transform:translate(-4px,0px)}25%,49%{transform:translate(3px,0px)}50%,74%{transform:translate(3px,1px)}75%,99%{transform:translate(-6px,0px)}}
@keyframes dsx-k-zhangguolao-gp{0%,24%{transform:translate(-4px,0px)}25%,49%{transform:translate(-3px,1px)}50%,74%{transform:translate(-4px,0px)}75%,99%{transform:translate(-5px,1px)}}
@keyframes dsx-k-zhangguolao-fx{0%,32%{transform:translate(0px,0px);opacity:1.0}33%,66%{transform:translate(3px,0px);opacity:0.7}67%,99%{transform:translate(6px,0px);opacity:0.35}}
/* 仙姑 · 文档 · 整理 —— 凌空飘浮（斜向飘）：站位 -2 格，身体 4.4s，出效 2.9s */
.dsx-av.dsx-s-hexiangu .dsx-bd,.dsx-av.dsx-s-hexiangu .dsx-grp{transform:translate(-2px,0px);}
.dsx-av.dsx-s-hexiangu.is-work .dsx-bd{animation:dsx-k-hexiangu-bd 4400ms steps(1,end) infinite;}
.dsx-av.dsx-s-hexiangu.is-work .dsx-grp{animation:dsx-k-hexiangu-gp 4400ms steps(1,end) infinite;}
.dsx-av.dsx-s-hexiangu.is-work .dsx-fx{animation:dsx-k-hexiangu-fx 2900ms steps(1,end) infinite;}
@keyframes dsx-k-hexiangu-bd{0%,24%{transform:translate(-2px,0px)}25%,49%{transform:translate(0px,-2px)}50%,74%{transform:translate(3px,-2px)}75%,99%{transform:translate(1px,-1px)}}
@keyframes dsx-k-hexiangu-gp{0%,24%{transform:translate(-2px,0px)}25%,49%{transform:translate(-3px,-1px)}50%,74%{transform:translate(-1px,-1px)}75%,99%{transform:translate(-2px,0px)}}
@keyframes dsx-k-hexiangu-fx{0%,32%{transform:translate(0px,0px);opacity:0.4}33%,66%{transform:translate(4px,-1px);opacity:0.9}67%,99%{transform:translate(7px,-1px);opacity:0.5}}
/* 采和 · 检索 · 收集 —— 蹦跳采花（逐跳向右）：站位 +5 格，身体 1.6s，出效 1.6s */
.dsx-av.dsx-s-lancaihe .dsx-bd,.dsx-av.dsx-s-lancaihe .dsx-grp{transform:translate(5px,0px);}
.dsx-av.dsx-s-lancaihe.is-work .dsx-bd{animation:dsx-k-lancaihe-bd 1600ms steps(1,end) infinite;}
.dsx-av.dsx-s-lancaihe.is-work .dsx-grp{animation:dsx-k-lancaihe-gp 1600ms steps(1,end) infinite;}
.dsx-av.dsx-s-lancaihe.is-work .dsx-fx{animation:dsx-k-lancaihe-fx 1600ms steps(1,end) infinite;}
@keyframes dsx-k-lancaihe-bd{0%,24%{transform:translate(5px,0px)}25%,49%{transform:translate(9px,-2px)}50%,74%{transform:translate(12px,0px)}75%,99%{transform:translate(8px,-1px)}}
@keyframes dsx-k-lancaihe-gp{0%,24%{transform:translate(5px,0px)}25%,49%{transform:translate(5px,-1px)}50%,74%{transform:translate(5px,0px)}75%,99%{transform:translate(4px,-1px)}}
@keyframes dsx-k-lancaihe-fx{0%,32%{transform:translate(0px,0px);opacity:0.4}33%,66%{transform:translate(-2px,-2px);opacity:1.0}67%,99%{transform:translate(-4px,-4px);opacity:0.5}}
/* 湘子 · 谋议 · 协调 —— 倚箫轻摇（倚住一停）：站位 -6 格，身体 2.4s，出效 2.7s */
.dsx-av.dsx-s-hanxiangzi .dsx-bd,.dsx-av.dsx-s-hanxiangzi .dsx-grp{transform:translate(-6px,0px);}
.dsx-av.dsx-s-hanxiangzi.is-work .dsx-bd{animation:dsx-k-hanxiangzi-bd 2400ms steps(1,end) infinite;}
.dsx-av.dsx-s-hanxiangzi.is-work .dsx-grp{animation:dsx-k-hanxiangzi-gp 2400ms steps(1,end) infinite;}
.dsx-av.dsx-s-hanxiangzi.is-work .dsx-fx{animation:dsx-k-hanxiangzi-fx 2700ms steps(1,end) infinite;}
@keyframes dsx-k-hanxiangzi-bd{0%,24%{transform:translate(-9px,0px)}25%,49%{transform:translate(-9px,0px)}50%,74%{transform:translate(-4px,0px)}75%,99%{transform:translate(-7px,0px)}}
@keyframes dsx-k-hanxiangzi-gp{0%,24%{transform:translate(-6px,0px)}25%,49%{transform:translate(-6px,-2px)}50%,74%{transform:translate(-6px,-2px)}75%,99%{transform:translate(-6px,0px)}}
@keyframes dsx-k-hanxiangzi-fx{0%,32%{transform:translate(0px,0px);opacity:0.3}33%,66%{transform:translate(2px,-3px);opacity:0.9}67%,99%{transform:translate(4px,-5px);opacity:0.4}}
/* 国舅 · 决断 · 验证 —— 端立击板（一拍跺地）：站位 +2 格，身体 0.9s，出效 0.9s */
.dsx-av.dsx-s-caoguoju .dsx-bd,.dsx-av.dsx-s-caoguoju .dsx-grp{transform:translate(2px,0px);}
.dsx-av.dsx-s-caoguoju.is-work .dsx-bd{animation:dsx-k-caoguoju-bd 900ms steps(1,end) infinite;}
.dsx-av.dsx-s-caoguoju.is-work .dsx-grp{animation:dsx-k-caoguoju-gp 900ms steps(1,end) infinite;}
.dsx-av.dsx-s-caoguoju.is-work .dsx-fx{animation:dsx-k-caoguoju-fx 900ms steps(1,end) infinite;}
@keyframes dsx-k-caoguoju-bd{0%,24%{transform:translate(2px,0px)}25%,49%{transform:translate(7px,1px)}50%,74%{transform:translate(7px,0px)}75%,99%{transform:translate(2px,0px)}}
@keyframes dsx-k-caoguoju-gp{0%,24%{transform:translate(-1px,0px)}25%,49%{transform:translate(5px,0px)}50%,74%{transform:translate(-1px,0px)}75%,99%{transform:translate(5px,0px)}}
@keyframes dsx-k-caoguoju-fx{0%,49%{transform:translate(0px,0px);opacity:0.3}50%,99%{transform:translate(0px,0px);opacity:1.0}}
@media (prefers-reduced-motion: reduce){
  .dsx-av,.dsx-av *{animation:none !important}
}

/* 第 1 行：姓名 + 状态（状态靠右，扫视好找） */
.dsx-row1{display:flex;align-items:baseline;justify-content:space-between;gap:5px;min-width:0;}
.dsx-name{font-size:11px;font-weight:650;line-height:1.25;min-width:0;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.dsx-state{display:inline-flex;align-items:center;gap:3px;flex:none;font-size:9px;letter-spacing:.02em;
  line-height:1.25;color:var(--dsw-alias-label-tertiary,#8B8478);}
.dsx-state::before{content:"";width:4px;height:4px;border-radius:50%;flex:none;
  background:var(--dsw-alias-border-l4,rgba(0,0,0,.24));}
.dsx-state.working{color:var(--dsw-alias-state-success-primary,#4E7A5A);}
.dsx-state.working::before{background:var(--dsw-alias-state-success-primary,#4E7A5A);
  box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-state-success-primary,#4E7A5A) 22%,transparent);}
/* 「待过目」用**金**，不用绿：绿点已经是「运功」的意思，同一个绿不能既表示
   「正在干活」又表示「跑完了、待你过目」。金色与小人法宝上那点金光同源（#C9A227）。 */
.dsx-state.done{color:var(--dsx-gold,#C9A227);}
.dsx-state.done::before{background:var(--dsx-gold,#C9A227);
  box-shadow:0 0 0 2px color-mix(in srgb,var(--dsx-gold,#C9A227) 24%,transparent);}
.dsx-state.blocked{color:var(--dsw-alias-state-error-primary,#B5453C);}
.dsx-state.blocked::before{background:var(--dsw-alias-state-error-primary,#B5453C);}

/* 第 2-5 行：工具+时长 / 想 / ↳ / 说 —— 每行单行省略，绝不换行（换行会把格子高度撑乱） */
.dsx-tool,.dsx-think,.dsx-result,.dsx-text{display:flex;align-items:baseline;gap:4px;min-width:0;
  font-size:9px;line-height:1.35;overflow:hidden;white-space:nowrap;}
.dsx-toolname{flex:none;font-weight:600;color:var(--dsx-accent);
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace;}
.dsx-toolarg{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  color:var(--dsw-alias-label-secondary,#5C554A);
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace;}
.dsx-elapsed{flex:none;margin-left:auto;color:var(--dsw-alias-label-tertiary,#8B8478);
  font-variant-numeric:tabular-nums;}
.dsx-tool.is-quiet{color:var(--dsw-alias-label-tertiary,#8B8478);font-family:inherit;}
.dsx-think{color:var(--dsw-alias-label-secondary,#5C554A);font-style:italic;}
.dsx-result{color:var(--dsw-alias-label-tertiary,#8B8478);}
.dsx-text{color:var(--dsw-alias-label-tertiary,#8B8478);}
.dsx-tag{flex:none;font-size:8px;font-weight:600;letter-spacing:.04em;opacity:.8;
  border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.12));border-radius:4px;padding:0 3px;
  font-style:normal;}
.dsx-thinktext{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.dsx-restext{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace;}

/* 工作目录行 —— 点它换工作目录（这一席在新目录重开会话）。
   只给**当前这一席**显示：高度预算上面算过（八席全满 697 / 可用 750），
   八张卡各加一行会溢出把「不滚动」毁掉；只显示一张最多 +14px，仍在预算内。
   对齐刻意与上面几行（工具/想/↳/说）共用同一套：baseline + 4px gap、零左右内边距、
   9px/1.35 同一字号行高，标签也复用 .dsx-tag —— 换字号或加 padding 都会整体错开，一眼看得出歪。 */
.dsx-cwd{display:none;align-items:baseline;gap:4px;min-width:0;
  color:var(--dsw-alias-label-tertiary,#8B8478);font-size:9px;line-height:1.35;
  cursor:pointer;}
.dsx-card.is-active .dsx-cwd{display:flex;}
.dsx-cwd:hover{color:var(--dsw-alias-label-secondary,#5C554A);}
.dsx-cwd:hover .dsx-cwdtext{text-decoration:underline;}
.dsx-cwd:focus-visible{outline:1px solid var(--dsx-accent);outline-offset:1px;}
.dsx-cwdtext{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}

/* 竖向三档 —— 判据不是「窗口多高」，而是「八席全满时放不放得下」。
   八席全满 = 每格都有 工具 + 想 + ↳ + 说 四行（实测单卡 164px）：
     4 行卡 + 3 个 5px 间隙 = 671，加表头 26 = 697。
   侧栏可用高 ≈ 窗口高 - 130，所以：
     >=880 → 697 < 750 ✓ 可以放开「想/说」各 2 行（信息最多）
     >=740 → 单行 + 保留 ↳（569 < 610 ✓）
     < 740 → 单行且收起 ↳（495 < 570 ✓）—— 小窗口优先保证八席一屏
   这条线是拿实测数字定的，不是拍的：宁可小窗口少显示一行，也不要出现滚动条。 */
@media (min-height: 740px){
  .dsx-result{display:flex;}
}
.dsx-result{display:none;}
@media (min-height: 880px){
  .dsx-think,.dsx-text{align-items:flex-start;white-space:normal;overflow:visible;}
  .dsx-think .dsx-thinktext,.dsx-text .dsx-thinktext{white-space:normal;font-size:10px;line-height:1.3;
    display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;word-break:break-word;overflow:hidden;}
  .dsx-result{display:flex;}
}

/* ── 「需要你接手」：整张卡描边 + 呼吸，扫一眼就能找到 ───────────────── */
.dsx-card.is-needs-you{border-color:var(--dsw-alias-state-error-primary,#B5453C);
  box-shadow:inset 0 0 0 1px var(--dsw-alias-state-error-primary,#B5453C);
  animation:dsx-needs-you 1.6s ease-in-out infinite;}
.dsx-card.is-needs-you.is-active{animation:none;}
@keyframes dsx-needs-you{
  0%,100%{box-shadow:inset 0 0 0 1px var(--dsw-alias-state-error-primary,#B5453C);}
  50%{box-shadow:inset 0 0 0 1px var(--dsw-alias-state-error-primary,#B5453C),
    0 0 0 3px color-mix(in srgb,var(--dsw-alias-state-error-primary,#B5453C) 26%,transparent);}
}
@media (prefers-reduced-motion: reduce){.dsx-card.is-needs-you{animation:none}}
/* 顶部计数：有席在等时换成「N 席等你」 */
.dsx-attn{font-size:10px;font-weight:600;font-variant-numeric:tabular-nums;
  color:var(--dsw-alias-state-error-primary,#B5453C);
  border:1px solid var(--dsw-alias-state-error-primary,#B5453C);border-radius:999px;padding:1px 7px;
  background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#B5453C) 10%,transparent);}
/* 窄轨模式：头像上角一个红点 */
.dsx-railbtn.is-needs-you{position:relative;}
.dsx-railbtn.is-needs-you::after{content:"";position:absolute;right:2px;top:2px;width:7px;height:7px;
  border-radius:50%;background:var(--dsw-alias-state-error-primary,#B5453C);
  box-shadow:0 0 0 2px var(--dsw-alias-bg-layer-1,#FBFAF6);}

/* 「设置 → 通用」里的侧边栏模式行。owner 不传 props、不投影 label，所以整行自绘 */
.dsx-setrow{display:flex;align-items:center;justify-content:space-between;gap:16px;
  padding:12px 2px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.06));}
.dsx-settext{min-width:0;}
.dsx-settitle{font-size:13.5px;font-weight:600;color:var(--dsw-alias-label-primary,#26221C);}
.dsx-setdesc{font-size:11.5px;line-height:1.5;margin-top:2px;
  color:var(--dsw-alias-label-tertiary,#8B8478);}
.dsx-seg{display:inline-flex;flex:none;border-radius:9px;padding:2px;gap:2px;
  background:var(--dsw-alias-bg-layer-2,#F0EDE4);
  border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.12));}
.dsx-segbtn{padding:4px 14px;border:0;border-radius:7px;cursor:pointer;font:inherit;font-size:12px;
  background:transparent;color:var(--dsw-alias-label-secondary,#5C554A);}
.dsx-segbtn:hover{color:var(--dsw-alias-label-primary,#26221C);}
.dsx-segbtn.is-on{background:var(--dsw-alias-bg-layer-1,#FBFAF6);
  color:var(--dsw-alias-label-primary,#26221C);font-weight:600;
  box-shadow:0 1px 3px rgba(0,0,0,.10);}


.dsx-hint{margin-top:2px;font-size:10px;line-height:1.5;color:var(--dsw-alias-label-tertiary,#8B8478);
  border-top:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.06));padding-top:7px;}

/* 原装对话头里的席位徽章 —— 不改原装布局，只加一个内联块 */
.dsx-badge{display:inline-flex;align-items:center;gap:6px;padding:2px 8px 2px 3px;border-radius:999px;
  background:color-mix(in srgb,var(--dsx-accent) 12%,transparent);
  border:1px solid color-mix(in srgb,var(--dsx-accent) 34%,transparent);}
.dsx-badge .dsx-av{width:24px;height:24px;}
.dsx-badge-t{display:flex;flex-direction:column;line-height:1.1;}
.dsx-badge-n{font-size:11px;font-weight:650;color:var(--dsx-accent);}
.dsx-badge-r{font-size:9px;color:var(--dsw-alias-label-tertiary,#8B8478);}

.dsx-rail{display:flex;flex-direction:column;align-items:center;gap:5px;padding:4px 0;}
.dsx-railbtn{width:32px;height:32px;padding:0;border-radius:7px;cursor:pointer;display:grid;place-items:center;
  background:var(--dsw-alias-bg-layer-2,#F0EDE4);border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.06));}
.dsx-railbtn:hover{border-color:var(--dsw-alias-border-l3,rgba(0,0,0,.18));}
.dsx-railbtn.is-active{border-color:var(--dsx-accent);background:var(--dsw-specific-sidebar-nav-item-active,#E7E3D8);}
.dsx-railbtn .dsx-av{width:24px;height:24px;}
/* 空槽在轨道里也要灰度化 —— 否则和「休息」看不出区别 */
.dsx-railbtn.is-empty .dsx-av{filter:grayscale(1);opacity:.5;}

/* ── 左上角只留 logo：拿掉原生「新建会话」按钮 ──────────────────────────
   平台把这两件事拆成了**两个**元素（实测线上 DOM）：
     button.hHd-Xa_brand      左上角「DeepSeek Harness」logo —— 但它的 aria-label 也叫 "New session"
     button.hHd-Xa_newSession 它下面那行独立的新建按钮          <- 要干掉的是这个
   类名是构建期 hash（hHd-Xa_ 前缀会变），所以用 _newSession / _brand 子串匹配。
   logo 保留外观（左上角不能空一块），只去掉按钮手感；点击行为另由
   registerNewSessionGuard() 兜底拦截。切回「默认」模式自动全部还原。 */
html.dsx-grid-mode [class*="_newSession"]{display:none !important;}
html.dsx-grid-mode button[class*="_brand"],
html.dsx-grid-mode button[aria-label="新建会话"],
html.dsx-grid-mode button[aria-label="New session"]{
  cursor:default !important;background:transparent !important;box-shadow:none !important;
}
html.dsx-grid-mode button[class*="_brand"]:hover,
html.dsx-grid-mode button[aria-label="新建会话"]:hover,
html.dsx-grid-mode button[aria-label="New session"]:hover{background:transparent !important;}
/* 连「可点」都谈不上：鼠标事件直接穿透（键盘 Enter/Space 由 guard 拦，两层保险）。
   logo 的 aria-label 仍是平台写的 "New session"，那是 DSH 自身的 DOM 属性，不改它 —— 改了就只剩
   我们自己的语义，而 guard 依赖它做兜底匹配；对外行为已经确定不是按钮。 */
html.dsx-grid-mode button[class*="_brand"]{pointer-events:none !important;}
`;

		function injectStyles(css, tagId) {
			if (typeof document === "undefined") return;
			if (document.querySelector('style[data-plugin-css="' + tagId + '"]')) return;
			const tag = document.createElement("style");
			tag.dataset.plugin = "@local/dsh-agent-grid";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}

		function injectSprites(markup) {
			if (typeof document === "undefined") return;
			if (document.getElementById("dsx-sprite-sheet")) return;
			const holder = document.createElement("div");
			holder.id = "dsx-sprite-sheet";
			holder.setAttribute("aria-hidden", "true");
			holder.style.cssText = "position:absolute;width:0;height:0;overflow:hidden";
			holder.innerHTML = markup;
			document.body.appendChild(holder);
		}

		// ---- 客户端插件体 -------------------------------------------------------
		/** cordis fiber 服务名（非包名）：slots 注册 slot、layout 切面板、sessions 切会话、
		 *  settingsScope 读设置命名空间（侧边栏模式开关）。 */
		const inject = ["slots", "layout", "sessions", "settingsScope"];

		function apply(ctx) {
			injectStyles(CSS, "@local/dsh-agent-grid/grid.css");
			injectSprites(SPRITES);

			// 席位切换 = 打开该席会话。主栏随后显示的是**原装 Conversation**，
			// 所以这里不需要（也不应该）注册自己的 main 面板。
			// 用 ctx.inject 回调取服务（apply 顶层 ctx.get 可能拿到 undefined）。
			ctx.inject(["sessions"], (c) => {
				// 这个回调是一个子 fiber：热重载/卸载会 dispose 掉旧 fiber，但订阅和
				// 定时器不会跟着自动收摊。不显式取消的话，旧回调仍会在 store 变更时被
				// 调用，而那时 c 已经是不活跃的 context —— 读 c.sessions 直接抛
				// 「cannot get required service "sessions" in inactive context」。
				let disposed = false;
				const timers = new Set();
				/** 受本 fiber 生命周期管理的 setTimeout：dispose 后不触发，并被清掉。 */
				const later = (fn, ms) => {
					const timer = setTimeout(() => {
						timers.delete(timer);
						if (!disposed) fn();
					}, ms);
					timers.add(timer);
				};

				openSeatSession = (sessionId) => {
					if (disposed) return;
					// 「上次所在的席」跟着**用户真正点开的那一席**走。它是下面第 3 条
					// 兜底认领的依据 —— 认错就会把新空白会话塞给别的席（焦点跳格子）。
					const seat = SEATS.find((s) => readStore().bind[s.id] === sessionId);
					if (seat !== undefined) lastSeatId = seat.id;
					c.sessions.open(sessionId);
					ctx.layout.selectPanel(null); // 若之前在某个 main 面板里，回到原装对话
				};

				/**
				 * 这一席该在哪个工作区干活。
				 *
				 * 优先它自己会话所属的工作区 —— `/clear` 的语义是「在**同一席**新开一个
				 * 对话」，工作目录必须不变；空席则跟随当前会话所在的工作区（用户此刻的语境）。
				 * 返回 undefined 表示列表还没就绪、真的判断不出来。
				 */
				const seatWorkspace = (seatId) => {
					const items = workspaceListOf() || [];
					const ownerOfSession = (sid) => items.find((item) => item.sessionIds.includes(sid));
					const bound = readStore().bind[seatId];
					const owned = bound === undefined ? undefined : ownerOfSession(bound);
					if (owned !== undefined) return owned;
					const cur = c.sessions.list.getSnapshot().current;
					return cur === undefined ? undefined : ownerOfSession(cur);
				};

				// 空席新建：宿主侧建完立刻绑到这一席，再切过去。
				// 这是八席模式下的**唯一**新建入口（原生「新建会话」按钮已隐藏）。
				// 空席点击 = 认领**平台自己的**新会话槽，而不是另造一个空白会话。
				// 平台模型：一个工作区只有一个「空白会话」作为新会话位，
				// connectWorkspace() 会复用它的第一个 blank（见上文 reconcile 的注释）。
				// 所以这里只记「哪一席在等」+「等哪个工作目录」，具体会话交给
				// uiWorkspace.startSession(workspaceId) 去挑。
				/**
				 * 造一份「这一席在等哪个工作区的空白会话」的 claim。
				 *
				 * **两个字段都记，判定只信 `workspaceId`。** 原因是实测踩过的一条：
				 *
				 * host 的会话归属是按 **canonical** cwd 相等算的（`WorkspaceView.path` 的
				 * 契约写明是 "Canonical host directory path"，且 workspace 路径经
				 * `fs.realpath` 规范化；`SessionSummary.cwd` 同源）。而
				 * `uiWorkspace.pickDirectory()` 只承诺 "the selected directory" ——
				 * **没有任何 canonical 保证**。拿用户选的原始路径去比 canonical cwd，
				 * 路径含符号链接（macOS 上 `/tmp`、`/var`、`/Volumes/...`、或任何 symlink）
				 * 时**恒不匹配** → 换目录后的新会话永远认领不上 → 八席里"这条对话不见了"
				 * （看板只渲染 bindings，无主会话没有任何呈现），只能切回默认侧栏才看得到。
				 *
				 * 所以 `workspaceId` 是权威判据（host 的 membership），`cwd` 只留给
				 * workspaceId 缺失时的兜底与日志 —— 它也自然修掉了另一个边界：
				 * `SessionSummary.cwd` 是**可选**字段，新会话刚建好那一刻可能还没投影，
				 * 那时比字符串同样会把认领卡死。
				 *
				 * 传 WorkspaceView（两条调用路径都能拿到）优先；为稳妥也接受裸 cwd 字符串。
				 */
				const claimTarget = (seatId, workspace) => {
					const isView = !!workspace && typeof workspace === "object";
					const cwd = isView
						? (typeof workspace.path === "string" ? workspace.path : null)
						: (typeof workspace === "string" ? workspace : null);
					const workspaceId = isView && workspace.workspaceId !== undefined ? workspace.workspaceId : null;
					return { seatId, workspaceId, cwd, at: Date.now() };
				};

				/**
				 * 目标空白会话是不是真的落在**这一席要的那个工作区**里。
				 *
				 * 优先用 host 的工作区归属（`WorkspaceView.sessionIds`）—— 权威、canonical、
				 * 且不依赖 `SessionSummary.cwd` 是否已投影。只有在拿不到 workspaceId 时
				 * 才退回比路径，且**未投影的 cwd 不判为不匹配**（无法证伪就放行，
				 * 比永久卡死、把用户的对话弄丢要好）。
				 *
				 * 返回 false 只表示"还不能确认"，调用方一律继续等下一拍，不做丢弃。
				 */
				const inClaimWorkspace = (claim, sessionId, summary) => {
					if (claim.workspaceId !== null) {
						const items = workspaceListOf() || [];
						const ws = items.find((item) => item.workspaceId === claim.workspaceId);
						if (ws === undefined) return false; // 工作区列表还没就绪
						return ws.sessionIds.includes(sessionId);
					}
					if (claim.cwd === null) return true;
					if (!summary || typeof summary.cwd !== "string") return true; // 未投影：不视为不匹配
					return summary.cwd === claim.cwd;
				};

				// 「这一席在等一个新空白会话」：记事实 + 安排主动复查 + 兜底解锁。
				// 抽出来是因为两条路都要它 —— 空席新建，以及换工作目录后在新工作区开会话。
				const beginClaim = (seatId, workspace) => {
					if (disposed || creatingSeats.has(seatId)) return false;
					creatingSeats.add(seatId);
					pendingSeat = claimTarget(seatId, workspace);
					// 平台可能「当前会话本来就是那个空白槽」→ open() 不产生变更事件，
					// 那就不会触发下面的订阅回调，所以主动再查一次。
					later(() => {
						if (pendingSeat !== null && pendingSeat.seatId === seatId) claimPendingSeat();
					}, 300);
					// 兜底：万一平台一直没给出空白会话，也别把这一席永久锁死
					later(() => creatingSeats.delete(seatId), 8000);
					return true;
				};
				beginSeatClaim = beginClaim;

				/**
				 * 同席接力：这一席还在 8s 防连点窗口里（例如刚 `/clear` 过），但用户又选了
				 * 一次工作目录 —— 不能因为防连点就把这次选择静默丢掉。把 claim 的目标改到
				 * 刚选的工作区，并让它立刻生效。
				 */
				const claimSeatNowImpl = (seatId, workspace) => {
					if (disposed) return false;
					pendingSeat = claimTarget(seatId, workspace);
					creatingSeats.add(seatId);
					later(() => creatingSeats.delete(seatId), 8000);
					return true;
				};
				claimSeatNow = claimSeatNowImpl;

				/** 真正发起「这一席新开一个会话」：工作区已定，只差认领 + 交给平台。 */
				const startSeatSessionAt = (seatId, workspace) => {
					if (!beginClaim(seatId, workspace)) return;
					startNewSessionFlow(workspace.workspaceId);
				};

				createSeatSession = (seatId) => {
					// 先定工作区、再认领：`/clear` 之后必须在**同一个**工作目录里开新会话。
					// 以前这里是 `startNewSessionFlow()`（不带参数），平台会退到「当前/最近
					// 工作区」；一旦解析不出来就 `sessions.clear()` —— 用户看到的是
					// 「选择工作目录」空态，正是 bug 报告里的第一步。宁可不新建，也不把
					// 用户扔进那个空态。
					const workspace = seatWorkspace(seatId);
					if (workspace !== undefined) {
						startSeatSessionAt(seatId, workspace);
						return;
					}
					// 列表可能还没就绪（首次渲染 / 刚重连）。等一拍再试一次 ——
					// 用户点了一下空席却什么都没发生，比慢半秒更糟。
					later(() => {
						if (disposed || creatingSeats.has(seatId)) return;
						const retry = seatWorkspace(seatId);
						if (retry === undefined) {
							console.warn("[agent-grid] 这一席没有可用的工作区，暂不新建会话（避免把用户扔进「选择工作目录」）");
							return;
						}
						startSeatSessionAt(seatId, retry);
					}, 400);
				};

				// 会话列表一变就检查「当前会话的席位归属」，两件事：
				//   1) 记住当前会话属于哪一席（lastSeatId）；
				//   2) 出现**无主的空白会话**时把它归给「等待中的席」或「上次所在的席」。
				// 第 2 条覆盖用户在空白会话里换工作区文件夹的场景：平台会在新工作区
				// 另开一个空白会话（connectWorkspace），那个新槽必须回到同一席，
				// 否则用户会莫名其妙站在一个不属于任何席位的会话里。
				const claimPendingSeat = () => {
					if (disposed) return;
					const snapshot = c.sessions.list.getSnapshot();
					if (snapshot.phase !== "ready" || snapshot.current === undefined) return;
					const summary = snapshot.byId[snapshot.current];
					if (!summary) return;
					const ownerOf = () => SEATS.find((seat) => readStore().bind[seat.id] === snapshot.current);

					// 1) 有席在等（用户刚点了空席 / 刚 clear / 刚换目录）→ 把当前空白槽交给它，
					//    优先级最高。平台可能复用了别席已有的空白槽（一个工作区只有一个），
					//    那就把它移过来。
					if (pendingSeat !== null) {
						// 过期的 claim 直接丢弃。`/clear` 信号会在 20s 窗口里被重放，一个永不
						// 失效的 claim 会在几十秒后劫持一个毫不相干的空白会话。
						if (Date.now() - pendingSeat.at > CLAIM_TTL_MS) {
							creatingSeats.delete(pendingSeat.seatId);
							pendingSeat = null;
						} else {
							if (summary.blank !== true) return; // 还没切到空白会话，继续等
							// 而且这个空白槽必须落在**目标工作区**里。平台的
							// connectWorkspace() 只认「该工作区第一个 blank」，别的席可能把
							// 空白槽留在别的工作区 —— 少了这道校验，clear 国舅就会认领到
							// 钟离那个工作区的空席，人也就跟着跳过去了。
							//
							// 判据走 host 的 membership（`sessionIds`），不比路径字符串：
							// 见 claimTarget 那段注释 —— 比字符串会在路径非 canonical、
							// 或 `summary.cwd` 尚未投影时**恒不匹配**，把用户的对话弄丢。
							if (!inClaimWorkspace(pendingSeat, snapshot.current, summary)) return;
							const seatId = pendingSeat.seatId;
							pendingSeat = null;
							creatingSeats.delete(seatId);
							SEATS.forEach((seat) => {
								if (seat.id !== seatId && readStore().bind[seat.id] === snapshot.current) clearSeatBinding(seat.id);
							});
							setSeatBinding(seatId, snapshot.current);
							lastSeatId = seatId;
							return;
						}
					}

					// 2) 没有等待者：记住当前会话属于哪一席
					const owner = ownerOf();
					if (owner !== undefined) {
						lastSeatId = owner.id;
						return;
					}

					// 3) 无主的空白会话（例如在空白席里换了工作区文件夹，平台又开了一个）
					//    → 归给上次所在的席，别让用户站在一个不属于任何席位的会话里。
					//    但只在这一席**真的空着**时才认领：否则用户从平台侧选一次工作目录，
					//    就会顶掉某个无关席位（实测：钟离）已有的绑定 = 焦点莫名跳过去。
					if (summary.blank !== true || lastSeatId === null) return;
					if (readStore().bind[lastSeatId] !== undefined) return;
					setSeatBinding(lastSeatId, snapshot.current);
				};
				const unsubscribeClaim = c.sessions.list.subscribe(claimPendingSeat);
				claimPendingSeat();

				// fiber dispose（含 HMR 重载）时收摊：取消订阅、清定时器、断开闭包引用。
				// 下面几行就是「控制台不再刷 inactive context」的保证。
				return () => {
					disposed = true;
					unsubscribeClaim();
					for (const timer of timers) clearTimeout(timer);
					timers.clear();
					creatingSeats.clear();
					pendingSeat = null;
					openSeatSession = () => {};
					createSeatSession = null;
					if (beginSeatClaim === beginClaim) beginSeatClaim = null;
					if (claimSeatNow === claimSeatNowImpl) claimSeatNow = null;
				};
			});

			// 保留 logo、拦掉它的新建行为（八席模式下新建只能点空席）
			ctx.effect(registerNewSessionGuard, "agent-grid: 原生新建会话拦截");

			// 新建走平台自己的流程（等价于点原生「新建会话」）：
			// 它挑当前/最近工作区，并复用该工作区里已有的空白会话，不会造出第二个。
			// workspaces 服务：把宿主目录登记成真实工作区（已登记则幂等返回）。
			ctx.inject(["uiWorkspace", "workspaces"], (w) => {
				// 工作区列表读取器：sessions fiber 判断「这一席该在哪个工作区」要用它，
				// 但那个 fiber 里拿不到 workspaces 服务 —— 用这个模块级钩子单向注入，
				// 免得两个 fiber 互相依赖（谁先就绪都不确定）。
				workspaceListOf = () => {
					const snap = w.workspaces.list.getSnapshot();
					return snap && Array.isArray(snap.items) ? snap.items : [];
				};

				startNewSessionFlow = (workspaceId) => {
					try {
						w.uiWorkspace.startSession(workspaceId);
					} catch (error) {
						console.warn("[agent-grid] 新建会话失败：", error);
						pendingSeat = null;
						creatingSeats.clear();
					}
				};

				// 换工作目录：这一席改到另一个目录干活。
				// 语义跟平台一致 —— 目录登记成工作区 → 在该工作区开/复用空白会话 →
				// claimPendingSeat 把这个新空白槽绑回同一席。旧会话留在原工作区，不动。
				// 不依赖被遮蔽的 sidebar.workspaces.directoryFlow 子槽：选择器直接用
				// uiWorkspace.pickDirectory()（宿主原生对话框）。
				switchSeatDirectory = async (seatId) => {
					try {
						const path = await w.uiWorkspace.pickDirectory();
						if (typeof path !== "string" || path.length === 0) return; // 用户取消
						const workspace = await w.workspaces.create({ path });
						// 字段名是 WorkspaceView.workspaceId —— 不是 id（写错的话这里必然抛错）
						const workspaceId = workspace ? workspace.workspaceId : undefined;
						if (workspaceId === undefined) throw new Error("工作区登记未返回 workspaceId");
						// 这一席可能还在 8s 防连点窗口里（典型：刚 `/clear` 完就想换目录）——
						// 不能因此把用户这次选择静默丢掉。同席接力，让这次选择立刻生效。
						//
						// **claim 传 `workspace`（canonical 的 WorkspaceView），不传 `path`。**
						// `path` 是 `pickDirectory()` 的原始返回值，只有"用户选中了它"这层
						// 含义；host 认会话归属用的是 canonical cwd（见 claimTarget 注释）。
						// 传原始 path 曾在 symlink 目录上让认领恒失败 —— 新会话无主，
						// 八席里那条对话直接"不见了"。
						if (beginSeatClaim === null) return;
						if (!beginSeatClaim(seatId, workspace)) {
							if (claimSeatNow === null || !claimSeatNow(seatId, workspace)) return;
						}
						w.uiWorkspace.startSession(workspaceId);
					} catch (error) {
						// 目录被拒（无权限/已删除）、登记失败等：别把这一席卡在「等待认领」
						console.warn("[agent-grid] 换工作目录失败：", error);
						if (pendingSeat !== null && pendingSeat.seatId === seatId) pendingSeat = null;
						creatingSeats.delete(seatId);
					}
				};

				return () => {
					startNewSessionFlow = () => {};
					workspaceListOf = () => [];
					switchSeatDirectory = null;
				};
			});

			// 设置命名空间：读「侧边栏模式」，并在变化时重新应用。
			// 同一份值在 host 侧有 schema + 持久化，这里只读/写。
			ctx.inject(["settingsScope"], (scoped) => {
				const scope = scoped.settingsScope.bind({ namespace: SETTINGS_NS });
				sidebarScope = scope;
				const sync = () => {
					// 用户在本次会话里已经显式选过 -> 以他的选择为准，
					// 免得 host 的旧值/默认值把刚才的切换盖回去
					if (localChoice !== null) return;
					const snap = scope.getSnapshot();
					if (snap.status !== "ready") return;
					const value = snap.value ? snap.value[SIDEBAR_FIELD] : undefined;
					if (typeof value === "string") applySidebarMode(value);
				};
				// 同样属于本 fiber 的订阅，同样要收摊：否则重载后旧回调会在设置
				// 变更时用已失效的 scope 继续同步侧边栏模式。
				const unsubscribeSync = scope.subscribe(sync);
				sync();
				emitMode(); // 让设置行从「无法持久化」切到正常提示
				return () => {
					unsubscribeSync();
					if (sidebarScope === scope) sidebarScope = null;
				};
			});

			// 侧栏：会话浏览区换成八席网格（可在设置里随时切回默认）。
			// priority: -1 是必需的 —— 内置 WorkspaceBrowser 占 priority 0，渲染取升序 index 0。
			// 这里只准备好「怎么注册」，是否挂上由 applySidebarMode 决定。
			ctx.slots.inject("sidebar.workspaces", () => {
				slotReady = true;
				registerGrid = () =>
					ctx.slots.register({ name: "sidebar.workspaces", priority: -1 }, SeatGrid);
				applySidebarMode(sidebarMode);
				return () => {
					if (gridDisposer !== null) {
						const dispose = gridDisposer;
						gridDisposer = null;
						dispose();
					}
					slotReady = false;
					registerGrid = null;
					if (typeof document !== "undefined") document.documentElement.classList.remove("dsx-grid-mode");
				};
			});

			// 「设置 → 通用」里的侧边栏模式开关。
			ctx.slots.inject("settings.general.item", () =>
				ctx.slots.register(
					{ name: "settings.general.item", id: "agent-grid-sidebar", order: 12 },
					SidebarModeRow));


			// 原装对话头：标题旁的席位徽章。不属于任何席位的会话不渲染（保持原样）。
			ctx.slots.inject("conversation.session.header.actions", () =>
				ctx.slots.register(
					{ name: "conversation.session.header.actions", id: "seat-badge", order: 1 },
					SeatBadge));
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
