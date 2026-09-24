# evals.md —— 定员八席（`dsh-agent-grid`）conformance eval suite

> 生成日期：2026-09-23 ｜ 对应代码：`b606cca`（fix: clear 与换目录后不再跳到别的席位）
> 本 suite 的**主体是「对话 ↔ 席位绑定与切换」**，因为它是这个插件唯一的**有状态契约**，
> 也是当前唯一报告了线上症状的域。

---

## 0. 声明（先读这段）

### 0.1 conformance-only

**本文件只验「实现符不符合 spec」。它系统性看不见 spec 没写、只有真实使用才暴露的失败** ——
平台事件时序竞态、HMR 重挂那一瞬、多窗口、本地化文案撑爆容器、真实按键节奏。
**这套 suite 全绿 ≠ 质量好。** 细则见 §8 盲区。

eval set 是活的：把真实使用中发现的失败回灌成新的 `BV` / `AD` / `NC` case。

### 0.2 输入源（本项目的等价物）

| 标准输入源 | 本项目对应物 | 状态 |
| --- | --- | --- |
| PRD | `README.zh.md`（七种状态表 / 优先级 / 逃生开关 / 侵入性声明）＋ `README.md`（英文对照） | ✅ |
| Tech Design | `src/client.template.js` 内联决策注释（"实测踩过"那批）＋ `design/ux-design.md` §8 落地约束、§8b 三个静默 bug | ✅ 形态是**决策注释**，不是独立 `tech-design.md` |
| Figma | **不存在本项目的 Figma 文件** | ❌ **无 `fileKey` / `nodeId`** |

> ⚠️ **Figma gate：fail-loud。** 本项目没有 Figma 输入源，因此 §6 视觉类 eval
> **全部标 ⚠️ 待验证，一律禁止标 PASS**，判定固定 `manual-device`。
> 它们锚的是 `design/ux-design.md` 的几何约束与现存基线截图
> （`design/grid-4state-live.png`、`design/sidebar-top-nobutton.png`、`docs/seats.png`），
> **不是 token 验证过的事实**。等真接了 Figma 再把这些 case 升级成绑 token 名的断言。

### 0.3 ID 前缀（本文件真实使用的，共 6 种 —— 已按实际全量枚举，不照抄模板）

| 前缀 | 含义 | 条数 | 判定 |
| --- | --- | --- | --- |
| `HP` | happy path | 12 | 混合 |
| `BV` | 边界值 | 4 | 混合 |
| `NC` | 负向控制（should-NOT） | 5 | 混合 |
| `AD` | 对抗 | 5 | 混合 |
| `RT` | 回归护栏 | 11 | 混合 |
| `VIS` | 视觉保真（**⚠️ 全部待验证**，因无 Figma 输入源） | 5 | 全 `manual-device` |
| | **合计** | **42** | |

`BV + AD = 9 / 42 = 21%` —— 低于三成警戒线。（该指标只在用标准前缀时可比，本文件成立。
统计命令（**只扫 `#### ` 标题行**）：
`grep -E '^#### ' evals.md | grep -oE '\b(HP|BV|NC|AD|RT|VIS)-[A-Z-]*[0-9]{2}\b' | sort -u | cut -d- -f1 | sort | uniq -c`

两处实测踩过的坑，都写在这里免得下次重踩：
1. 字符类里必须含 `-`（写成 `[A-Z]*` 会静默漏掉全部带域名的 ID，只剩 `VIS-01` 这种无域名形式）。
2. **必须限定在标题行**。正文讨论里也会提到 ID（例如"已删除 `NC-BIND-02`"），全文件扫描会把它算成一个 case —— 实测 43 vs 标题 42。

### 0.4 判定方式

| 判定 | 含义 | 落点 |
| --- | --- | --- |
| `code` | 可自动化 | `tests/*.mjs`（见 §7 映射） |
| `manual-device` | 必须真 GUI 点 | 浏览器里的真实插件 |
| `manual-review` | grep / 静态审查 | 源码 |

### 0.5 Gating

- **必过** —— 确定性契约 + P0，blocking。
- **监控** —— 质量趋势，non-blocking。
- **sign-off** —— 视觉 / 高风险，人工放行。

---

## 1. 已知失败（用户报告，2026-09-23）

**症状（用户口述）**：

> 这条对话从八仙开始，然后又不见了；只能切回原始侧边栏才能看到。

> **转写成 case**：`NC-BIND-01`（八仙发起的动作产出却无主）+ `NC-SESS-02`（认领失败静默）+ `RT-BIND-06`（切走不丢待命席位）。
>
> **状态（2026-09-23）**：真根因（**H3** —— `reconcile` 的空白槽清理条件过宽）已在真机复现并修复（§1.4，附验证）；
> 同时修掉了独立缺陷 H4 / H5。回归护栏见 §7。
> **A1 / A2 不动** —— 复核后确认它们是**设计选择而非缺陷**（§1.3），并据此收紧了本 suite 自己的 C3。

### 1.1 根因收敛（已查 DSH 平台类型声明，2026-09-23）

上一版这里列了三个待验假设。已去 DSH checkout（`0.1.5-rc.2`）核对平台契约，结论如下 ——
**引用一律按符号锚定，不写行号**：

| # | 原假设 | 判定 | 依据（平台声明原文） |
| --- | --- | --- | --- |
| H1 | 平台给出的会话 `blank !== true` → 认领恒失败 | **❌ 否定** | `UiWorkspace.startSession` 契约："Start a New Session in a Workspace: **reuse-or-create its blank session** and open it"；`SessionManager.create`："A created session is blank by definition"；`SessionSummary.blank` 注释："New Session reuses a blank one targeting the same workspace" |
| H2 | 兜底认领（规则 3）在"原席仍绑旧会话"时恒不接管 | **✅ 成立（设计缺陷，代码事实）** | `claimPendingSeat` 规则 3 的 `readStore().bind[lastSeatId] !== undefined` early return —— 而**换目录时原席必然仍绑着旧会话**，所以这条兜底在换目录场景**永不生效** |
| H3 | 认领成功后又被 `reconcile` 解绑 | **✅ 成立 —— 真机确证的真根因** | 我上一轮用 `tree` 声明否定了它，**那是我读错了**：原话是 "only the **selected** blank Session remains visible" —— 被选中的 blank **是可见的**，所以"能在默认侧栏看到"根本推不出"非 blank"。真机复现见 §1.4 |
| H4 | 认领的目录匹配用了未 canonical 的路径 | **⚠️ 缺陷真实，但不是本症状的根因** | 见 §1.2。真机核对：用户的工作目录 `realpath` 与原始路径**逐字一致**（无 symlink）⇒ H4 不触发。它是独立缺陷（换到 symlink 目录才会坏），已一并修掉 |
| H5 | `summary.cwd` 尚未投影 | **⚠️ 同上：真实边界，非本症状根因** | 见 §1.2 |

