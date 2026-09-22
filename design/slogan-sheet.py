#!/usr/bin/env python3
"""slogan 看样页 —— 按**真实顶栏尺寸**渲染候选，而不是让人读描述。

为什么做这个：slogan 好不好，取决于它在 268px 侧栏、11px 字号、紧挨着一枚「8」圆标时
念出来是什么感觉。光在对话里看文字，谁都会觉得「差不多」；摆到真尺寸上，好坏一眼就分。

CSS 是从 src/client.template.js 里抄的真实规则（.dsx-head / .dsx-title / .dsx-count），
不是另写一套 —— 否则看样页会骗人。
"""
from pathlib import Path

OUT = Path(__file__).parent

# (顶栏字, 悬停首行, 出处, 把什么写进去了, 备注/风险)
CANDIDATES = [
    ("八仙列坐 · 各持法宝 · 各显神通", "—— 现状（对照）", "画面罗列；且带「八」，按新约束出局"),
    ("其静也专，其动也直", "《周易·系辞上》「夫乾，其静也专，其动也直，是以大生焉」",
     "静时专一、动时直达 —— **正是这块板的两种状态**：闲着是蓄势待命，跑起来是直取目标。且是正面词，不会被读成「板子死了」"),
    ("四时行焉，百物生焉", "《论语·阳货》「天何言哉？四时行焉，百物生焉」",
     "不言而四时自运、百物自生 —— 无人发令，八席自行推进、各自产出"),
    ("独立不改，周行不殆", "《道德经》二十五章「独立而不改，周行而不殆」",
     "各自独立而不改其性，循环运转而不枯竭 —— 长期在岗、反复运转、互不干扰"),
    ("云无心以出岫，鸟倦飞而知还", "陶渊明《归去来兮辞》",
     "云不为目的而出山，鸟倦了自知归巢 —— **无待而作、倦而知归**：两个动作恰好对应「运功」与「归位」"),
    ("木欣欣以向荣，泉涓涓而始流", "陶渊明《归去来兮辞》（同篇，紧接上句）",
     "草木各自向荣、泉水各自始流 —— 各自生长、各自成事，不相妨"),
    ("寂然不动，感而遂通", "《周易·系辞上》「易无思也，无为也，寂然不动，感而遂通天下之故」",
     "静时寂然，有事一感即通 —— 八席自跑时你不动，待答/待裁一出现你立刻响应"),
    ("云行雨施，品物流形", "《周易》乾卦·彖传",
     "云自行、雨自施，众物各自流布成形 —— 各自发动、各自产出，同出一道"),
    ("目送归鸿，手挥五弦", "嵇康《赠兄秀才入军》",
     "手上做着自己的事，眼里看着它们各自飞走 —— 写「两件事同时」，不写「他们怎样」"),
    ("万象自运，一鉴无遗", "旧体自作（对仗）",
     "万象自行运转，一面镜子什么也不漏 —— 自治 + 不漏事，两句各管一头"),
]

HINT_TAIL = [
    "· 八位定员：不增不减，八是上限也是全部",
    "· 每位是一个长期在岗的 agent，不是一次对话",
    "· 法宝 = 各席的本事：法宝动，就是在运功",
    "· 点空席就位；点已就位者，主栏打开该席",
]


