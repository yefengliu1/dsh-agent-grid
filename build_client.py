#!/usr/bin/env python3
"""
把 design/baxian.py 生成的 sprite 表注入 src/client.template.js，产出 lib/client.js。

这样 sprite 的「真值」在 Python 生成器里，插件只是消费方 —— 改人设/改道具只动一处。

构建期会校验：模板里每个席位的 id 必须在 sprite 表里齐备**全部 10 层**
（body + p-<态>×4 + x-<态>×4 + f-ask）。
为什么需要这条断言：实测踩过一次 —— 插件里的 id 从上一版抄成了 "kongming"，
而生成器产出的 id 是 "hanzhongli"，于是那个格子在真实 GUI 里**渲染成空白**，
既不报错也没有任何提示，只有肉眼看截图才发现。
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "design"))

import baxian  # noqa: E402

TPL = ROOT / "src" / "client.template.js"
OUT = ROOT / "lib" / "client.js"


def main():
    tpl = TPL.read_text(encoding="utf8")
    marker = '/*__SPRITES__*/ ""'
    if marker not in tpl:
        raise SystemExit(f"marker not found in {TPL}")
    cmark = "/*__CHOREO__*/"
    if cmark not in tpl:
        raise SystemExit(f"choreo marker not found in {TPL}")

    sprites = baxian.build()
    known = {p["id"] for p in baxian.PERSONAS}

    # ---- 断言：模板 SEATS 里用到的 sprite id 必须都存在 ----------------------
    used = re.findall(r'\{\s*id:\s*"([^"]+)"\s*,\s*key:\s*"seat-\d+"', tpl)
    if len(used) != len(baxian.PERSONAS):
        raise SystemExit(
            f"模板里找到 {len(used)} 个席位，生成器有 {len(baxian.PERSONAS)} 个 —— 数量对不上")
    # ---- 断言：每席的**每一层**都在（分层之后，缺一层就是静默空白）------------
    def layers_of(pid):
        return ([f"{pid}-body", f"{pid}-f-ask"]
                + [f"{pid}-{pre}-{st}" for pre in ("p", "x") for st in baxian.STATES])

    missing = [n for pid in used for n in layers_of(pid) if f'id="{n}"' not in sprites]
    if missing:
        raise SystemExit(
            "精灵表缺少这些 symbol（会在 GUI 里静默渲染成空白）: " + ", ".join(missing[:12]) +
            f"\n生成器状态: {baxian.STATES}｜每席应有: body + p-<态> + x-<态> + f-ask")

    missing = missing or [i for i in used if i not in known]
    if missing:
        raise SystemExit(
            "模板引用了不存在的 sprite id: " + ", ".join(missing) +
            "\n生成器可用: " + ", ".join(sorted(known)) +
            "\n（这会导致格子在 GUI 里渲染成空白，且不报错）")
    unused = sorted(known - set(used))
    if unused:
        print(f"note: 生成器里有 {len(unused)} 个 sprite 未被引用: {', '.join(unused)}")

    # ---- 断言：CSS 尺寸必须与 sprite 画布严格成整数倍，viewBox 必须与画布一致 ----
    # 这条是踩出来的：把画布高度从 28 改回 24 时漏改了 viewBox，
    # 于是 CSS 112x48 对上 viewBox 56x28 —— preserveAspectRatio 把精灵按
    # 1.714× 非整数缩放，像素整片糊掉，且**没有任何报错**，只有量缩放比才发现。
    #
    # 2026-10-16 追加第二处同类：窄轨把整幅 56×24 塞进 24×24 的框（0.43× 缩放），
    # 小人格子被抹平 —— 肉眼可见的糊。修法是**裁切**身体那 24 列（OX..OX+24），
    # 于是窗口 24 宽放进 24px 的框 = 1×。下面把这条也钉住：裁切窗口的偏移必须等于
    # 生成器的 OX、宽度必须等于 24 网格，且 rail 的框必须与窗口等宽。
    W_, H_, OX_ = baxian.CW, baxian.CH, baxian.OX
    crop = f'"{OX_} 0 {baxian.W} {baxian.W}"'
    need = [
        # 整幅窗口现在是三元表达式的一支（viewBox = o.crop ? 裁切 : 整幅），
        # 所以断言字面量 + 那个三元本身都在，而不是断言 `viewBox: "..."` 这种写法。
        (f'"0 0 {W_} {H_}"', "Avatar 的整幅窗口与画布不一致"),
        ("o.crop ?", "Avatar 没有按 crop 分窗（窄轨会退回整幅缩放 = 糊）"),
        ("width: AV_W, height: AV_H", "`<use>` 没有显式声明画布视口 —— 引用 symbol 时会按外层视口重新缩放（窄轨会糊）"),
        (f"width:{2 * W_}px;height:{2 * H_}px", f"卡片舞台必须是画布的整数 2 倍（{2 * W_}x{2 * H_}）"),
        (f".dsx-av.is-chip{{width:{W_}px;height:{H_}px;}}", f"对话头徽章必须是画布 1 倍（{W_}x{H_}）"),
        (crop, f"窄轨的裁切窗口必须是「OX 起 24 列」（{crop}）—— 否则又是非整数缩放"),
        (f".dsx-railbtn .dsx-av{{width:{baxian.W}px;height:{baxian.W}px;}}",
         f"窄轨的框必须与裁切窗口等宽（{baxian.W}px）= 1×"),
    ]
    miss = [why for frag, why in need if frag not in tpl]
    if miss:
        raise SystemExit("画布/CSS 尺寸不一致（会导致非整数缩放 = 像素糊，且不报错）:\n  " + "\n  ".join(miss))
    # 缩放比必须是整数：整幅 → 卡片 2×、整幅 → 徽章 1×、裁切窗口 → 窄轨 1×
    for label, box, view in (("卡片", 2 * W_, W_), ("徽章", W_, W_), ("窄轨", baxian.W, baxian.W)):
        if box % view != 0:
            raise SystemExit(f"{label}的缩放比不是整数：框 {box} / 窗口 {view}")

    # ---- 断言：每个席位都必须有自己的编排（不然它干活时就是静止的）----------
    no_choreo = [i for i in used if i not in baxian.CHOREO]
    if no_choreo:
        raise SystemExit("这些席位没有编排（干活时会一动不动）: " + ", ".join(no_choreo))

    sprite_js = json.dumps(sprites, ensure_ascii=False)
    out = tpl.replace(marker, "/*__SPRITES__*/ " + sprite_js)
    out = out.replace(cmark, baxian.choreo_css())
    OUT.write_text(out, encoding="utf8")

    n = out.count("<symbol id=\\")  # 数注入进 JS 字符串的 '<symbol id=\"'（注释里提到 symbol 不算）
    layers = len(used) * (2 + 2 * len(baxian.STATES))
    periods = sorted({baxian.CHOREO[i]["period"] for i in used})
    print(f"wrote {OUT}  ({len(out):,} bytes, {n} symbols / {layers} expected, "
          f"{len(used)} seats verified, {len(baxian.STATES)} states, "
          f"{len(used)} choreographies · 周期 {periods[0]}–{periods[-1]}ms)")


if __name__ == "__main__":
    main()