### 1.2 H4 / H5：canonical 路径不匹配（独立缺陷，已修 —— 但**不是**本症状的根因）

三份平台声明拼起来是一条完整的证据链：

| 符号 | 声明原文 | 含义 |
| --- | --- | --- |
| `WorkspaceView.path` | "**Canonical** host directory path." | workspace 的路径是规范化的 |
| `dsh-workspace` 的路径规范化（`paths` / `WorkspaceRegistry`） | "workspace paths are **stored canonicalized**"；"path is canonicalized through **`fs.realpath`**" | 规范化 = 解析 symlink |
| `dsh-workspace` 的 `entity`（header 索引） | "Read a session's **canonical** directory from the registry's header index"；"Publish a successfully validated **canonical cwd**" | `SessionSummary.cwd` **也是** canonical |
| `UiWorkspace.pickDirectory` | "@returns the selected directory, or `null` when cancelled" | **只保证"选中的目录"，没有任何 canonical 保证** |

**而插件侧**：

- `switchSeatDirectory` 拿到 `pickDirectory()` 的**原始返回值**，把**它**传给 `beginClaim` / `claimSeatNow` 作为 `pendingSeat.cwd` ——
  **而 canonical 路径明明就在手边**：代码上一行刚 `await w.workspaces.create({ path })` 拿到了 `WorkspaceView`，它的 `.path` 就是 canonical，**却没用**。
- `createSeatSession` 走的另一条路（`seatWorkspace()` → `workspace.path`）用的是 **canonical** —— 所以**点空席新建是好的**，只有换目录会坏。

于是 `claimPendingSeat` 里那句严格比较，

```
if (pendingSeat.cwd !== null && summary.cwd !== pendingSeat.cwd) return;
```

在"用户选的目录路径 ≠ 它的 realpath"时**恒不成立** → 认领永远 return → `CLAIM_TTL_MS` 到点后 claim 被丢弃 → **新会话无主**。

**这条假设精确解释症状三要素**：① 用户点的是八仙卡片上的「驻」行（换目录入口，正是最近提交 `b606cca` 动的功能）② 换完目录看板上没有任何格子对应新会话 ③ 会话非 blank，所以默认侧栏正常显示它。

**触发条件是可判定的**：路径里含符号链接、或用户在 macOS 上选了 `/tmp` `/var` `/Volumes/...` 这类会被 `realpath` 改写的目录。若用户的目录本来就 canonical，则 H4 不触发 —— 此时剩下 **H5**：`SessionSummary.cwd` 是**可选**字段（`cwd?: string`），认领那一刻 host 可能尚未投影它，`undefined !== pendingSeat.cwd` 同样恒失败。

> **一条命令即可区分**：在真机控制台里比对 `pendingSeat.cwd` 与 `summary.cwd`（或直接看用户选的工作目录是不是 symlink）。
> **但 H2 + 下面的 A1/A2 是无条件的** —— 不管 H4/H5 成不成立，它们都该修。

### 1.3 A1 / A2 **不是缺陷** —— 是设计选择（2026-09-23 复核）

> 我最初把下面两条列为"未修的隐患"，**那是错的**。它们是刻意的设计，各有明确理由，**不需要改**：

| # | 事实 | 为什么这是**对的** |
| --- | --- | --- |
| A1 | 兜底认领只在「目标席真的空着」时接管（`bind[lastSeatId] !== undefined` 就 return） | `claimPendingSeat` 注释里有实测理由：放宽它会让「用户从平台侧选一次工作目录」**顶掉某个无关席位已有的绑定**（实测：钟离）—— 焦点莫名跳过去，比"留一个无主会话"更糟 |
| A2 | 八仙看板只渲染 bindings，没有"未归属会话"区域 | 八席是**固定 8 席的席位看板**，**不是会话列表**（README：槽位身份常驻、会话是可抛弃的负载）。会话可以多于 8 个；**从默认侧栏打开或创建的会话，本来就不该有席位**。给它们在看板上加区域，等于把看板做成第二个会话列表 |

**它们只是让 H3 的症状显得更严重**（一次解绑看起来像永久消失），**既不是症状的原因，也不需要修**。

> ⚠️ **这条复核同时纠正了本 suite 自身的错误。** 原先的 C3 / `NC-BIND-01` / `NC-BIND-02` 把
> "**任何时刻**当前会话都必须由某一席持有"当成契约 —— 那是我从决策注释里**过度反推**出来的，
> 会把上表 A2 的**合法状态**判成 FAIL。已按 §2.1 的 C3（收紧）与 §2.2 修正：`NC-BIND-02` 直接删除。

### 1.4 真机复现与修复（2026-09-23，已在真实 GUI 上验证）

> 这一节推翻了 §1.1 的 H3 判定，也说明 ①（H4/H5）**没有**打中本症状。
> 方法：在 `127.0.0.1:3080` 的真实 GUI 上做最小复现 —— 三步、两次读绑定表，全程不依赖任何推断。

| 步骤 | 绑定表 / 看板 |
| --- | --- |
| 基线 | 6 席绑定；`dsh.sessions.current` = `session-f8edbd2c…`，**不在任何绑定里**；看板 `activeIndex = -1`（无一席选中）；对话头无席位徽章 |
| ① 点湘子空席 | `hanxiangzi = session-f8edbd2c`；卡片「虚席」→「**待命**」 |
| ② 点钟离（**切走**） | **`hanxiangzi` 从绑定表消失**；卡片回到「**虚席**」 |

第 ① 步顺带证实了平台契约：`startSession` **复用了**该工作区里已有的 blank 会话（没有新建）—— 与 `UiWorkspace.startSession` 声明的 "reuse-or-create its blank session" 一致，**再次否定 H1**。

**无主会话的身份**（从 host 侧核实，不是推断）：

- 日志 `session.v3.jsonl.zstd` 解压后 **593 字节 / 5 个事件 / 0 个 turn**（`session` + 三条 seed + `session/end-seed`）
- ⇒ `SessionListMetadata.blank` = "folded prefix **contains no turn**" ⇒ `blank = true` ✅
- 它与钟离席绑定的 `session-5261f768`（日志 **18.7 MB**）**同属一个 workspace**（`ETA_Route_Quality`）
- 用户的工作目录 `realpath` 与原始路径**逐字一致** ⇒ H4 在本例中不触发（这也是我上一轮判错根因的直接原因）

