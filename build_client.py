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
    W_, H_ = baxian.CW, baxian.CH
    need = [
        (f"viewBox: \"0 0 {W_} {H_}\"", "Avatar 的 viewBox 与画布不一致"),
        (f"width:{2 * W_}px;height:{2 * H_}px", f"卡片舞台必须是画布的整数 2 倍（{2 * W_}x{2 * H_}）"),
        (f".dsx-av.is-chip{{width:{W_}px;height:{H_}px;}}", f"对话头徽章必须是画布 1 倍（{W_}x{H_}）"),
    ]
    miss = [why for frag, why in need if frag not in tpl]
    if miss:
        raise SystemExit("画布/CSS 尺寸不一致（会导致非整数缩放 = 像素糊，且不报错）:\n  " + "\n  ".join(miss))

    # ---- 断言：每个席位都必须有自己的编排（不然它干活时就是静止的）----------
    no_choreo = [i for i in used if i not in baxian.CHOREO]
    if no_choreo:
        raise SystemExit("这些席位没有编排（干活时会一动不动）: " + ", ".join(no_choreo))

    sprite_js = json.dumps(sprites, ensure_ascii=False)
    out = tpl.replace(marker, "/*__SPRITES__*/ " + sprite_js)
    out = out.replace(cmark, baxian.choreo_css())
    OUT.write_text(out, encoding="utf8")

    n = out.count("<symbol")
    layers = len(used) * (2 + 2 * len(baxian.STATES))
    periods = sorted({baxian.CHOREO[i]["period"] for i in used})
    print(f"wrote {OUT}  ({len(out):,} bytes, {n} symbols / {layers} expected, "
          f"{len(used)} seats verified, {len(baxian.STATES)} states, "
          f"{len(used)} choreographies · 周期 {periods[0]}–{periods[-1]}ms)")


if __name__ == "__main__":
    main()
