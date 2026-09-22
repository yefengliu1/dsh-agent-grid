#!/usr/bin/env python3
"""八仙 sprite 验收页（4 状态版）。

看三件事：
  一、四态各自的姿势读得出来吗（静止对照，2× 整数放大）
  二、动起来像不像在干活（真 CSS 动画，和线上同一套 keyframes）
  三、264px 侧栏里 2×4 的实况（贴到真实卡片尺寸看会不会糊）
"""
from pathlib import Path
import baxian as g

OUT = Path(__file__).parent

# 与 lib/client.js 里同一套 keyframes —— 这里验的就是线上那套，不是另写一份
STATES = [("rest", "休息 · 法宝收起"), ("work", "干活 · 法宝出效"), ("ask", "等你 · 举旗召你"), ("done", "归位 · 收束金光")]

ANIM_CSS = """
 .av { position:relative; display:block; width:96px; height:48px; }
 .av .dsx-fx { animation:none; }
 .av.is-rest .dsx-bd { animation:dsx-breathe 4.2s steps(2,end) infinite; }
 .av.is-rest .dsx-pp { filter:saturate(.5) brightness(.88); animation:dsx-breathe 4.2s steps(2,end) infinite; }
 .av.is-work { animation:dsx-pace 4.4s steps(4,end) infinite; }
 .av.is-work .dsx-pp { animation:dsx-sway 1s steps(2,end) infinite; }
 .av.is-work .dsx-fx { animation:dsx-blow 1.1s steps(3,end) infinite; }
 .av.is-ask .dsx-bd { animation:dsx-perk 1.2s steps(2,end) infinite; }
 .av.is-ask .dsx-pp { animation:dsx-lift 1.2s steps(2,end) infinite; }
 .av.is-ask .dsx-fl { animation:dsx-wave .9s steps(2,end) infinite; }
 .av.is-done .dsx-pp { animation:dsx-breathe 4.2s steps(2,end) infinite; }
 .av.is-done .dsx-fx { animation:dsx-bloom 2.4s steps(4,end) infinite; }
 .av.is-empty { filter:grayscale(1); opacity:.5; }
 @keyframes dsx-breathe { 0%,49%{transform:translateY(0)} 50%,100%{transform:translateY(1px)} }
 @keyframes dsx-pace { 0%{transform:translateX(-3px)} 50%{transform:translateX(3px)} 100%{transform:translateX(-3px)} }
 @keyframes dsx-sway { 0%,49%{transform:translateX(0)} 50%,100%{transform:translateX(-1px)} }
 @keyframes dsx-blow { 0%{transform:translateX(1px);opacity:.4} 50%{transform:translateX(-1px);opacity:1} 100%{transform:translateX(1px);opacity:.4} }
 @keyframes dsx-perk { 0%,49%{transform:translateY(0)} 50%,100%{transform:translateY(-1px)} }
 @keyframes dsx-lift { 0%,49%{transform:translateX(0)} 50%,100%{transform:translateX(1px)} }
 @keyframes dsx-wave { 0%,49%{transform:translateX(0)} 50%,100%{transform:translateX(1px)} }
 @keyframes dsx-bloom { 0%{opacity:.25} 50%{opacity:1} 100%{opacity:.25} }
 @media (prefers-reduced-motion: reduce) { .av, .av * { animation:none !important } }
"""


def stage(pid, state, empty=False, scale=2):
    w, h = 48 * scale, 24 * scale
    flag = (f'<use class="dsx-fl" href="#{pid}-f-ask"/>' if state == "ask" else "")
    return (f'<svg class="av is-{state}{" is-empty" if empty else ""}" viewBox="0 0 48 24" '
            f'width="{w}" height="{h}" shape-rendering="crispEdges">'
            f'<use class="dsx-fx" href="#{pid}-x-{state}"/>{flag}'
            f'<use class="dsx-bd" href="#{pid}-body"/>'
            f'<use class="dsx-pp" href="#{pid}-p-{state}"/></svg>')