**根因**：`reconcile` 里「空白槽全局只留 current 那一个」原本是 `current` 一变就清理。于是**用户只要点去看别的正常对话，待命席位的绑定就被删掉**。而 `seeded` 之后不自动补位（C5），`claimPendingSeat` 的兜底又要求"目标席真的空着"（A1，原席此刻绑着别的会话）⇒ **不可自愈**。看板只渲染 bindings（A2）⇒ 它在仙班里彻底消失；它是 blank，在默认侧栏**只有作为 selected 才可见** ⇒ 只能切回原始侧边栏找回来。

**修复**：触发条件收紧到「**current 本身也是空白槽**」—— 那才是 `connectWorkspace` 弹跳的现场特征（收件人是那个新 blank）。

**验证**：同一实验重跑，第 ② 步 `hanxiangzi` **保留**、湘子仍是「待命」✅。

> **A1 / A2 不改**（见 §1.3）：它们是设计选择，不是缺陷。修复 H3 之后，
> "**从八仙发起的动作把对话弄丢**"这条路径已经堵住；而"从默认侧栏打开的会话不属于任何席位"本来就是合法的。

---

## 2. 席位绑定与切换（BIND）—— 本 suite 主体

### 2.1 契约摘要（从 spec 抽出，case 的 Source 都指向这里或 README）

| # | 契约 | Source |
| --- | --- | --- |
| C1 | 槽位身份常驻；**会话是可抛弃的负载** | `README.zh.md`「它解决什么」 |
| C2 | 一个顶层会话**最多**被一个席位持有 | `reconcile` 播种段的 `taken` 集合 |
| C3 | **从八仙发起的动作**（点空席新建 / `/clear` / 换目录）产出的会话，必须**出现在八仙里** —— 要么归某一席，要么给出可见的失败提示。**从默认侧栏打开或创建的会话无主是合法的**（八席不是会话列表，见 A2） | `claimPendingSeat` 规则 3 决策注释；2026-09-23 收紧 —— 原表述"任何时刻当前会话都必须有席位"过强，会把 A2 的合法状态判成 FAIL |
| C4 | 绑定只在三种时机变：点空席=新建 / 点已绑席=切换（**不改绑定**）/ clear 或换目录=**同一席**重开 | `SeatGrid` 卡片的 `onClick` 分支 + `README.zh.md` 七态表虚席行 |
| C5 | `seeded` 之后绑定归用户；**不自动补位** | `reconcile` 规则 3 注释、`design/ux-design.md` §8b bug 2 |
| C6 | 子会话**不得**占席位 | `isSeatEligible`、`design/ux-design.md` §7 踩坑表 |
| C7 | 空白槽**全局只留一个** —— 但只在 **current 本身也是空白槽**时才清理别的；用户切去看正常会话不牵连待命席位 | `reconcile` 第 2 条规则注释（2026-09-23 真机复现后收紧，见 §1.4） |

### 2.2 case

#### HP-BIND-01 · 点空席 = 在该席新建会话，且新会话立刻归属该席

- **Source**：C4、`README.zh.md` 七态表（虚席）、《`createSeatSession` 是八席模式下唯一新建入口》
- **前置**：仙班模式；钟离为虚席（灰、写着「此位虚席 · 点此就位」）
- **步骤**：① 点钟离卡片 ② 等 3s
- **Expected**
  - 钟离卡片**不再**是虚席；状态为 `待命` 或按事实的其它态
  - 主栏当前对话 == 这个新会话（不是别的席位的会话）
  - 对话头徽章显示 `钟离 · 总控/规划`
  - 原生「新建会话」按钮在仙班模式下不可见（切回默认侧栏才回来）
- **判定**：`manual-device` ｜ **Gating**：必过
- **可发性**：用户手势，无类型约束的一跳。

#### HP-BIND-02 · 点已绑席位 = 切到该席会话，**绑定表不变**

- **Source**：C4、`design/ux-design.md` §5「点侧栏席位 → `sessions.open`」、`openSeatSession`
- **步骤**：① 记下 A 席与 B 席各自的会话 ② 点 A ③ 点 B ④ 再点 A
- **Expected**：每次主栏切到对应会话；第 ④ 步回到的是**原来的** A 席会话（不是被重新分配的）；两席状态文字不互换
- **判定**：`manual-device` ｜ **Gating**：必过

#### HP-BIND-03 · 换工作目录后，新空白会话**回到同一席**

- **Source**：C3/C4、`switchSeatDirectory` 注释（"这一席在新目录重开会话"）、`seatWorkspace`
- **前置**：A 席绑会话 S1（目录 W1）
- **步骤**：① 点 A 席卡片上的「驻 W1」行 ② 选目录 W2
- **Expected**
  - 新会话出现在 **A 席**（席位不换人）
  - 新会话的 `cwd` == W2；卡片「驻」行变成 W2 的 basename
  - 旧会话 S1 仍可在**默认侧栏**找到，内容未动
- **判定**：`manual-device` ｜ **Gating**：必过
- **可发性**：`uiWorkspace.pickDirectory()` 是宿主原生对话框，返回任意路径字符串（无类型约束的一跳）。

#### ★ NC-BIND-01 · **从八仙发起的动作**产出的会话，必须出现在八仙里

- **Source**：**C3**（2026-09-23 收紧后）、§1.4 真机复现
- **前置**：仙班模式
- **步骤**：分别执行下面三个**从八仙发起的动作**，每次之后观察看板 —— ① 点空席新建 ② 在某席 `/clear` ③ 在某席换工作目录
- **Expected**（系统边界）
  - 动作产出的会话**归发起的那一席**：卡片不再是「虚席」，且该席为选中态
  - **或**：看板给出**显式的失败提示**（不是静默）
  - **绝不出现**：动作看起来成功了（主栏切到了新会话），但看板上没有任何席位对应它、**且**没有任何提示
- **判定**：`manual-device` ｜ **Gating**：必过
- **明确排除（出现也不算 FAIL）**：用户**从默认侧栏**打开或新建的会话不属于任何席位 —— 那是**合法状态**（§1.3 A2：八席不是会话列表）。本条**只在动作由八仙发起时**判定。
- **可发性**：`uiWorkspace.startSession()` / `connectWorkspace()` 在平台侧决定新会话的 `blank`，插件侧无类型保证。
- **备注**：本条是 §1.4 那个真机症状的直接靶子。修复前它在第 ③ 步之后 FAIL（绑定被 `reconcile` 清掉）。

