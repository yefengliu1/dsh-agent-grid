#!/usr/bin/env python3
"""
八仙八席 —— 像素头像 sprite 生成器。

设计目标：修掉上一套「8 个唐官挤在一个格子里」的根本问题。
上一套只变了 3 个维度（冠型/道具/主色），留下 4 个维度是常量（体型/年龄性别/胡须/头身比），
所以 48px 盲测只有 5/8 认得出。这一套把 7 个维度全部拉开：

  1. 体型      —— 胖 / 修长 / 瘦削 / 矮小 / 苗条女 / 瘦小少年 / 清瘦 / 方正
  2. 头身比    —— 帽顶起始行随身高变化（矮的整只下移）
  3. 头饰发型  —— 8 种全不同
  4. 胡须      —— 络腮 / 三绺 / 乱须 / 白长须 / 无须 / 短髯
  5. 标志大件  —— 扇 · 剑 · 杖+葫芦 · 渔鼓 · 荷 · 篮 · 箫 · 拍板（形状完全不同）
  6. 主色      —— 8 色相分离
  7. 性别年龄  —— 1 女 + 老中少三代

规格：48x24 逻辑画布（身体 24 列居中，左右各 12 列留给动作出格），整数倍最近邻放大。
分层：身体 / 法宝 / 广域动效 / 朱砂旗 —— 四层各自独立，动效交给 CSS，sprite 表不膨胀。
状态：rest 收起 · work 干活 · ask 举旗召你 · done 归位。
参考：`ux-design.md`。
"""
from pathlib import Path

# ---------------------------------------------------------------- 调色板
PALETTE = {
    "o": "#1A1A1A",   # 描边
    "s": "#E8C9A0",   # 肤色
    "d": "#C9A47C",   # 肤色阴影
    "w": "#FFFFFF",   # 高光
    "k": "#2A2A2A",   # 墨（眼）
    "h": "#3A3330",   # 深发
    "H": "#D2CEC5",   # 白发
    "g": "#C9A227",   # 金（箍/饰）
    "m": "#C2CAD2",   # 金属
    "n": "#8A939C",   # 金属暗
    "t": "#8A6A3F",   # 木/竹
    "a": "#F2EBD8",   # 纸/绢
    "e": "#4E8A3F",   # 叶绿（荷梗/蕉叶）
    "E": "#2F5A26",   # 叶绿暗（蕉叶中肋）
    "B": "#B5453C",   # 朱砂（旗/警示，与产品 UI 的错误色同源）
    "C": "#8E2F27",   # 朱砂暗（旗面阴影）
}

# ---------------------------------------------------------------- 八仙
# body = (左边界, 右边界, 手臂宽)；y_off = 整只下移行数（矮的人下移 = 显矮）
PERSONAS = [
    dict(id="hanzhongli", name="钟离", role="总控 · 规划", color="#A8543A",
         hat="yaji", hair="h", beard="full", prop="fan",
         body=(4, 19, 2), y_off=0, belly=True, flare=False),
    dict(id="ludongbin", name="洞宾", role="执行 · 攻坚", color="#2E8A9C",
         hat="chunyang", hair="h", beard="three", prop="sword",
         body=(6, 17, 2), y_off=0, belly=False, flare=False),
    dict(id="tieguali", name="铁拐", role="修复 · 值守", color="#5A5F66",
         hat="shag", hair="H", beard="messy", prop="staff",
         body=(7, 16, 1), y_off=1, belly=False, flare=False),
    dict(id="zhangguolao", name="张果", role="审查 · 复盘", color="#3F7A55",
         hat="futou", hair="H", beard="long", prop="drum",
         body=(6, 17, 1), y_off=2, belly=False, flare=False),
    dict(id="hexiangu", name="仙姑", role="文档 · 整理", color="#B85A7A",
         hat="huanji", hair="h", beard="none", prop="lotus",
         body=(7, 16, 1), y_off=0, belly=False, flare=True),
    dict(id="lancaihe", name="采和", role="检索 · 收集", color="#3F4F9C",
         hat="zongjiao", hair="h", beard="none", prop="basket",
         body=(7, 16, 1), y_off=2, belly=False, flare=False),
    dict(id="hanxiangzi", name="湘子", role="谋议 · 协调", color="#7A4A9C",
         hat="xiaoyao", hair="h", beard="none", prop="flute",
         body=(6, 17, 1), y_off=0, belly=False, flare=False),
    dict(id="caoguoju", name="国舅", role="决断 · 验证", color="#B0891E",
         hat="zhanjiao", hair="h", beard="short", prop="pai",
         body=(5, 18, 2), y_off=0, belly=False, flare=False),
]

W = H = 24
EYE_L, EYE_R = (10, 11), (13, 14)   # 绝对列位置，头宽变化时仍居中


def shade(hex_color, factor):
    h = hex_color.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    f = lambda v: max(0, min(255, round(v * factor)))
    return f"#{f(r):02X}{f(g):02X}{f(b):02X}"


def row(*segs):
    """段式构造一行：(起始列, 字符, 长度)。越界抛错，不静默截断。"""
    line = ["."] * W
    for start, ch, length in segs:
        if start < 0 or start + length > W:
            raise ValueError(f"segment out of bounds: start={start} len={length} ({ch})")
        for i in range(length):
            line[start + i] = ch
    return "".join(line)


def shift(rows, dy):
    out = {}
    for y, line in rows.items():
        ny = y + dy
        if 0 <= ny < H:
            out[ny] = line
    return out


# ---------------------------------------------------------------- 头（Q版大头）
def head(hair):
    """头 x8..16（9 宽），眼睛 2x2 —— Q版的关键是眼睛要大。"""
    return {
        7:  row((8, "o", 1), (9, "d", 1), (10, "d", 5), (15, "d", 1), (16, "o", 1)),  # 帽下阴影
        8:  row((8, "o", 1), (9, "s", 7), (16, "o", 1)),
        9:  row((8, "o", 1), (9, "s", 1), (10, "k", 2), (12, "s", 1), (13, "k", 2), (15, "s", 1), (16, "o", 1)),
        10: row((8, "o", 1), (9, "s", 1), (10, "k", 2), (12, "s", 1), (13, "k", 2), (15, "s", 1), (16, "o", 1)),
        11: row((8, "o", 1), (9, "s", 3), (12, "d", 1), (13, "s", 3), (16, "o", 1)),  # 鼻
        12: row((8, "o", 1), (9, "s", 1), (10, "s", 1), (11, "d", 2), (13, "s", 1), (14, "s", 1), (15, "s", 1), (16, "o", 1)),
        13: row((10, "o", 1), (11, "d", 2), (13, "o", 1)),  # 下颌收窄
    }