def main():
    rows = []
    for p in g.PERSONAS:
        cells = "".join(
            f'<figure>{stage(p["id"], st)}<figcaption>{label}</figcaption></figure>'
            for st, label in STATES)
        rows.append(f"""<div class="seat">
      <div class="meta"><span class="swatch" style="background:{p['color']}"></span>
        <div><div class="name">{p['name']}</div><div class="role">{p['role']}</div>
        <div class="prop">{p['prop']}</div></div></div>
      <div class="frames">{cells}</div></div>""")

    # 264px 侧栏、2 列 x 4 行的实况模拟：4 张真卡尺寸（内宽 111px），各占一种状态
    sim = "".join(
        f'<div class="card is-{st}"><div class="avwrap">{stage(p["id"], st, empty=(st == "empty"))}</div>'
        f'<div class="r1"><span class="nm">{p["name"]}</span><span class="stt">{label.split(" ·")[0]}</span></div>'
        f'<div class="ln tool">bash <span class="arg">python3 baxian.py</span><span class="el">12s</span></div>'
        f'<div class="ln think">想 现在小人能利用 card 的宽度…</div>'
        f'<div class="ln res">↳ wrote design/sprites.svg</div>'
        f'<div class="ln say">说 四态各自成立，法宝动起来了</div></div>'
        for (p, (st, label)) in list(zip(g.PERSONAS, STATES * 2))[:8])

    html = f"""<!doctype html><html lang="zh"><head><meta charset="utf8">
<title>八仙 · 四态 sprite 验收</title><style>
 :root {{ --ink:#26221C; --paper:#F7F5EF; --line:rgba(38,34,28,.14); }}
 * {{ box-sizing:border-box; }}
 body {{ margin:0; padding:28px 32px 60px; background:var(--paper); color:var(--ink);
        font:14px/1.5 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif; }}
 h1 {{ font-size:19px; margin:0 0 4px; }}
 .sub {{ color:#6B6459; margin:0 0 6px; font-size:12.5px; }}
 h2 {{ font-size:12px; letter-spacing:.1em; text-transform:uppercase; color:#8B8478;
       margin:30px 0 12px; font-weight:600; }}
 .seat {{ display:flex; align-items:center; gap:20px; padding:10px 16px; border:1px solid var(--line);
          border-radius:12px; background:#FBFAF6; margin-bottom:7px; }}
 .meta {{ display:flex; align-items:center; gap:11px; width:150px; flex:none; }}
 .swatch {{ width:10px; height:34px; border-radius:3px; flex:none; }}
 .name {{ font-size:15px; font-weight:650; }}
 .role {{ font-size:11.5px; color:#6B6459; }}
 .prop {{ font-size:10.5px; color:#8B8478; font-family:ui-monospace,Menlo,monospace; }}
 .frames {{ display:flex; align-items:flex-end; gap:14px; }}
 figure {{ margin:0; text-align:center; }}
 figcaption {{ font-size:10px; color:#8B8478; margin-top:5px; }}
 .sim {{ background:#26221C; border-radius:12px; padding:14px; width:264px; }}
 .simgrid {{ display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px; }}
 .card {{ background:#FBFAF6; border:1px solid var(--line); border-radius:12px; padding:8px 8px 7px;
          display:flex; flex-direction:column; gap:3px; }}
 .card.is-ask {{ border-color:#B5453C; box-shadow:inset 0 0 0 1px #B5453C; }}
 .avwrap {{ display:flex; justify-content:center; }}
 .r1 {{ display:flex; align-items:baseline; justify-content:space-between; gap:5px; }}
 .nm {{ font-size:11px; font-weight:650; }}
 .stt {{ font-size:9px; color:#8B8478; }}
 .ln {{ font-size:9px; line-height:1.35; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
        color:#5C554A; }}
 .ln.think {{ font-style:italic; }}
 .ln.res,.ln.say {{ color:#8B8478; }}
 .tool {{ color:#A8543A; font-family:ui-monospace,Menlo,monospace; }}
 .el {{ float:right; color:#8B8478; }}
 .note {{ font-size:12.5px; color:#6B6459; max-width:86ch; line-height:1.75; }}
 {ANIM_CSS}
</style></head><body>
{g.build()}
<h1>八仙 · 四态 sprite 验收</h1>
<p class="sub">48×24 逻辑画布（身体 24 列居中，左右各 12 列给动作）｜2× 整数放大 = 96×48｜
分层：身体 / 法宝 / 广域动效 / 朱砂旗</p>

<h2>一、四态姿势逐席对照（真动画在跑）</h2>
{''.join(rows)}

<h2>二、贴到真实卡片尺寸（264px 侧栏 · 2×4 · 内宽 111px）</h2>
<div class="sim"><div class="simgrid">{sim}</div></div>
<p class="note">这一块是 1:1 尺寸，看的是「2× 放大后还认不认得出、动效会不会糊成一团」。</p>
</body></html>"""
    (OUT / "sprite-preview.html").write_text(html, encoding="utf8")
    print("wrote sprite-preview.html")


if __name__ == "__main__":
    main()