#### BV-BIND-01 · 同时处于「待命」（持空白会话）的席位 **≤ 1**

- **Source**：C7
- **Expected**：8 席中 `blank === true` 的持有者最多一个；多出的空白槽一律解绑
- **判定**：`code` ｜ **Gating**：必过 ｜ **落点**：`tests/reconcile.mjs`（已有覆盖，保持）
- **可发性**：`SessionSummary.blank` 是平台声明字段（`design/ux-design.md` §8 卡片数据一行）。

#### BV-BIND-02 · 一席只持有一个会话（换目录后旧会话必须让位）

- **Source**：C2/C4、`switchSeatDirectory` 注释「旧会话留在原工作区，不动」
- **步骤**：A 席（绑定 S1）换目录到 W2，得到 S2
- **Expected**
  - A 席只持有 S2；**不存在**"S1 与 S2 同时显示属于 A"的呈现
  - S1 仍在平台会话列表里（默认侧栏可见、可点开），且**不占任何席位**
- **判定**：`manual-device` ｜ **Gating**：必过
- **备注**：`reconcile` 与 `claimPendingSeat` 都不负责"一席一会话"的一致性 —— 这条目前**没有任何守卫**，是本 suite 里最可能 FAIL 的边界之一。

#### AD-BIND-01 · 一个工作区只有一个空白槽时，两席先后点空席

- **Source**：C7 注释里实测过的「国舅选目录 → 跳到洞宾」
- **步骤**：① 点钟离空席（拿到空白会话 S）② 立刻点洞宾空席
- **Expected**
  - 最终**只有一个**席位持有 S（不出现两个格子显示同一个会话）
  - 后点的那一席**总是有会话可用**：拿到 S，**或**按 AD-BIND-05 自己新建一个
  - 先点的那一席**回到虚席或另持新会话**，但**绝不**丢掉它正在用的会话
  - current 落在最后点的那一席，不出现"焦点跑到没点过的第三席"
- **2026-09-24 修订**：原文要求"后点的席**抢走** S、先点的席回虚席"。用户真机判定
  「从八席起的对话被挪走，**这个永远不应该发生**」后改为**不抢** —— 先点的那一席若已在用
  S（尤其是它正跑着第一个 turn，见 AD-BIND-05），后点的席自己新建。
- **判定**：`manual-device` ｜ **Gating**：必过
- **可发性**：平台的"一个工作区只有一个空白槽"是 `connectWorkspace()` 的实现约束（决策注释记录实测），插件无法保证第二席拿到新槽。

#### ★ AD-BIND-05 · 正在跑第一个 turn 的会话，不得被当成"空白槽"端走

- **Source**：2026-09-24 用户真机判定（「我是从**八席**开始这个任务，然后它**被挪走了**，这个永远不应该发生；从其它地方就没有开始新会话的 UI 口子」）
- **机制**：`blank` 的语义是「folded prefix 里没有 turn」（§1.2 确证），所以**一个刚开始跑第一个 turn、尚未折叠的会话仍然是 `blank === true`**。平台的 `connectWorkspace()` 于是把它当成"该工作区的空白槽"复用，`claimPendingSeat` 再把它从原席认领到新点的席 —— **用户眼前正在跑的任务换了个格子**。这与「待命席位可以有一个空白槽」在插件侧**无法用 `blank` 区分**：两者都是 `blank === true`。
- **步骤**：① 在 A 席点空席建会话 S ② 在 S 里发一条消息（turn 开始、尚未结束）③ 点另一席的空席 ④ 观察
- **Expected**
  - S **仍归 A 席**，不被端走；A 席卡片照旧显示它在跑
  - 后点的那一席要么拿到**它自己的**新会话，要么给出显式失败提示（NC-BIND-01）
  - **绝不**：A 席正在用的会话换了持有者
- **判定**：`manual-device` ｜ **Gating**：必过
- **实现**：`ownedBlankIn()`（发起新建前探「目标工作区里有没有**有主的**待命槽」）+ `createFreshSession()`（有主就自己造，绕开平台复用）+ 认领规则 1 的 `claimedByOther` 闸（防御）
- **代价与边界**：同一工作区会因此出现多个 blank 会话。`reconcile` 仍保证「**席位持有的** blank ≤ 1」（BV-BIND-01 不受影响）；无主的 blank 留在工作区里供下次复用，只要求**有主的**不被端走，所以不会无限堆积。
- **不可自动化**：`ownedBlankIn` 本身是纯函数（`tests/reconcile.mjs` 第 9 组已覆盖 5 个边界），但"平台到底会不会复用"只有真机判得出 ⇒ 本条停在 `manual-device`。

#### AD-BIND-02 · 同席接力：`/clear` 后 8s 防连点窗口内又选目录

- **Source**：`claimSeatNow` /「同席接力」决策注释（"不能因为防连点就把这次选择静默丢掉"）
- **步骤**：① A 席 `/clear` ② 8s 内在 A 席点「驻」换目录
- **Expected**：换目录**生效**（新会话的 `cwd` 是新目录，且归 A 席）；用户的选择不被静默丢弃
- **判定**：`manual-device` ｜ **Gating**：必过

#### AD-BIND-03 · 过期 claim 不得劫持无关的空白会话

- **Source**：`CLAIM_TTL_MS` 注释（"一个永不失效的 claim 会在几十秒后劫持一个毫不相干的空白会话"）
- **步骤**：① 在 A 席触发一次新建/clear ② 30s 后从默认侧栏选另一个工作区的空白会话 ③ 切回仙班
- **Expected**：该空白会话**不被** A 席接管；A 席仍持原会话或保持虚席
- **判定**：`manual-device` + `manual-review`（核对 TTL 与「工作目录必须匹配」两道闸都在） ｜ **Gating**：必过

#### ★ AD-BIND-04 · 换到**含符号链接**的工作目录后，新会话仍归该席

- **Source**：§1.2（`WorkspaceView.path` 的 canonical 契约 vs `pickDirectory` 无 canonical 承诺）、`switchSeatDirectory`
- **前置**：A 席已绑一个会话；系统上存在一个 symlink 目录（macOS 上可直接用 `/tmp`，或 `ln -s <真实目录> <链接目录>` 造一个）
- **步骤**：① 点 A 席卡片上的「驻 <目录>」 ② 在原生选择器里选**链接目录**（或 `/tmp`）③ 等 5s
- **Expected**
  - 新会话归 **A 席**；卡片「驻」行显示新目录
  - 看板上**不出现**"当前会话没有任何席位持有"的状态