# ---------------------------------------------------------------- 冠/发型（8 种全不同）
def hat(kind):
    if kind == "yaji":          # 双丫髻：头顶两个侧丸子（钟离·胖壮）
        return {
            2: row((9, "o", 2), (14, "o", 2)),
            3: row((8, "o", 3), (14, "o", 3)),
            4: row((8, "o", 1), (9, "h", 1), (10, "h", 1), (11, "o", 1), (13, "o", 1), (14, "h", 1), (15, "h", 1), (16, "o", 1)),
            5: row((8, "o", 1), (9, "h", 7), (16, "o", 1)),
            6: row((8, "o", 1), (9, "h", 7), (16, "o", 1)),
        }
    if kind == "chunyang":      # 纯阳巾：方形软巾，后有折角
        return {
            2: row((10, "o", 4)),
            3: row((9, "o", 1), (10, "q", 4), (14, "o", 1)),
            4: row((8, "o", 1), (9, "q", 6), (15, "o", 1)),
            5: row((8, "o", 1), (9, "P", 6), (15, "o", 1)),
            6: row((8, "o", 8), (16, "o", 1)),
            7: row((8, "o", 1), (9, "h", 1), (17, "o", 1)),
        }
    if kind == "shag":          # 蓬发 + 金箍（铁拐·老瘦）
        return {
            2: row((9, "o", 1), (11, "o", 1), (13, "o", 1)),
            3: row((8, "o", 1), (9, "H", 1), (10, "H", 1), (12, "H", 1), (14, "H", 1), (15, "o", 1)),
            4: row((8, "o", 1), (9, "H", 6), (15, "o", 1)),
            5: row((7, "o", 1), (8, "g", 9), (17, "o", 1)),      # 金箍
            6: row((8, "o", 1), (9, "H", 7), (16, "o", 1)),
        }
    if kind == "futou":         # 幞头：软裹帽，两侧垂脚（张果·矮老）
        return {
            3: row((10, "o", 4)),
            4: row((9, "o", 1), (10, "P", 4), (14, "o", 1)),
            5: row((8, "o", 8), (16, "o", 1)),
            6: row((6, "o", 1), (7, "P", 2), (9, "o", 1), (10, "P", 4), (14, "o", 1), (15, "P", 2), (17, "o", 1)),
            7: row((6, "o", 2), (16, "o", 2)),
        }
    if kind == "huanji":        # 双环髻 + 两鬓垂发（仙姑·女）—— 垂发是性别的主要剪影信号
        return {
            1: row((9, "o", 3), (14, "o", 3)),
            2: row((8, "o", 1), (9, "h", 2), (11, "o", 1), (13, "o", 1), (14, "h", 2), (16, "o", 1)),
            3: row((8, "o", 1), (9, "h", 2), (11, "o", 1), (13, "o", 1), (14, "h", 2), (16, "o", 1)),
            4: row((8, "o", 1), (9, "h", 7), (16, "o", 1)),
            5: row((8, "o", 1), (9, "h", 7), (16, "o", 1)),
            6: row((7, "o", 1), (8, "h", 9), (17, "o", 1)),
            7: row((6, "o", 1), (7, "h", 1), (8, "o", 1), (16, "o", 1), (17, "h", 1), (18, "o", 1)),
            8: row((6, "o", 1), (7, "h", 1), (8, "o", 1), (16, "o", 1), (17, "h", 1), (18, "o", 1)),
            9: row((6, "o", 1), (7, "h", 1), (8, "o", 1), (16, "o", 1), (17, "h", 1), (18, "o", 1)),
            10: row((6, "o", 1), (7, "h", 1), (8, "o", 1), (16, "o", 1), (17, "h", 1), (18, "o", 1)),
            11: row((7, "o", 1), (8, "o", 1), (16, "o", 1), (17, "o", 1)),
        }
    if kind == "zongjiao":      # 总角：头顶两个小揪（采和·少年）
        return {
            2: row((10, "o", 1), (13, "o", 1)),
            3: row((10, "o", 1), (13, "o", 1)),
            4: row((8, "o", 1), (9, "h", 2), (11, "o", 1), (12, "o", 1), (13, "h", 2), (16, "o", 1)),
            5: row((8, "o", 1), (9, "h", 7), (16, "o", 1)),
            6: row((8, "o", 1), (9, "h", 7), (16, "o", 1)),
        }
    if kind == "xiaoyao":       # 逍遥巾：高软巾，顶有结（湘子·书生）
        return {
            1: row((11, "o", 2)),
            2: row((10, "o", 1), (11, "q", 2), (13, "o", 1)),
            3: row((9, "o", 6)),
            4: row((8, "o", 1), (9, "q", 6), (15, "o", 1)),
            5: row((8, "o", 1), (9, "P", 6), (15, "o", 1)),
            6: row((8, "o", 8), (16, "o", 1)),
        }
    # zhanjiao：展脚幞头 —— 两侧长横翅，剪影最独特
    return {
        2: row((10, "o", 4)),
        3: row((9, "o", 1), (10, "P", 4), (14, "o", 1)),
        4: row((8, "o", 8), (16, "o", 1)),
        5: row((4, "o", 1), (5, "P", 4), (9, "o", 6), (15, "P", 4), (19, "o", 1)),
        6: row((4, "o", 6), (10, "o", 4), (14, "o", 6)),
        7: row((8, "o", 1), (9, "h", 7), (16, "o", 1)),
    }