def main():
    rows = []
    for i, (line, src, meaning) in enumerate(CANDIDATES):
        rows.append(f"""
  <section class="row{' is-now' if i == 0 else ''}">
    <div class="meta">
      <div class="idx">{'' if i == 0 else i}</div>
      <div class="src">{src}</div>
    </div>
    <div class="stage">
      <div class="sbar">
        <!-- 真实顶栏：对句直接就是标题，没有悬停 -->
        <div class="dsx-head"><span class="dsx-title">{line}</span><span class="dsx-count">8</span></div>
      </div>
      <div class="w">宽 <b class="ww"></b>px / 可用 214px</div>
    </div>
    <div class="why"><span>{meaning}</span></div>
  </section>""")

    html = f"""<!doctype html><html lang="zh"><head><meta charset="utf8">
<title>slogan 看样（真实顶栏尺寸）</title><style>
 :root {{ --ink:#26221C; --paper:#F1EEE7; --mut:#8B8478; }}
 * {{ box-sizing:border-box; }}
 body {{ margin:0; padding:26px 30px 60px; background:var(--paper); color:var(--ink);
   font:14px/1.5 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif; }}
 h1 {{ font-size:18px; margin:0 0 3px; }}
 .sub {{ color:#6B6459; font-size:12.5px; margin:0 0 18px; }}
 .row {{ display:grid; grid-template-columns:150px 300px 1fr; gap:20px; align-items:start;
   background:#FBFAF6; border:1px solid rgba(38,34,28,.12); border-radius:12px;
   padding:14px 16px; margin-bottom:9px; }}
 .row.is-now {{ background:#F6F2E9; border-style:dashed; }}
 .meta .idx {{ font:600 22px/1 ui-monospace,Menlo,monospace; color:#C0B7A6; }}
 .meta .src {{ font-size:11.5px; color:#6B6459; margin-top:6px; }}
 /* 侧栏：真实内宽 268px */
 .sbar {{ width:268px; background:#F7F5EF; border:1px solid rgba(38,34,28,.10);
   border-radius:10px; padding:8px 6px 10px; }}
 /* 以下三条是从 client.template.js 抄的真实规则 */
 .dsx-head {{ display:flex; align-items:center; justify-content:space-between; padding:0 2px; }}
 .dsx-title {{ font-size:11px; font-weight:600; letter-spacing:.08em; text-transform:uppercase;
   color:#8B8478; }}
 .dsx-count {{ font-size:10px; font-variant-numeric:tabular-nums; color:#8B8478;
   border:1px solid rgba(0,0,0,.12); border-radius:999px; padding:1px 7px; }}
 .vlab {{ font-size:9px; letter-spacing:.06em; color:#B3AA99; margin:7px 2px 3px; }}
 .dsx-head + .vlab {{ margin-top:11px; }}
 .w {{ font-size:11px; color:#8B8478; margin-top:7px; }}
 .w b {{ color:#26221C; }}
 .gtip {{ margin-top:11px; background:#FFF; border:1px solid rgba(38,34,28,.14); border-radius:8px;
   padding:7px 9px; box-shadow:0 2px 10px rgba(38,34,28,.07); }}
 .gtip .glabel {{ font-size:9px; letter-spacing:.08em; color:#B3AA99; }}
 .gtip pre {{ margin:3px 0 0; font:11px/1.65 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;
   color:#4A443B; white-space:pre-wrap; }}
 .why b {{ display:block; font-size:13px; font-weight:600; margin-bottom:4px; }}
 .why span {{ font-size:12px; color:#6B6459; }}
 .note {{ font-size:12.5px; color:#6B6459; margin-top:16px; max-width:92ch; line-height:1.75; }}
</style></head><body>
<h1>slogan 看样 · 按真实顶栏尺寸</h1>
<p class="sub">按已定的两条规则渲染：<b>顶栏直接用对句</b>（没有独立标题、<b>不要悬停</b>）、<b>句中不带「八」</b>、<b>严格对仗</b>。
中间是 268px 真实侧栏、11px 字号、紧挨计数圆标。</p>
{''.join(rows)}
<p class="note">看的时候只需问两件事：<b>① 它在 11px 下念出来像不像一句挂在墙上的话；② 不看任何解释，它能不能自己站住。</b>
（按你的要求，顶栏不再有悬停 —— 这句必须自足。）</p>
</body></html>"""
    (OUT / "slogan-sheet.html").write_text(html, encoding="utf8")
    print("wrote slogan-sheet.html")


if __name__ == "__main__":
    main()