- **判定**：`manual-device` ｜ **Gating**：必过
- **可发性**：`UiWorkspace.pickDirectory` 的契约只承诺 "the selected directory"，**明确不含 canonical 保证** —— 平台侧类型允许返回非 canonical 路径；而 `WorkspaceView.path` 承诺 canonical。两者不等是**契约允许的**。
- **备注**：这是 §1.2 的直接靶子。它 FAIL 就说明 H4 成立，修法是 `beginClaim(seatId, workspace.path)` 而不是 `path`。

#### RT-BIND-01 · 首次渲染（`phase === 'pending'`）不得清空任何绑定

- **Source**：`design/ux-design.md` §8b bug 1（数据丢失级）
- **Expected**：刷新页面后，8 席绑定与刷新前**逐席一致**（刷新一次 8 席全空 = FAIL）
- **判定**：`code` ｜ **Gating**：必过 ｜ **落点**：`tests/reconcile.mjs` 第 2 组（已有覆盖，保持）

#### RT-BIND-02 · `current` 为空（clear 后的「选择工作目录」空态）不得清空任何绑定

- **Source**：`reconcile` 第 2 条规则的 `current !== undefined` 闸、`tests/reconcile.mjs` 第 4 组
- **Expected**：`sessions.clear()` 之后，其余席位的绑定一个不少
- **判定**：`code` ｜ **Gating**：必过 ｜ **落点**：`tests/reconcile.mjs` 第 4 组（已有覆盖，保持）

#### RT-BIND-03 · 子会话不得占席位

- **Source**：C6、`design/ux-design.md` §7 踩坑表（v2 时 8 席里 6 席绑到 `delegationDepth=1`）
- **Expected**
  - `code`：播种与裁剪都排除 `origin === 'subagent'` 或带 `parentId` 的会话
  - `manual-device`：点开任一席位，看到的正文**不出现** "Result sent to the parent agent"
- **判定**：`code` + `manual-device` ｜ **Gating**：必过 ｜ **落点**：`tests/reconcile.mjs` 第 1、5 组（已有覆盖，保持）

#### RT-BIND-04 · `seeded` 之后「一个绑定都没有」= 用户清空过，不得自动补位

- **Source**：C5、`design/ux-design.md` §8b bug 2
- **Expected**：把某席绑定删掉后，该席**保持**虚席（不被下一次渲染自动抓一个会话补上）
- **判定**：`code` ｜ **Gating**：监控 ｜ **落点**：`tests/reconcile.mjs`（已覆盖 seeded 语义）
- **备注**：`clearSeatBinding` 目前**没有 UI 入口**（`design/ux-design.md` §9 待定），所以真机无法点；这条现在是**纯 code 护栏**。

#### RT-BIND-05 · 刷新页面后 8 席绑定逐席一致

- **Source**：`BIND_KEY` 持久化 + `readStore`/`writeStore`
- **Expected**：F5 之后每一席仍是刷新前那个会话（顺序、人不换）
- **判定**：`manual-device` ｜ **Gating**：必过

#### ★ RT-BIND-06 · 切走再切回：**待命席位的对话不丢**（真机踩过）

- **Source**：§1.4 真机复现 + C7（收紧后的契约）
- **前置**：某席处于「待命」（持一个 blank 会话）
- **步骤**：① 记下该席绑定的会话 ② 点另一个绑了**正常会话**的席位 ③ 再点回原来的席位
- **Expected**
  - 第 ② 步之后，那一席的绑定**仍在** —— 卡片还是「**待命**」，不是「虚席」
  - 第 ③ 步能回到原来那个会话
  - 全程看板上不出现"当前会话无任何席位对应"
- **判定**：`code`（`tests/reconcile.mjs` 第 3b 组）+ `manual-device` ｜ **Gating**：必过
- **备注**：本 suite 里**唯一一条由真机症状倒推出来的 case**。旧行为下第 ② 步就解绑，且因为 C5（不自动补位）+ A1 而**不可自愈**。

#### RT-BIND-07 · 插件重挂（HMR / 卸载重装）后绑定与订阅不失效

- **Source**：`design/ux-design.md` §8「客户端代码真 HMR」+ fiber dispose 收摊段
- **Expected**：改一次 `src/client.template.js` 触发 HMR 后，8 席绑定不变；控制台**不出现** `cannot get required service "sessions" in inactive context`
- **判定**：`manual-device` ｜ **Gating**：监控

---

## 3. 会话创建 / clear / 换目录（SESS）

#### HP-SESS-01 · `/clear` = 在同一席、同一工作目录开一个新对话

- **Source**：`design/ux-design.md` §7「`/clear` 语义」（保留人设、工作目录、槽位、标题）、`README.zh.md` 七态表
- **步骤**：A 席有会话（目录 W）时按 `Esc Esc`
- **Expected**
  - A 席持有一个**新**会话；席位身份 / 编号 / 主色不变
  - 新会话 `cwd` 仍是 W
  - 旧会话仍在默认侧栏（可点开、内容未动）
  - 卡片短暂显示 `已清空 · $0.31 / 142k`（`design/ux-design.md` §7 要求）
- **判定**：`manual-device` ｜ **Gating**：必过

#### NC-SESS-01 · `/clear` 不得把用户扔进「选择工作目录」空态

- **Source**：`createSeatSession` 决策注释（明确记录"正是 bug 报告里的第一步"）+「宁可不新建，也不把用户扔进那个空态」
- **Expected**：`/clear` 后主栏**始终**是一个会话；解析不出工作区时**不开新会话**，而不是退化成空态
- **判定**：`manual-device` ｜ **Gating**：必过
- **可发性**：`seatWorkspace()` 依赖 `workspaces.list` 快照，可能返回 `undefined`（列表未就绪）—— 这是**链路中间无类型约束的一跳**。

#### ★ NC-SESS-02 · 新建 / 换目录后若认领失败，**不得静默**

- **Source**：C3 + `HP-BIND-01` 的必然推论
- **Expected**
  - 新建/换目录后 **30s 内**，该会话必须被目标席持有**或**看板给出可见的失败提示
  - 看板**不得**出现"点了一下，什么都没发生，也没有任何提示"
- **判定**：`manual-device` ｜ **Gating**：必过
- **可发性**：见 `NC-BIND-01`（`blank` 由平台侧决定）。

#### BV-SESS-01 · 在目录选择器里取消 → 这一席保持原绑定