# ---------------------------------------------------------------- 胡须（年龄/性格信号）
def beard(kind, hair):
    if kind == "none":
        return {}
    if kind == "full":          # 络腮大胡（钟离）
        return {
            12: row((8, "o", 1), (9, hair, 1), (15, hair, 1), (16, "o", 1)),
            13: row((9, "o", 1), (10, hair, 5), (15, "o", 1)),
            14: row((10, "o", 1), (11, hair, 3), (14, "o", 1)),
        }
    if kind == "three":         # 三绺长须（洞宾）
        return {
            13: row((11, "o", 1), (12, hair, 1), (13, "o", 1)),
            14: row((11, hair, 1), (13, hair, 1)),
            15: row((11, hair, 1), (13, hair, 1)),
            16: row((11, hair, 1), (13, hair, 1)),
            17: row((11, "o", 1), (13, "o", 1)),
        }
    if kind == "messy":         # 乱须（铁拐）
        return {
            12: row((9, hair, 1), (11, hair, 2), (15, hair, 1)),
            13: row((10, "o", 1), (11, hair, 2), (14, "o", 1)),
            14: row((11, hair, 2)),
        }
    if kind == "long":          # 白长须及胸（张果）
        return {
            13: row((10, "o", 1), (11, hair, 3), (14, "o", 1)),
            14: row((10, "o", 1), (11, hair, 3), (14, "o", 1)),
            15: row((11, "o", 1), (12, hair, 1), (13, "o", 1)),
            16: row((11, "o", 1), (12, hair, 1), (13, "o", 1)),
            17: row((11, "o", 1), (12, hair, 1), (13, "o", 1)),
        }
    # short：短髯（国舅）—— 只在嘴两侧加两撇 + 下巴一小撮，不画描边（免得脸上出现多余黑点）
    return {
        12: row((8, "o", 1), (9, "s", 1), (10, hair, 1), (11, "d", 2), (13, hair, 1), (14, "s", 1), (15, "s", 1), (16, "o", 1)),
        13: row((9, "o", 1), (10, hair, 4), (14, "o", 1)),
    }


# ---------------------------------------------------------------- 躯干（体型参数化）
def belt_row(l, r):
    return row((l, "o", 1), (l + 1, "P", r - l - 3), (r - 2, "n", 2), (r - 1, "P", 1), (r, "o", 1))


def body(p):
    l, r, aw = p["body"]
    d = {}
    for y in range(14, 23):
        if y == 18:                       # 腰带
            d[y] = belt_row(l, r)
            continue
        # 胖人腰带以下外鼓；少女裙摆外扩（2px 才读得出来，1px 在 48px 下看不见）
        wl, wr = l, r
        if p["belly"] and y > 18:
            wl, wr = l - 1, r + 1
        if p["flare"] and y >= 20:
            wl, wr = l - 2, r + 2
        if wr - wl < 4 + 2 * aw + 2:      # 太窄就退回原宽
            wl, wr = l, r
        if y == 21:                       # 袍摆暗阶
            d[y] = row((wl, "o", 1), (wl + 1, "P", wr - wl - 1), (wr, "o", 1))
            continue
        if y == 22:                       # 底边：不整行纯描边（上一套的黑杠教训）
            d[y] = row((wl, "o", 1), (wl + 1, "P", wr - wl - 1), (wr, "o", 1))
            continue
        mid = wr - wl - 3 - 2 * aw
        d[y] = row(
            (wl, "o", 1),
            (wl + 1, "q", aw),
            (wl + 1 + aw, "P", 1),
            (wl + 2 + aw, "p", mid),
            (wr - 1 - aw, "P", 1),
            (wr - aw, "q", aw),
            (wr, "o", 1),
        )
    return d


# ---------------------------------------------------------------- 画布（宽版）
# 画布宽度是「能用多少横向空间」的唯一旋钮，改过两次：
#   24 → 48：card 内宽 111px 时，24 宽的小人只占 48px，左右各空 30px，
#            法宝没地方使劲（扇风扫不出去、剑气划不出弧、花瓣飘不开）。
#   48 → 56：2× 下 112px，把 116px 的卡片内宽基本吃满；左右各 16 格给
#            「单向步进」（连走三步再跨回）与更大的法宝动效，而不是原地对称摆动。
CW = 56          # 画布列数
CH = 24          # 画布行数 = 身体高度。**不加高**：卡片高度是稀缺资源，
                 # 纵向动作改成 1-2 格的小幅起伏就够（用户：「不要加大高度，动作起伏高低一点」），
                 # 不再靠加画布来容纳大跳。
OX = 16          # 身体的第 0 列落在画布第 16 列
OY = 0           # 身体的第 0 行落在画布第 0 行
STATES = ("rest", "work", "ask", "done")


class Canvas:
    """画布坐标（宽 CW）的绘制缓冲。合并/覆盖都显式，避免段式 row() 互相踩。"""

    def __init__(self):
        self.g = [["."] * CW for _ in range(CH)]

    def put(self, x, y, ch):
        if 0 <= x < CW and 0 <= y < CH and ch != ".":
            self.g[y][x] = ch

    def hline(self, x, y, n, ch):
        for i in range(n):
            self.put(x + i, y, ch)

    def vline(self, x, y, n, ch):
        for i in range(n):
            self.put(x, y + i, ch)

    def blit(self, rows, ox=0, oy=0):
        """把身体坐标系（24x24）的一层贴到画布上：ox 恒为 OX + 0，oy 恒为 OY + 人设 y_off。"""
        for y, line in rows.items():
            for x, ch in enumerate(line):
                if ch != ".":
                    self.put(ox + x, oy + y, ch)
        return self

    def rows(self):
        return {y: "".join(r) for y, r in enumerate(self.g) if any(c != "." for c in r)}