- **Source**：`switchSeatDirectory` 的 `pickDirectory()` 空字符串 early return
- **步骤**：A 席点「驻」→ 在原生对话框里取消
- **Expected**：A 席仍持有原会话；**不进入**"等待认领"态（不会在几秒后被别的会话顶掉）
- **判定**：`manual-device` ｜ **Gating**：必过
- **可发性**：`uiWorkspace.pickDirectory()` 声明可返回空串（取消）。

#### AD-SESS-01 · 目录被拒 / 无权限 / 已删除

- **Source**：`switchSeatDirectory` catch 分支（"别把这一席卡在等待认领"）
- **步骤**：选一个无权限的目录
- **Expected**：A 席不被卡死（不会永久显示"等待中"或点不动）；警告进控制台；原绑定或虚席态合理
- **判定**：`manual-device` ｜ **Gating**：监控
- **可发性**：`workspaces.create({ path })` 会对任意用户路径抛错（无类型约束的一跳）。

#### RT-SESS-01 · `clear` 信号重放（刷新页面）不得连开多个会话

- **Source**：`SeatGrid` 里"只认最近 20 秒"+"一轮里只处理最新的那一个"的决策注释
- **Expected**：刷新页面（历史里有多次 `/clear`）后**不新开**任何会话；也不出现"clear 了国舅、焦点跑到钟离"
- **判定**：`manual-device` ｜ **Gating**：必过

#### RT-SESS-02 · 同席防连点：双击空席只开一个会话

- **Source**：`creatingSeats` 集合（防手抖连点，"点两下就多出两个会话，与八席上限的设计相悖"）
- **Expected**：快速双击同一空席，只新增**一个**会话
- **判定**：`manual-device` ｜ **Gating**：监控

---

## 4. 状态判定（STATE）

#### HP-STATE-01 · `running` → 运功

- **Source**：`README.zh.md` 七态表「运功」行 + 优先级行
- **Expected**：状态文字 `运功`、状态点**绿**、小人处于 `work` 态（法宝出效）
- **判定**：`manual-device` ｜ **Gating**：必过

#### HP-STATE-02 · 绑定了空白会话 → `待命`，**不是** `虚席`

- **Source**：`stateOf` 注释（"三个席位被误画成灰的"）、`README.zh.md` 七态表
- **Expected**：卡片显示 `待命`，**不是** `虚席`，**不是**灰掉；小人收起
- **判定**：`manual-device` ｜ **Gating**：必过

#### HP-STATE-03 · 有一轮结束且未读、且不是当前席 → `待过目`

- **Source**：`README.zh.md`「为什么不叫已完成」+ 七态表
- **Expected**：状态点**金** `#C9A227`、文字 `待过目`、小人归位 + 金光余晖
- **判定**：`manual-device` ｜ **Gating**：必过

#### HP-STATE-04 · 需要你接手 → 待答 / 待裁（盖过一切）

- **Source**：`README.zh.md` 优先级行、`SeatGrid` 的 `needsYou` 分支、`lib/index.js` 的 `seat-activity` 投影
- **前置**：分别造出两种"卡住等你"的现场 —— ① 某席抛了一个问题等你回话 ② 某席有一张未审的审批卡
- **Expected**
  - 场景 ① 的席位：状态文字 `待答`、小人举旗、卡片过程行显示「待你回话」
  - 场景 ② 的席位：状态文字 `待裁`、小人举旗、卡片过程行显示「待你定夺」
  - 两者状态点均为**朱砂** `#B5453C`
  - 顶栏右侧从计数圆标切换为 `N 位待你`，N == 处于这两种状态的席位数
- **判定**：`manual-device` ｜ **Gating**：必过

#### NC-STATE-01 · **有绑定**的席位不得显示「虚席」，也不得灰掉

- **Source**：`stateOf`（`empty` 只留给 `!summary`）、`README.zh.md`「休息 ≠ 虚席」
- **Expected**：8 席里只要绑了会话，就没有任何一格是虚席样式或灰的；`虚席` 只出现在无绑定的格子
- **判定**：`manual-device` ｜ **Gating**：必过
- **备注**：这条是 `HP-STATE-02` 的负向对照，**分开报**——它是历史上真实踩过的坑。

#### BV-STATE-01 · `running` 与 `attention` 同真 → 显示待答 / 待裁

- **Source**：`README.zh.md` 优先级（"`待答 / 待裁` 盖过一切（除虚席）"）
- **Expected**：文字是 `待答`/`待裁`，不是 `运功`
- **判定**：`manual-device` ｜ **Gating**：必过
- **可发性**：`running` 与投影 `attention` 是**两个独立来源**（`SessionSummary` vs host 投影），可同时为真。

#### RT-STATE-01 · 「待过目」**不判成败**

- **Source**：`README.zh.md`「为什么不叫已完成」（跑挂、被中断同样点亮）
- **Expected**：一轮以失败/中断结束时，卡片照样点亮**金色**待过目；文案里**不出现**"完成/成功"字样
- **判定**：`manual-device` + `manual-review`（grep 文案） ｜ **Gating**：必过

#### RT-STATE-02 · 你正看着的那一席跑完**不**点亮待过目

- **Source**：`README.zh.md`（"你正看着的那一席跑完不会点亮提醒"）
- **Expected**：当前选中的席位跑完 → 无金点；切走后该席位才需要能反映未读
- **判定**：`manual-device` ｜ **Gating**：监控

---

## 5. 侧栏逃生开关与席位徽章（SIDE）

#### HP-SIDE-01 · 设置 → 通用 → 侧边栏 → 默认：原生会话浏览**回到渲染位**

- **Source**：`README.zh.md`「逃生开关」、`design/ux-design.md` §8 落地约束（关 = `dispose()` 掉 `priority: -1` 的注册）
- **Expected**：原生 `WorkspaceBrowser` 立刻回来；**不重启、不改 patch 文件**；刷新页面后仍是默认
- **判定**：`manual-device` ｜ **Gating**：必过
- **备注**：这条是用户症状的**逃生路径**本身 —— 它必须永远可用，因此列为必过。

#### HP-SIDE-02 · 切回默认侧栏后，对话头的席位徽章**仍在**

- **Source**：`design/ux-design.md` §7「范围」："这个开关只管侧边栏。对话头里的席位徽章不受它控制（实测确认）"
- **Expected**：默认侧栏 + 徽章同时存在
- **判定**：`manual-device` ｜ **Gating**：必过

#### ★ HP-SIDE-03 · 徽章只对「属于某席」的会话渲染

- **Source**：`design/ux-design.md` §5「只读绑定表反查：不属于任何席位的会话不渲染徽章，原装对话头保持原样」、`seatForSession`
- **Expected**
  - 属于某席的会话 → 对话头出现 `席位名 · 职责`
  - **无主**会话 → 不渲染徽章，原装对话头
- **判定**：`manual-device` ｜ **Gating**：必过
- **备注**：**这是正确行为，不是缺陷** —— 无主的会话本来就不该有席位徽章（§1.3 A2）。真机复核时的现场正是"对话头无徽章 + 看板 `activeIndex = -1`"，两者一致 ⇒ 反查逻辑工作正常。

#### HP-SIDE-04 · 无 `settings` 服务时降级为本地开关

- **Source**：`README.zh.md` 逃生开关段（"降级为本地开关，行内提示改为「当前无法持久化，重启后复原」"）、`localChoice` / `sidebarScope`
- **Expected**：切换仍**立即**生效；行内提示文案变为「（当前无法持久化，重启后复原）」；重启后复原为默认
- **判定**：`manual-device` ｜ **Gating**：监控
- **可发性**：`settingsScope` 注入可能拿不到（决策注释："部署里没有 settings 服务时"）。

#### NC-SIDE-01 · 切回默认**不需要**刷新页面

- **Source**：`chooseSidebarMode`（先本地生效，再尽力持久化）、`applySidebarMode`
- **Expected**：点「默认」的**同一帧**内原生浏览器可见；不得要求用户 F5
- **判定**：`manual-device` ｜ **Gating**：必过

---

## 6. 视觉保真（VIS）—— ⚠️ 全部待验证

> **Figma gate 未通过：本项目没有 Figma 输入源。** 以下 case 一律 `manual-device`，
> 状态标 ⚠️ 待验证，**禁止标 PASS**。基线图：`design/grid-4state-live.png`、
> `design/sidebar-top-nobutton.png`、`docs/seats.png`、`design/sprite-preview.html`。

#### VIS-01 ⚠️ · 卡片**必须始终显示姓名**

- **Source**：`design/ux-design.md` §6 盲辨识验收的硬性推论（"卡片必须始终显示姓名，姓名不可省略、不可 hover 才出"；依据：剪影只在 6/8 席位上足以区分身份）
- **Expected**：264px 与更宽两种侧栏宽度下，8 张卡片**都**可见姓名；姓名不可只在 tooltip 里
- **判定**：`manual-device` ｜ **Gating**：sign-off

#### VIS-02 ⚠️ · 264px 侧栏下八席**一屏放得下、无滚动条**

- **Source**：`README.zh.md` 卡片高度硬约束段（"实测单卡 164px、4 行卡 + 间隙 = 697px，可用高约 750px"）
- **Expected**：窄窗口下**收起**「↳」等次要行，而不是出现纵向滚动条
- **判定**：`manual-device` ｜ **Gating**：sign-off

#### VIS-03 ⚠️ · 像素头像只用 24 / 48 / 96

- **Source**：`design/ux-design.md` §8（"像素头像在非整数倍尺寸下必然糊。24 网格只能用 24 / 48 / 96"；折叠轨道曾写 20px）
- **Expected**：实测渲染尺寸是 24/48/96 之一；折叠轨道里的 chip 不是 20px
- **判定**：`manual-device`（DevTools 量）+ `manual-review` ｜ **Gating**：sign-off

#### VIS-04 ⚠️ · 八席 sprite **逐席齐备 10 层**，无静默空白格

- **Source**：`design/ux-design.md` §8b bug 3（id 打错 → 格子空白且不报错）、`build_client.py` 构建期断言
- **Expected**：`python3 build_client.py` exit 0；8 格都有头像（无空白格）；「运功」态的法宝动效**有内容**（不是空白帧）
- **判定**：`code`（构建期断言，已实现）+ `manual-device` ｜ **Gating**：必过

#### VIS-05 ⚠️ · 八席主色与 `SEATS` 表一致

- **Source**：`src/client.template.js` 的 `SEATS`（8 个 hex）、`design/ux-design.md` §6（张果/采和靠主色兜底区分 → 主色是**功能**不是装饰）
- **Expected**：8 席卡片强调色与 `SEATS` 表逐字相同（尤其 `#3F7A55` 松绿 vs `#3F4F9C` 靛蓝必须可分辨）
- **判定**：`manual-device` ｜ **Gating**：sign-off

---

## 7. 落点映射（eval → 执行）

| eval | 判定 | 落点 | 现状 |
| --- | --- | --- | --- |
| `BV-BIND-01`、`RT-BIND-01`、`RT-BIND-02`、`RT-BIND-03`（code 半）、`RT-BIND-04`、**`RT-BIND-06`** | `code` | `tests/reconcile.mjs` 第 1–5 组（`RT-BIND-06` = 第 3 组 3b，2026-09-23 随真根因修复改写） | ✅ 已存在，`node tests/reconcile.mjs` 通过 |
| `AD-BIND-04`、`NC-SESS-02`（判据半） | `code` | `tests/reconcile.mjs` 第 6–8 组（`claimTarget` / `inClaimWorkspace`） | ✅ 2026-09-23 随 H4 / H5 修复新增（mutation 验过：短路判据或缺省 cwd 处理都会 FAIL） |
| `VIS-04`（构建断言半） | `code` | `build_client.py` 的逐层校验 | ✅ 已存在 |
| `BV-BIND-02` | `code` | **缺**：需要一条"一席只持有一个会话"的断言（换目录后旧会话必须让位） | ❌ 待建 |
| `NC-SESS-02`（时序半）、`BV-SESS-01`、`AD-SESS-01` | 混杂 | **缺**：claim 时序需要可注入的假平台（`startSession` / `connectWorkspace` 返回不同 `blank`） | ❌ 待建 |
| 其余 `manual-device` | 手测 | 浏览器 + npm link 的 `dsh plugin` | — |

现状：`tests/reconcile.mjs` **22 项**（原 11 + H4/H5 新增 10 + 真根因改写 1），全通过。

**注意**：`package.json` **没有 `scripts` 字段**，也没有 `.github/`。也就是说**当前没有任何自动执行入口** ——
`tests/reconcile.mjs` 只能手跑。要让 `code` 类真的成为 blocking gate，得先补：

```json
"scripts": { "test": "node tests/reconcile.mjs" }
```

外加 CI（否则 §0.5 的"必过"只是纸面）。

---