# ---------------------------------------------------------------- 标志大件（形状全不同）
def prop(kind, frame="rest"):
    """按「休息」位定义；frame='work' 时由 _work_variant 在道具自身上做动效。
    注意：八件道具的休息位锚点必须分散，否则 48px 下会退化成一坨（上一套的教训）。"""
    d = {}
    if kind == "fan":           # 芭蕉扇：右上蕉叶，上宽下尖收成扇柄；中肋用**暗绿**(E)不是人设暗色
        d[3]  = row((21, "o", 2))                                     # 叶尖
        d[4]  = row((20, "o", 1), (21, "e", 2), (23, "o", 1))
        d[5]  = row((19, "o", 1), (20, "e", 1), (21, "E", 1), (22, "e", 1), (23, "o", 1))
        d[6]  = row((18, "o", 1), (19, "e", 1), (20, "e", 1), (21, "E", 1), (22, "e", 1), (23, "o", 1))
        d[7]  = row((18, "o", 1), (19, "w", 1), (20, "e", 1), (21, "E", 1), (22, "e", 1), (23, "o", 1))
        d[8]  = row((18, "o", 1), (19, "e", 1), (20, "e", 1), (21, "E", 1), (22, "e", 1), (23, "o", 1))
        d[9]  = row((18, "o", 1), (19, "e", 1), (20, "e", 1), (21, "E", 1), (22, "e", 1), (23, "o", 1))
        d[10] = row((19, "o", 1), (20, "e", 1), (21, "E", 1), (22, "e", 1), (23, "o", 1))
        d[11] = row((19, "o", 1), (20, "e", 1), (21, "E", 1), (22, "o", 1))
        d[12] = row((20, "o", 1), (21, "E", 1), (22, "o", 1))
        d[13] = row((21, "o", 2))                                     # 扇柄
        d[14] = row((21, "o", 2))
    elif kind == "sword":       # 宝剑：正上方一道长竖刃（最易识别）
        d[2] = row((20, "o", 2))
        for y in range(3, 16):
            d[y] = row((20, "o", 1), (21, "m", 1))
        d[16] = row((19, "o", 3))       # 护手
        for y in (17, 18):
            d[y] = row((20, "t", 1))
        d[19] = row((20, "o", 1))
    elif kind == "staff":       # 铁拐 + 药葫芦：左竖长杖，杖上悬葫芦
        for y in range(4, 24):
            d[y] = row((3, "o", 1), (4, "t", 1))
        d[3] = row((2, "o", 3))
        d[8] = row((5, "o", 3))
        d[9] = row((5, "o", 1), (6, "P", 1), (7, "o", 1))
        d[10] = row((5, "o", 1), (6, "q", 1), (7, "o", 1))
        d[11] = row((5, "o", 3))
    elif kind == "drum":        # 渔鼓：右中一只**矮胖**竹筒，浅色鼓面 + 高光点（不能太小，48px 才看得见）
        d[13] = row((19, "o", 5))
        d[14] = row((19, "o", 1), (20, "t", 3), (23, "o", 1))
        d[15] = row((19, "o", 1), (20, "a", 1), (21, "w", 1), (22, "a", 1), (23, "o", 1))
        for y in (16, 17):
            d[y] = row((19, "o", 1), (20, "t", 3), (23, "o", 1))
        d[18] = row((19, "o", 5))
    elif kind == "lotus":       # 荷花：头顶擎出的一朵大花
        d[1] = row((19, "o", 3))
        d[2] = row((18, "o", 1), (19, "P", 1), (20, "q", 1), (21, "o", 1))
        d[3] = row((18, "o", 1), (19, "q", 1), (20, "w", 1), (21, "q", 1), (22, "o", 1))
        d[4] = row((18, "o", 1), (19, "q", 1), (20, "q", 1), (21, "q", 1), (22, "o", 1))
        d[5] = row((18, "o", 5))
        for y in range(6, 12):
            d[y] = row((20, "e", 1))
        d[12] = row((19, "o", 3))
    elif kind == "basket":      # 花篮：右下**高**篮 + 提手弧（与矮筒对比明显）；整体上移 2 行免得被 y_off 顶出画布
        d[10] = row((20, "o", 2))
        d[11] = row((19, "o", 1), (21, "o", 1))
        d[12] = row((19, "o", 4))
        d[13] = row((19, "o", 1), (20, "q", 1), (21, "P", 1), (22, "o", 1))
        for y in range(14, 20):
            d[y] = row((19, "o", 1), (20, "t", 2), (22, "o", 1))
        d[20] = row((19, "o", 4))
    elif kind == "flute":       # 紫金箫：**斜抱胸前**（斜线每行只遮 1-2px，不毁躯干；与竖剑相反）
        for i in range(8):
            x, y = 11 + i, 21 - i
            d[y] = row((x, "o", 1), (x + 1, "g", 1))
        d[13] = row((18, "o", 1), (19, "o", 1))
        d[12] = row((19, "o", 1))
    elif kind == "pai":         # 玉板：竖抱胸前（破中线）
        d[14] = row((10, "o", 4))
        for y in range(15, 21):
            d[y] = row((10, "o", 1), (11, "a", 1), (12, "q", 1), (13, "o", 1))
        d[21] = row((10, "o", 4))
    if frame == "work":
        d = _work_variant(kind, d)
    return d


def shift2(rows, dx, dy):
    """二维平移（工作帧里道具摆动用）。越界丢弃。"""
    out = {}
    for y, line in rows.items():
        ny = y + dy
        if not (0 <= ny < H):
            continue
        buf = ["."] * W
        for x, ch in enumerate(line):
            nx = x + dx
            if ch != "." and 0 <= nx < W:
                buf[nx] = ch
        out[ny] = "".join(buf)
    return out