## 8. 盲区（conformance 覆盖不到的）

**这些不是"以后再补"，是本 suite 结构上测不到的：**

1. **平台事件时序竞态**。`startSession` 之后"当前会话本来就是那个空白槽 → `open()` 不产生变更事件"这一类中间态，只有真实平台会走。`claimPendingSeat` 里那个 300ms 的主动复查与 8s/30s 两个窗口，值的**正确性靠的是实测**，不是任何 spec。
2. **HMR 重挂那一瞬**。"重挂瞬间 8 个 `main` 注册消失，`retainMainPanels` 会把选中面板清回对话态"（`design/ux-design.md` §8）—— 用户能感知，但无法用断言稳定复现。
3. **多窗口 / 多标签**。两个窗口共享 `localStorage`（`BIND_KEY`）但各有自己的 `current` —— `reconcile` 的"空白槽只留 current 那一个"在跨窗口语义下**没有定义**。这是个 spec 空洞，不是实现 bug。
4. ~~**`blank` 的真实语义**~~ —— **已查清（2026-09-23）**：`SessionListMetadata.blank` = "Whether the folded prefix **contains no turn**"；`startSession` / `SessionManager.create` 的契约保证 reuse-or-create 的必是 blank 会话。原假设 H1 因此被否定。
   **取而代之的新未知**：`SessionSummary.cwd` 是**可选**字段（`cwd?: string`）。会话刚创建、host 尚未投影 cwd 的那一刻，`claimPendingSeat` 的严格比较必然不成立。它会不会在下次列表变更时自愈，本 suite 测不到，只能真机看。
5. **真实按键节奏**。`Esc Esc` 的间隔、目录对话框打开时的焦点转移。
6. **本地化 / 窄容器**。中文之外的语言、极窄侧栏下「驻 <目录>」基名的截断。
7. ~~无主会话的"看不见"~~ —— **2026-09-23 真机复核后，它既不是盲区、也不再是要求**：真机上观察到"看板 `activeIndex = -1` + 对话头无徽章 + 会话不在任何绑定里"三者一致，**这正是设计行为**（八席不是会话列表，§1.3 A2）。
   留在这里只作为一条**观察记录**：本 suite **无法自动区分「合法的无主」与「八仙动作失败导致的无主」** —— 这个区分要看动作是不是由八仙发起的，只有真机判得出。所以 `NC-BIND-01` 永远是 `manual-device`，升不成 `code`。这是本件里唯一一处**结构性**的自动化上限。
8. **「清空一席」会被兜底认领自动撤销**（2026-09-23 真机发现）。`seeded`（C5）只挡住了"播种式补位"，**挡不住** `claimPendingSeat` 规则 3：只要**当前会话是一个无主的 blank**、且 `lastSeatId` 指向一个空席，它就会把那个 blank 认领过去。
   实测：删掉某席的 blank 绑定后 **6 秒内被写回**（在页面里 hook `localStorage.setItem`，调用栈确证是 `claimPendingSeat → setSeatBinding → writeStore`）；把 `current` 挪到一个**非 blank** 会话后，同样的删除就**保持住了**（6 秒无写回）。
   这不一定是缺陷 —— A1 的设计本来就是"把无主 blank 归给上次所在的席"。但**"清空一席"一旦有 UI 入口**（`design/ux-design.md` §9 待定），就会正面撞上它：用户点清空时如果**还站在那个 blank 上**，操作会被立刻撤销 —— 正是 §8b bug 2「点了没反应」的形态。实现该入口时必须同时把 `current` 移走（或显式清 `lastSeatId`）。
   **本 suite 不为它设 case**：期望值属于产品决策，未定之前不写断言。

---

## 9. 自检与裁剪记录

- [x] 顶部有 conformance-only 声明（§0.1）
- [x] 每条 case 有 Source（无 Source 的已删）
- [x] 容错 / 降级类 case 写了「可发性」依据（`blank`、`pickDirectory`、`seatWorkspace`、`settingsScope`、`workspaces.create`）
- [x] Expected 只用系统边界词汇（看到 / 不出现 / 主栏显示 / 刷新后 / 徽章）；**实现结构断言已剥离**（例如"走哪个 early return"只写在 §1 的候选根因表里，且明确标为"不作为 eval 断言"）
- [x] 已扫 Expected 里的代码标识符：保留的标识符只出现在 **Source** 与「落点」列（`claimPendingSeat`、`reconcile`、`SEATS`…），不进入 Expected
- [x] 先枚举本文件真实前缀（`HP`/`BV`/`NC`/`AD`/`RT`/`VIS` 六种，全量枚举而非照抄模板）再算占比：`BV+AD = 21%` < 30%
- [x] 覆盖五型，不只 happy
- [x] 根因假设已去平台声明核对（§1.1/§1.2）：H1 否定、H3 不足、H2 确认为代码事实、H4 新增 —— **引用按符号锚定，未写行号**
- [x] Figma gate 跑过：**无可达 Figma** → §6 全部标 ⚠️ 待验证，**未标 PASS**
- [x] gating 三档已分（必过 / 监控 / sign-off）
- [x] 末尾列了盲区（§8）
- [x] 人工裁剪（**只减不增**）：构思阶段剔除了 4 条观察点在**代码内部**的候选 —— ①「`reconcile` 返回值形状」②「`stateOf` 分支覆盖」③「`readStore` 兼容旧 v2 格式」④「`emitBindings` 通知次数」。这四条属单测，不属 evals。副作用要说明：`design/ux-design.md` §8b bug 2 提到的"兼容旧格式"因此**在本 suite 里没有任何 case** —— 它只能由单测守。
- [x] **真机验证（2026-09-23）**：在真实 GUI（`127.0.0.1:3080`，插件以 `link:` 加载、`patchReload: live`）上三步复现了本症状，并验证了修复 —— 同一实验重跑时绑定保留（§1.4）。顺带真机通过：`HP-BIND-01`、`HP-STATE-02`、`HP-SIDE-01`、`NC-SIDE-01`、`RT-BIND-05`。
- [x] **二次裁剪（2026-09-23，人工复核后）**：**删掉了 `NC-BIND-02`**，并把 `NC-BIND-01` 的作用域收紧到"从八仙发起的动作"。原因：我把"任何时刻当前会话都必须有席位"当成了契约，而它其实是**合法状态**（八席是 8 个固定席位，不是会话列表）—— 这条 case 会把正确行为判成 FAIL，属"为臆测场景写的 case"。同时把 C3、§1.3、`HP-SIDE-03` 的定性一并纠正。