def _work_variant(kind, d):
    """工作帧：动效做在**道具自己身上**，让「在干活」看得出来。

    为什么不用「旁边飘一个白点」：那是个和角色无关的装饰，既不像道具在用，
    也容易被误读成渲染噪点。这里的每一件都有语义：扇子扇风、剑抽长走寒光、
    葫芦发光、鼓槌落下、花开、篮里冒花、箫出声、拍板张开。
    """
    w = dict(d)
    if kind == "fan":           # 挥扇：整片叶子往左上摆 1px + 右上两道风纹
        w = shift2(d, -1, -1)
        w[1] = row((22, "w", 1))
        w[2] = row((23, "w", 1))
        w[3] = row((22, "w", 1))
    elif kind == "sword":       # 抽剑：刃再长 2 行，剑身走一道寒光
        w[0] = row((20, "o", 1), (21, "m", 1))
        w[1] = row((20, "o", 1), (21, "m", 1))
        w[5] = row((20, "o", 1), (21, "w", 1))
        w[11] = row((20, "o", 1), (21, "w", 1))
    elif kind == "staff":       # 施药：葫芦整个发亮 + 两点星芒
        w[9] = row((5, "o", 1), (6, "w", 1), (7, "o", 1))
        w[10] = row((5, "o", 1), (6, "w", 1), (7, "o", 1))
        w[7] = row((8, "w", 1))
        w[12] = row((8, "w", 1))
    elif kind == "drum":        # 击鼓：鼓槌落下 + 鼓面被打亮
        w[15] = row((19, "o", 1), (20, "w", 1), (21, "w", 1), (22, "a", 1), (23, "o", 1))
        for y in (9, 10, 11):
            w[y] = row((21, "t", 1))
        w[12] = row((21, "o", 1))
    elif kind == "lotus":       # 花开：花瓣左右各张开一格 + 花心亮起
        w[2] = row((17, "o", 1), (18, "P", 1), (19, "q", 2), (21, "o", 1))
        w[3] = row((17, "o", 1), (18, "q", 1), (19, "w", 1), (20, "q", 1), (21, "q", 1), (22, "o", 1))
        w[4] = row((17, "o", 1), (18, "q", 1), (19, "q", 1), (20, "q", 1), (21, "q", 1), (22, "o", 1))
        w[5] = row((17, "o", 6))
    elif kind == "basket":      # 采得：篮口冒出两朵花
        w[7] = row((20, "q", 1), (22, "P", 1))
        w[8] = row((19, "o", 1), (20, "w", 1), (21, "q", 1), (22, "o", 1))
        w[9] = row((19, "o", 1), (20, "q", 1), (21, "P", 1), (22, "o", 1))
    elif kind == "flute":       # 吹箫：箫口飘出两个音符
        w[9] = row((19, "o", 2))
        w[10] = row((19, "o", 1))
        w[11] = row((21, "o", 2))
        w[12] = row((21, "o", 1))
    elif kind == "pai":         # 拍板：两片张开 + 中间留出拍击的缝
        for y in range(15, 21):
            w[y] = row((10, "o", 1), (11, "a", 1), (12, "o", 1), (14, "o", 1), (15, "a", 1), (16, "o", 1))
        w[14] = row((10, "o", 3), (14, "o", 3))
        w[21] = row((10, "o", 3), (14, "o", 3))
    return w


# ---------------------------------------------------------------- 四态：法宝的「态位」
# 语义（不是随手挪几格）：
#   rest 收起 —— 法宝下沉两格、往身体靠拢，且 CSS 会给它压暗（不用的时候不该抢眼）
#   work 干活 —— 法宝留在本位（动效由 _work_variant 画在法宝自己身上）
#   ask  举手 —— 法宝上抬两格、微向外展：这是「举着本事在叫你」的姿势
#   done 归位 —— 法宝略沉、收回身侧，交由金光收束
PROP_SIDE = {"fan": "R", "sword": "R", "staff": "L", "drum": "R",
             "lotus": "R", "basket": "R", "flute": "C", "pai": "C"}


def prop_pose(kind, state):
    inward = -2 if PROP_SIDE[kind] == "R" else (2 if PROP_SIDE[kind] == "L" else 0)
    if state == "rest":
        return inward, 2
    if state == "ask":
        return ((-inward // 2) if inward else 0), -2
    if state == "done":
        return inward, 1
    return 0, 0


# ---------------------------------------------------------------- 广域动效（画布层）
def layer_body(p):
    c = Canvas()
    dy = p["y_off"]
    c.blit(shift(body(p), dy), OX, OY)
    c.blit(shift(head(p["hair"]), dy), OX, OY)
    c.blit(shift(beard(p["beard"], p["hair"]), dy), OX, OY)
    c.blit(shift(hat(p["hat"]), dy), OX, OY)
    return c.rows()


def layer_prop(p, state):
    c = Canvas()
    dx, dy = prop_pose(p["prop"], state)
    base = prop(p["prop"], "work" if state == "work" else "rest")
    c.blit(shift2(base, dx, dy), OX, OY + p["y_off"])
    return c.rows()


def prop_box(p, state):
    """法宝在当前态下的包围盒（画布坐标）——动效要贴着法宝长出来，不能飘在空处。

    这是上一版的教训：动效写死在 x=36..43，八件法宝里有一半离得远，
    到 card 实际尺寸下就变成「天上几点灰」，读不出是法宝在使力。
    """
    rows = layer_prop(p, state)
    xs = [x for line in rows.values() for x, ch in enumerate(line) if ch != "."]
    ys = [y for y, line in rows.items() for ch in line if ch != "."]
    if not xs:
        return OX, 0, OX + W - 1, H - 1
    return min(xs), min(ys), max(xs), max(ys)


def body_box(p):
    """躯干剪影的包围盒 —— 胸前的法宝（箫/玉板）动效要以它为界往外画。"""
    rows = layer_body(p)
    xs = [x for line in rows.values() for x, ch in enumerate(line) if ch != "."]
    return min(xs), max(xs)


def layer_fx(p, state):
    """贴着法宝的动效 —— 这才是「利用 card 宽度」的部分。

    每一件都对应法宝的语义，不是通用装饰：扇风扫出去、剑气划弧、鼓点声波、
    花瓣飘开、药气上升、箫声音符、拍板击节。起点一律取法宝包围盒的外缘，
    方向取留白更多的那一侧 —— 所以八件法宝各有各的出效方向，也不会压到身体。

    休息态**不画任何东西**：静就是静。之前画过一个飘着的 z，实测在 card 尺寸下
    被读成「工」字，是噪点不是语义 —— 闲着这件事，格子里那行「多久没动」已经说清了。
    """
    c = Canvas()
    kind = p["prop"]
    if state == "rest":
        return c.rows()

    bx0, by0, bx1, by1 = prop_box(p, state)
    if PROP_SIDE[kind] == "C":
        # 箫与玉板是**抱在胸前**的，包围盒落在躯干里 —— 直接以它为准出效，
        # 那两笔就画在袍子上了（第一版就是这么错的，实测截图里像衣服上的杂点）。
        # 改成以躯干剪影为界往外画。
        bx0, bx1 = body_box(p)
    right = (CW - 1 - bx1) <= bx0          # 右留白更少就往左出
    x = (bx1 + 1) if right else (bx0 - 1)
    step = 1 if right else -1
    mid = (by0 + by1) // 2

    if state == "ask":
        # 举旗召你：旗杆**固定立在左侧留白**里（与旗面同侧，八席位置一致）。
        # 上一版按包围盒算左右，结果 铁拐（杖在左）的杆跑到画布最右、旗面还在最左 —— 旗成了两半。
        # 这类「信号」必须每次出现在同一个位置，读法才稳定。
        c.vline(10, 5, 16, "t")         # 旗杆 y=5..20（贴着身体左侧，不再悬在画面边上）
        c.hline(9, 4, 3, "g")           # 杆顶金尖
        c.put(10, 21, "t")              # 杆底入地
    elif state == "work":
        if kind == "fan":                  # 扇风：三道风纹横向扫出去，越远越细
            c.hline(x, by0 + 1, 7, "m")
            c.hline(x + 2 * step, by0 + 4, 9, "m") if right else c.hline(x - 2, by0 + 4, 9, "m")
            c.hline(x, by0 + 7, 5, "m")
        elif kind == "sword":              # 剑气：从刃尖斜着划出去 + 一点寒光
            c.put(x, by0, "w")
            c.put(x + step, by0 + 1, "m")
            c.put(x + 2 * step, by0 + 2, "m")
            c.put(x + 3 * step, by0 + 3, "m")
            c.put(x, by0 + 3, "w")
        elif kind == "staff":              # 药气：葫芦边的星芒与上升的雾气
            c.put(x, by0, "w")
            c.put(x + step, by0 + 2, "g")
            c.put(x, by0 + 2, "w")
            c.put(x + 2 * step, by0 + 4, "g")
            c.put(x + 2 * step, by0 + 7, "w")
            c.put(x + 3 * step, by0 + 10, "w")
        elif kind == "drum":               # 鼓点：三圈声波
            c.hline(x, mid - 2, 4, "m")
            c.hline(x + step, mid, 5, "m")
            c.hline(x, mid + 2, 3, "m")
        elif kind == "lotus":              # 花开：花瓣往留白那侧飘
            c.put(x, by0, "q")
            c.put(x + 3 * step, by0 + 3, "q")
            c.put(x + step, by0 + 6, "P")
            c.put(x + 4 * step, by0 + 5, "e")
        elif kind == "basket":             # 采得：篮口的花往外飘
            c.put(x, by0 + 3, "q")
            c.put(x + 3 * step, by0, "q")
            c.put(x + step, by0 + 6, "P")
            c.put(x + 4 * step, by0 + 3, "e")
        elif kind == "flute":              # 箫声：两个音符顺着手臂方向出去
            c.hline(x, mid - 3, 2, "w")
            c.put(x + step, mid - 5, "w")
            c.put(x + step, mid - 4, "w")
            c.hline(x + 3 * step, mid + 3, 2, "w")
            c.put(x + 4 * step, mid + 1, "w")
            c.put(x + 4 * step, mid + 2, "w")
        elif kind == "pai":                # 拍板击节：两短竖
            c.vline(x, mid - 2, 2, "m")
            c.vline(x + 2 * step, mid + 1, 2, "m")
    elif state == "done":
        # 归位：法宝边上一两点金光（贴着法宝，不是飘着）—— 读作「余晖」而不是「灰尘」
        c.put(x, by0 + 1, "g")
        c.put(x + step, by0 + 3, "w")
    return c.rows()


def layer_flag(p):
    """朱砂旗面单独一层：只有它要摆，旗杆在 fx 里不动 —— 所以能分开动。

    为什么用旗：八席里「需要你接手」必须一眼看到。卡片描边+呼吸已经有了，
    但那个是「容器」在闪；旗是**人举起来的**，读起来是「他在叫你」，语义更准。
    """
    c = Canvas()
    c.hline(11, 8, 4, "B")
    c.hline(11, 9, 5, "B")
    c.hline(11, 10, 4, "C")
    c.hline(11, 11, 5, "B")
    c.hline(11, 12, 4, "C")
    return c.rows()


# ---------------------------------------------------------------- 打包：RLE path
def _runs(rows):
    """把一层压成 {颜色码: [路径段]}；同一行连续同色合成一条 h 线段。

    为什么要压：4 个状态 × 8 席 = 四倍于原来的姿势数，一个像素一个 <rect>
    会把 client.js 从 290KB 推到 1MB 级别。按行游程合并后是同一张图、1/6 的体积。
    """
    by = {}
    for y in sorted(rows):
        line = rows[y]
        x = 0
        while x < CW:
            ch = line[x]
            if ch == ".":
                x += 1
                continue
            n = 1
            while x + n < CW and line[x + n] == ch:
                n += 1
            by.setdefault(ch, []).append(f"M{x} {y}h{n}v1h-{n}z")
            x += n
    return by


def layer_svg(rows, pal):
    by = _runs(rows)
    if not by:
        return ""
    return "".join(f'<path fill="{pal[ch]}" d="{"".join(by[ch])}"/>' for ch in by)


def palette_of(p):
    pal = dict(PALETTE)
    pal["p"] = p["color"]
    pal["P"] = shade(p["color"], 0.68)
    pal["q"] = shade(p["color"], 1.35)
    return pal


def symbols_of(p):
    """一个席位的全部 symbol：身体 1 + 法宝 4 + 动效 4 + 旗 1 = 10 个。"""
    pal = palette_of(p)
    out = [f'<symbol id="{p["id"]}-body" viewBox="0 0 {CW} {CH}">{layer_svg(layer_body(p), pal)}</symbol>']
    for st in STATES:
        out.append(f'<symbol id="{p["id"]}-p-{st}" viewBox="0 0 {CW} {CH}">{layer_svg(layer_prop(p, st), pal)}</symbol>')
        out.append(f'<symbol id="{p["id"]}-x-{st}" viewBox="0 0 {CW} {CH}">{layer_svg(layer_fx(p, st), pal)}</symbol>')
    out.append(f'<symbol id="{p["id"]}-f-ask" viewBox="0 0 {CW} {CH}">{layer_svg(layer_flag(p), pal)}</symbol>')
    return out



# ---------------------------------------------------------------- 八席编排（CHOREO）
# 为什么要写成数据而不是散在 CSS 里：这是**人设的一部分**（和 sprite、角色、主色同源），
# 加第九席时应该只改一处。构建期 choreo_css() 把它变成 CSS 注入客户端。
#
# 每个席位四条通道，全部按人不同 —— 这是「一看就看到多样性」的全部来源：
#   offset  基准站位：不在场中央，各人站各人的地方（整数精灵格）
#   body    身体步态：踱方步 / 快步 / 瘸步 / 慢摇 / 飘浮 / 蹦跳 / 轻摇带停顿 / 端立一顿
#   prop    法宝动作（作用在「法宝+出效」这一组上，所以出效会跟着法宝走）
#   fx      出效自身的漂移（叠在组的变换之上）
# 位移单位是**精灵格**（2× 下 1 格 = 2 CSS px），一律整数 —— 半格会让整只小人糊掉。
CHOREO = {
    # 钟离 · 总控 —— 踱方步：往左连走三步，再多跨一步跨回原点。
    # 注意这不是「左一下右一下」：单向走三步 + 一次跨回，方向反转只有 1 次。
    "hanzhongli": dict(
        offset=-8, period=3600, why="踱方步（三步一跨回）",
        body=[(0, 0), (-4, 1), (-8, 0), (-3, 1)],
        prop=[(0, 0), (-1, -2), (0, -1), (1, 0)],
        fx=[(1, 0, 0.45), (-3, 0, 1.0), (2, 0, 0.6)], fx_period=1800),
    # 洞宾 · 执行 —— 出剑前刺：向右突进两拍（停住），再收步
    "ludongbin": dict(
        offset=3, period=1500, why="出剑前刺（突进两拍）",
        body=[(0, 0), (4, -1), (6, -1), (1, 0)],
        # 剑的工作帧刃尖顶到身体第 0 行，纵向再抬就出画布 —— 所以「突刺」改成**横向**推出去，
        # 这本来也更像侧视图里的刺击。
        prop=[(1, 0), (4, 0), (4, -1), (0, 0)],
        fx=[(0, 0, 0.35), (0, 2, 1.0), (0, 1, 0.7)], fx_period=1500),   # 寒光沿刃**往下**走
    # 铁拐 · 值守 —— 瘸步巡行：全程只往一个方向挪，中间一顿。瘸的本质就是不对称。
    "tieguali": dict(
        offset=7, period=2800, why="瘸步巡行（单向挪步）",
        body=[(-1, 0), (-6, 1), (-4, 0), (-9, 0)],
        # 手杖一直画到身体第 23 行（画布最后一行），法宝只能平摆不能下沉
        prop=[(0, 0), (-1, 0), (0, -1), (1, 0)],
        fx=[(0, 0, 0.35), (0, -2, 0.8), (0, -4, 0.5), (0, -1, 0.9)], fx_period=2800),
    # 张果 · 审查 —— 倒骑慢摇：大幅摆到一侧**停一拍**，再小幅回正
    "zhangguolao": dict(
        offset=-4, period=4000, why="倒骑慢摇（大摆一停）",
        body=[(0, 0), (7, 0), (7, 1), (-2, 0)],
        prop=[(0, 0), (1, 1), (0, 0), (-1, 1)],
        fx=[(0, 0, 1.0), (3, 0, 0.7), (6, 0, 0.35)], fx_period=2000),
    # 仙姑 · 文档 —— 凌空飘浮：斜着飘起来再缓缓落下（纵向为主，横向单向）
    "hexiangu": dict(
        offset=-2, period=4400, why="凌空飘浮（斜向飘）",
        body=[(0, 0), (2, -2), (5, -2), (3, -1)],
        prop=[(0, 0), (-1, -1), (1, -1), (0, 0)],
        fx=[(0, 0, 0.4), (4, -1, 0.9), (7, -1, 0.5)], fx_period=2900),   # 花瓣横向飘（荷花在最上沿）
    # 采和 · 检索 —— 蹦跳采花：一路向右蹦，每跳落得更远；花落在身后（与去向相反）
    "lancaihe": dict(
        offset=5, period=1600, why="蹦跳采花（逐跳向右）",
        body=[(0, 0), (4, -2), (7, 0), (3, -1)],
        prop=[(0, 0), (0, -1), (0, 0), (-1, -1)],
        fx=[(0, 0, 0.4), (-2, -2, 1.0), (-4, -4, 0.5)], fx_period=1600),
    # 湘子 · 谋议 —— 倚箫轻摇：先倚住左侧**停两拍**，再小幅回正
    "hanxiangzi": dict(
        offset=-6, period=2400, why="倚箫轻摇（倚住一停）",
        body=[(-3, 0), (-3, 0), (2, 0), (-1, 0)],
        prop=[(0, 0), (0, -2), (0, -2), (0, 0)],
        fx=[(0, 0, 0.3), (2, -3, 0.9), (4, -5, 0.4)], fx_period=2700),
    # 国舅 · 决断 —— 端立击板：端立不动，只有合击那一拍向右跺一步
    "caoguoju": dict(
        offset=2, period=900, why="端立击板（一拍跺地）",
        body=[(0, 0), (5, 1), (5, 0), (0, 0)],
        prop=[(-3, 0), (3, 0), (-3, 0), (3, 0)],
        fx=[(0, 0, 0.3), (0, 0, 1.0)], fx_period=900),
}


def _flips(seq):
    """方向反转次数。对称的「左一下右一下」必然 ≥3；单向步进 ≤2。"""
    d = [b - a for a, b in zip(seq, seq[1:]) if b != a]
    return sum(1 for a, b in zip(d, d[1:]) if (a > 0) != (b > 0))


def _stops(n):
    """把 n 个关键帧均分成 n 段，每段「保持」到下一帧（配 steps(1,end) 使用）。"""
    out = []
    for i in range(n):
        lo = round(i * 100.0 / n)
        hi = round((i + 1) * 100.0 / n) - 1
        out.append(f"{lo}%,{hi}%")
    return out


def _kf(name, keys, ox=0):
    """一组关键帧。keys 里的 (x, y[, op]) 是精灵格；ox 是基准站位（只加在身体/法宝上）。"""
    stops = _stops(len(keys))
    parts = []
    for (k, stop) in zip(keys, stops):
        x, y = k[0] + ox, k[1]
        op = f";opacity:{k[2]}" if len(k) > 2 else ""
        parts.append(f"{stop}{{transform:translate({x}px,{y}px){op}}}")
    return f"@keyframes {name}{{{''.join(parts)}}}"


def choreo_css():
    """八席编排 → CSS。注入客户端模板的 /*__CHOREO__*/ 标记处。"""
    out = ["/* ── 八席编排（由 design/baxian.py 的 CHOREO 生成，勿手改）─────────────",
           "   四条通道：基准站位 / 身体步态 / 法宝动作 / 出效漂移，全部按人不同。 */"]
    for p in PERSONAS:
        c = CHOREO[p["id"]]
        pre = f"dsx-s-{p['id']}"
        out.append(f"/* {p['name']} · {p['role']} —— {c['why']}：站位 {c['offset']:+d} 格，"
                   f"身体 {c['period'] / 1000:.1f}s，出效 {c['fx_period'] / 1000:.1f}s */")
        # 站位在**所有状态**都生效（静止的偏移不是「跳」，但八席位置必须各不相同 ——
        # 一屏扫过去，谁常站左边、谁常站右边，本身就是可读的信息）。
        # 干活时下面带 offset 的 keyframes 会接管（动画优先级高于普通声明）。
        out.append(f".dsx-av.{pre} .dsx-bd,.dsx-av.{pre} .dsx-grp"
                   f"{{transform:translate({c['offset']}px,0px);}}")
        out.append(f".dsx-av.{pre}.is-work .dsx-bd{{animation:dsx-k-{p['id']}-bd {c['period']}ms steps(1,end) infinite;}}")
        out.append(f".dsx-av.{pre}.is-work .dsx-grp{{animation:dsx-k-{p['id']}-gp {c['period']}ms steps(1,end) infinite;}}")
        out.append(f".dsx-av.{pre}.is-work .dsx-fx{{animation:dsx-k-{p['id']}-fx {c['fx_period']}ms steps(1,end) infinite;}}")
        out.append(_kf(f"dsx-k-{p['id']}-bd", c["body"], c["offset"]))
        out.append(_kf(f"dsx-k-{p['id']}-gp", c["prop"], c["offset"]))
        out.append(_kf(f"dsx-k-{p['id']}-fx", c["fx"]))
    return "\n".join(out)


def build():
    out = ['<svg xmlns="http://www.w3.org/2000/svg" style="display:none" shape-rendering="crispEdges">']
    for p in PERSONAS:
        out.extend(symbols_of(p))
    out.append("</svg>")
    return "\n".join(out)


if __name__ == "__main__":
    out = Path(__file__).parent
    (out / "sprites.svg").write_text(build(), encoding="utf8")

    # 自检：每层都必须落在画布内，且身体那一层必须真的在中间（左右各留出边距）
    for p in PERSONAS:
        for st in STATES:
            for name, rows in (("body", layer_body(p)), ("prop", layer_prop(p, st)), ("fx", layer_fx(p, st))):
                # fx 允许为空（休息态故意不画东西），身体和法宝必须有东西
                if name != "fx":
                    assert rows, (p["id"], st, name, "空层")
                for y, line in rows.items():
                    assert len(line) == CW, (p["id"], st, name, y, len(line))
                    assert 0 <= y < CH, (p["id"], st, name, "行越界", y)
            cols = [x for line in layer_body(p).values() for x, ch in enumerate(line) if ch != "."]
            assert min(cols) >= OX - 2 and max(cols) <= OX + W + 2, (p["id"], min(cols), max(cols))

    # 自检 3：动作不许把小人/动效推出画布，也不许是「对称来回」----------------
    report = []
    bad = []
    for p in PERSONAS:
        c = CHOREO[p["id"]]
        box = [10 ** 9, -10 ** 9, 10 ** 9, -10 ** 9]   # lo, hi, ylo, yhi

        def grow(rows, dx, dy, box=box):
            for y, line in rows.items():
                for x, ch in enumerate(line):
                    if ch != ".":
                        box[0] = min(box[0], x + dx)
                        box[1] = max(box[1], x + dx)
                        box[2] = min(box[2], y + dy)
                        box[3] = max(box[3], y + dy)

        for st in STATES:
            bkeys = c["body"] if st == "work" else [(0, 0)]
            gkeys = c["prop"] if st == "work" else [(0, 0)]
            for kx, ky in bkeys:
                grow(layer_body(p), c["offset"] + kx, ky)
            for gx, gy in gkeys:
                grow(layer_prop(p, st), c["offset"] + gx, gy)
                # 出效在组内，还要再叠自己的漂移（最坏情况：组键 × 漂移键全组合）
                for fx, fy, _op in (c["fx"] if st == "work" else [(0, 0, 1)]):
                    grow(layer_fx(p, st), c["offset"] + gx + fx, gy + fy)
            if st == "ask":
                grow(layer_flag(p), c["offset"], 0)
        lo, hi, ylo, yhi = box
        # 横向容差 3 格：舞台外还有卡片 6px 内边距（2× 下 = 3 格），「剑气破格」落在
        # 内边距里是有劲而不是被切。纵向容差只给 1 格 —— 画布高度**等于身体高度**，
        # 没有余量可浪费（用户明确不要靠加高来容纳动作）。
        if lo < -3 or hi > CW + 1:
            bad.append(f"{p['name']} 横向 {lo}..{hi}/{CW}")
        if ylo < -1 or yhi > CH:
            bad.append(f"{p['name']} 纵向 {ylo}..{yhi}/{CH}")

        xs = [k[0] + c["offset"] for k in c["body"]]
        flips = _flips(xs)
        travel = max(xs) - min(xs)
        symmetric = xs == xs[::-1]
        assert travel >= 2, (p["id"], "身体位移太小，等于没动", xs)
        assert flips <= 2, (p["id"], "方向反复横跳，不是步进", xs, flips)
        report.append((p["name"], c["offset"], lo, hi, ylo, yhi, flips, travel, symmetric))

    assert not bad, ("动作把画面内容推出画布（横向容差 3 格 / 纵向 1 格）: " + "; ".join(bad))
    sym = [r[0] for r in report if r[8]]
    assert len(sym) <= 2, ("对称来回的席位太多（用户明确不要「都对称来回」）: " + ", ".join(sym))
    for (nm, off, lo, hi, ylo, yhi, flips, travel, symmetric) in report:
        print(f"  {nm} 站位{off:+d} 横{lo:>3}..{hi:<3}/56 纵{ylo:>2}..{yhi:<2}/{CH} "
              f"位移{travel}格 反转{flips}次 {'（单次跺地=对称）' if symmetric else '单向步进'}")

    sheet = build()
    rects = sheet.count("<rect")
    paths = sheet.count("<path")
    runs = sheet.count("h1v1h-")
    print(f"wrote sprites.svg  {len(sheet):,} bytes | {len(PERSONAS)} personas × "
          f"{len(STATES)} states | symbols={sheet.count('<symbol')} | paths={paths} | runs={runs} | rects={rects}")
