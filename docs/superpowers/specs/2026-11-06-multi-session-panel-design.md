# DSH 多会话面板设计（@local/dsh-multi-session）

日期：2026-11-06
状态：待用户评审
目标平台：DeepSeek Harness 桌面版 Web GUI（客户端插件）

## 1. 目标

在主面板（`main` 槽位）新增一个「多会话」工作台：同一页面内并排显示 1–4 个**独立会话的完整对话**，每个格子都能查看历史、输入并发送消息，互不干扰；布局、每格绑定的会话、最大化状态持久化，刷新/重启后恢复。

核心能力复用 Harness 官方的 `conversation.content` 工厂槽位（ui-subagent 的右侧栏子会话聊天用的就是它），因此每个格子拿到的是**原生对话内容 + 原生输入框**，不是自绘的简化聊天界面。

## 2. 非目标（首版）

- 不改造默认对话页（`conversation` 面板保持原样）。
- 不做 fork 会话（格子内可直接新建空会话，见 §14）。
- 不做拖拽调整格子尺寸。
- 不做多会话联动（同步滚动、广播输入、统一发送）。
- 不在格子内显示子代理会话（选择器默认过滤掉）。

## 3. 入口与整体形态

- 侧边栏面板图标：`sidebar.panellist`，`id = 'multisession'`，`order = 30`，图标为自绘 SVG（分屏图形），`label` 走 i18n（"多会话" / "Multi-session"）。
- 主面板：`main` 槽位，`key = 'multisession'`。点击图标 → `layout.selectPanel('multisession')`（由侧边栏自动完成）。
- 后续可选的"分屏"快捷按钮（会话标题栏 `conversation.session.header.utilities` 里放一个按钮，把当前会话塞进多会话面板）**不在首版**，等主体稳定后再评估。

## 4. 组件结构

```
MultiSessionPage                // main 槽位条目，root scope
├─ Toolbar                      // 标题、格数、[＋ 添加会话格]
└─ Grid
   └─ Pane × N                  // 每格一个 React 子树
      ├─ PaneHeader             // 独立组件：标题、运行状态、[选择会话][最大化][关闭]
      ├─ PaneBody
      │  ├─ SessionProvider session={ref}      // 显式绑定该格会话
      │  │  └─ renderSlot('multisession.pane') // session scope，拿到该会话的标准 props
      │  │     └─ renderFactorySlot('conversation.content', { variant:'embedded', phase, hero },
      │  │                           { slots: { views: FixedChatConversationView } })
      │  └─ EmptyState / UnavailableState / ErrorState
      └─ SessionPicker（弹出层，按需挂载）
```

要点：

- 页面条目在 `main` 注册时声明子槽 `children: { 'multisession.pane': { kind: 'single', scope: 'session' } }`。
  声明带来两个结果：**该条目拿到注入的 `SessionProvider`**；`multisession.pane` 成为可注册的槽位（"declaring is claiming"）。
- `multisession.pane` 用 `ctx.slots.inject('multisession.pane', () => ctx.slots.register({ name: 'multisession.pane', locale: NS }, ConversationPane))` 注册，
  等主面板条目声明后再落地，避免"未声明槽位"报错。
- `ConversationPane`（session scope）拿到 `sessionId / useSession / useConversation / useSessions / renderFactorySlot`，
  phase 计算与 `ui-subagent` 的 `ConversationSlotPanel` 完全一致（settling / hero / active），保证与官方嵌入行为一致。
- 每格是独立的 `SessionProvider`，因此**同一 React 树里并存多个会话绑定**；这是官方支持的用法（右侧栏子会话聊天同源）。
- 每格包一层 React ErrorBoundary，单格崩溃只影响自己（槽位条目整块崩溃会打空整个面板，必须隔离）。

## 5. 会话绑定与生命周期

- `PaneBody` 在 `useEffect` 里 `ctx.sessions.retain(sessionId, { source: 'multisessionPane' })`，cleanup 时 `reference.release()`；依赖 `[sessionId]`，改绑即换引用。
- `retain` 抛异常（会话 id 失效等）→ 该格进入 `UnavailableState`（提示 + 重新选择按钮），不抛出。
- 传入 `<SessionProvider session={reference} empty={...}>`：binding 尚未打开时渲染占位（加载中），打开后自动重渲染为对话内容。
- 页面卸载 → 所有格子 cleanup → 引用全部释放，不泄漏、不影响别处的会话。
- 除「新建会话」外不主动 `create`/`fork`/关闭会话，只持有引用。

## 6. 会话选择器

- 数据源：`useSessions`（`SessionListState`：`ids` + `byId`）。
- 过滤：`blank === true` 跳过；`origin === 'subagent'` 跳过（首版默认隐藏子代理会话）；其余按 `updatedAt` 降序。
- 搜索：对 `displayTitle` 与 `id` 做大小写不敏感子串匹配；输入即筛。
- 每行：标题（缺失回退 id 前 8 位）、运行中小圆点、相对更新时间；当前格已绑定的行高亮。
- 操作：点击行 → 绑定并关闭；「清空该格」→ 解绑（格子变空态）；「×」/Esc/点外部 → 关闭。
- 首次打开面板（无持久化状态）：按 `updatedAt` 取最近 2 个可用会话填格；不足 2 个则按实际数量；0 个则一格空态。

## 7. 布局规则

- 格数 1：单列全宽。
- 格数 2：两列一行。
- 格数 3：两列两行，第三格跨两列（视觉平衡，不留半格空洞）。
- 格数 4：两列两行。
- 网格：`display:grid; grid-template-columns: repeat(2, minmax(0,1fr)); grid-auto-rows: minmax(0,1fr); gap:12px; padding:12px; height:100%; overflow:hidden`。
- 最大化：目标格 `grid-column: 1 / -1; grid-row: 1 / -1`，其余格 `display:none`（保持挂载，流不中断）；再次点击还原；Esc 退出最大化。
- 关闭：格数 > 1 时可关闭；只剩 1 格时关闭按钮禁用（避免空面板）。
- 添加：格数 < 4 时可用；新格为空并自动打开选择器。
- 窄窗口（< 760px）：退化为单列 + 纵向滚动，避免每格被压到不可用。

## 8. 持久化

- `localStorage`，键 `dsh.multi-session.v1`，值：
  ```json
  { "version": 1, "panes": [{ "id": "p1", "sessionId": "..." }], "maximizedId": "p1" }
  ```
- 变更后 200ms 防抖写入；读取失败/结构非法 → 回到默认布局，不阻塞渲染。
- 恢复时：`sessionId` 已不存在 → 该格显示 "会话不可用"，仍可直接改绑；不自动删除该格记录（可能是临时不可达）。
- `localStorage` 不可用（隐私模式等）：退化为内存态，仅本次会话有效。

## 9. 工程形态

- 包名 `@local/dsh-multi-session`，纯客户端插件，**无构建步骤**（手写 `client.js`，与官方 decoration 模板同构）。
- 文件：
  ```
  package.json          // type:module, main:index.js, dsh.bundle.patch, dsh.client{platform:'web',immediately:true,inject:[...]}
  index.js              // Host 侧空实现：export function apply() {}
  client.js             // window.__ModuleLoader__.load({ id: '@local/dsh-multi-session', factory(require){...} })
  cordis.patch.yml      // - insert: [{ id: dsh-multi-session, name: '@local/dsh-multi-session' }]
  icon.svg
  locale/zh.json
  locale/en.json
  README.md
  ```
- `client.js` 只 `require('react')`；不 require 任何 Harness Client 包（官方硬规则）；样式用内联 style + `--dsw-alias-*` token；
  副作用（locale 注册、槽位注册）全部在 `apply(ctx)` 内通过 `ctx.effect` / `ctx.slots.inject` 完成。
- 客户端 `inject: ['slots', 'locale', 'sessions']`；`package.json` 的 `dsh.client.inject` 用于激活排序：
  `@deepseek-ai/dsh-client-ui-conversation`、`@deepseek-ai/dsh-client-ui-session`、`@deepseek-ai/dsh-client-ui-layout`、`@deepseek-ai/dsh-client-ui-sidebar`、`@deepseek-ai/dsh-client-locale`。
- 文案走 `ctx.locale.register(NS, { zh, en })` + `ctx.locale.bind(NS)`，可见文本零硬编码中文。
- 安装：`plugin_manager action=install_bundle target=D:\plugins\muti-sessions`，由插件管理器写入 profile。

## 10. 错误处理与降级

| 场景 | 行为 |
| --- | --- |
| 单格渲染抛异常 | ErrorBoundary 捕获，显示该格错误卡片 + "重试"（重置 boundary），其他格不受影响 |
| `retain` 失败 / 会话不存在 | 该格显示"会话不可用"，提供重新选择入口 |
| binding 未就绪 | 该格显示加载占位 |
| 空格 | 显示"选择一个会话"大按钮，点击开选择器 |
| localStorage 异常 | 内存态运行，控制台告警一次 |
| 面板组件整体崩溃 | 只打空本面板条目；默认对话页与侧边栏不受影响 |

## 11. 验收标准

1. 侧边栏出现「多会话」图标；点击进入多会话面板；默认对话页行为完全不变。
2. 首次进入自动填充最近 2 个会话；可增删 1–4 格；3/4 格按两列排布。
3. 每格独立显示对应会话的历史消息与输入框；在某格发送消息只影响该会话；切到别的面板再切回来，内容与绑定都在。
4. 选择器支持搜索（标题/id），默认不列子代理会话与空白会话；切换后表格立即显示新会话。
5. 最大化/还原生效；关闭减少格数；仅剩 1 格时关闭禁用。
6. 刷新页面后布局、每格绑定、最大化状态恢复；会话被删除的格子显示"不可用"并可改绑。
7. 任一格内异常不影响其他格与整个应用。
8. 中文/英文界面文案随平台语言切换。

## 12. 风险与缓解

- **内部扩展点稳定性**：`conversation.content` 是 ui-conversation 的工厂槽位而非公开文档 API，DSH 升级可能改签名。缓解：只使用官方同款参数（`variant/phase/hero` + `views` 本地槽），不触碰其它字段；升级后按源码同步。
- **资源占用**：最多 4 个完整对话同时挂载，含流式渲染。缓解：硬上限 4；隐藏（非最大化）的格子保持挂载但不额外订阅；不做预加载。
- **高度布局**：工厂输出的根节点依赖外层 flex 链提供确定高度，可能出现滚动条错位。缓解：每层 `flex:1; min-height:0; display:flex; flex-direction:column`，上线后目测微调。
- **`retain` 语义**：不同 source 的引用计数是否互相影响未知；缓解：卸载即 release，异常吞掉并降级。

## 13. 实施阶段

1. **P1 骨架**：包结构 + `main` 面板 + 侧边栏图标 + 单格嵌入官方对话内容（验证可行性）。
2. **P2 多格**：1–4 格网格、增删、最大化、关闭。
3. **P3 绑定**：选择器（搜索/过滤/状态）、首次自动填充、`retain` 生命周期。
4. **P4 持久化 + 健壮性**：localStorage、失效会话、错误边界、空态、i18n。
5. **P5 安装与验收**：`install_bundle` 安装到 profile，用户在 127.0.0.1:61375 实测，按反馈微调。

## 14. v0.2 扩展：格子内新建会话

- 入口：空格大按钮「新建会话」、每格选择器底部的「新建会话」。
- 行为：调用 `sessions.create(target)`，返回的新会话 id 立即绑定到该格并关闭选择器；新会话是空白会话，格子直接显示原生 hero 输入态，输入第一句话即开始会话。
- 位置（用户不需要选工作区，直接给"一个新建会话"）：
  1. 该格当前会话所在的工作区（`WorkspaceView.sessionIds` 里能找到）；
  2. 否则最近使用会话所在的工作区；
  3. 否则该格会话的 `cwd`，再否则最近会话的 `cwd`；
  4. 都没有 → 不传参数，由 Host 用默认目录。
  `session.create` 不接受同时传 `workspaceId` 与 `cwd`，实现里两者只出一个。
- 失败：`create` 拒绝时选择器/空态里显示「新建失败：<原因>」，按钮恢复可用，格子绑定不变。
- 选择器额外显示当前格绑定的空白会话（仅当前格），避免新建后"看不到自己在哪"。
- 不做：fork、选择 agent preset、选择工作区、在后台批量新建。

## 15. v0.3 扩展：不限格数

- 取舍：取消 4 格硬上限，用户选择「不限格数」。代价是每个格子都是一个常驻的完整对话，开得越多内存与订阅越多——按钮不再拦截，由用户自己控制。
- 布局：不再固定两列。
  - 列数 = `min(格数, clamp(1, floor(容器宽度 / 380), 3))`；宽度未知（首帧、无 ResizeObserver）时按 2 列。
  - **列数取「宽度能容纳的列数」与「实际格数」的较小值**：两个格子在能放三列的宽面板里就用两列铺满，不会把格子挤成 1/3 宽、右边空出一格（v0.3.1 修正）。
  - 行高 `grid-auto-rows: minmax(360px, 1fr)`：格子少时铺满面板，格子多到一屏放不下时保持 360px 可读高度，面板整体纵向滚动，不再把格子压扁。
  - 末行只剩一个格子且列数 > 1 时，该格横跨整行。
- 最大化：不再用 `gridRow: 1 / -1`（多行时会把最大化格撑成所有行的高度），改为独立 flex 宿主，只显示该格。
- 每格最小宽度 380px 是经验值：再窄输入框与消息气泡会明显拥挤。
- 防御：`normalizeLayout` 对损坏的 localStorage 最多接受 32 个格子（仅存储层护栏，UI 不设上限）。
- 不做：格子间拖拽调宽、格子内分栏、虚拟化未挂载的格子。

## 16. v0.4 扩展：自由画布（每格独立拖拽缩放）

- 取舍：从「自动网格」改为「自由画布」。用户要求粒度细到单个格子、长宽各自独立，网格布局做不到 → 每个格子改为画布上的绝对定位窗口。
- 数据模型：布局版本 1 → 2。每个 pane 增加可选的 `rect: { x, y, w, h }`，四个值都是画布宽高的**比例**（0..1），窗口缩放后相对位置不变。没有 `rect` 的格子继续走自动网格（`autoRects`），所以旧布局可以无损升级。
- 交互：
  - 拖标题栏（标题栏里的按钮除外）→ 移动；
  - 拖右边 / 下边 / 右下角的透明抓手 → 只改宽 / 只改高 / 同时改；
  - 最小尺寸 260 × 180px；坐标按 8px 取整；四边夹在画布内；
  - 允许重叠，按下哪个格子哪个置顶（`zMap`）；已在顶层时不触发重渲染。
- 首次拖拽即物化：松手时把所有格子当前的像素矩形一起转成比例写回，此后整体从「自动网格」切到「手动摆放」，避免一半跟随、一半固定。
- 自动排列：清空全部 `rect` 与最大化状态，回到 `autoRects` 的整齐网格；之后新增的格子也恢复自动。
- 新增格子：已有手动矩形时，新格子落在 3% 起的级联位置（0.46 × 0.5），不打断现有摆放。
- 窄面板：宽度 < 680px 改为上下堆叠（每格 380px 高、整体滚动），不渲染抓手——堆叠里没有有意义的二维位置。
- 存储护栏：`normalizeRect` 拒绝非数字、过小（< 2%）与越界矩形；`normalizeLayout` 同时接受 v1（无几何）与 v2。
- 不做：吸附参考线、多选、撤销、格子内分栏。

> 16 节描述的「自由画布」在 v0.5.0 被整体移除：用户要的是不重叠的平铺分区（拖分隔条改变相邻格子尺寸），不是可重叠的画布窗口。以下 17 节取代 16 节。

## 17. v0.5 扩展：不重叠平铺 + 分隔条（tmux 式）

- 取舍：格子不再是可自由摆放的窗口，而是**永不重叠的分区**。整个面板被若干行横向切分，每行再被 1–2 个格子横向切分；任何时刻所有格子铺满面板，没有层叠、没有 z 序。
- 默认排布（`defaultRows`）：两格并排；三格 = 首行单格 + 次行两格（用户举的例子）；四格 = 2×2；更多格子按「首行单格（奇数时）+ 其余每行两格」。
- 数据模型：布局版本 2 → 3。
  ```json
  {
    "version": 3,
    "panes": [{ "id": "p1", "sessionId": "..." }],
    "rows": [["p1"], ["p2", "p3"]],
    "rowWeights": [1, 1],
    "colWeights": { "p1": 1, "p2": 1, "p3": 1 },
    "maximizedId": null
  }
  ```
  `rows` 是格子的二维排列，`rowWeights` 是每行的高度权重，`colWeights` 是每格在所属行里的宽度权重。v1/v2 的旧数据照常读入：丢掉 `rect`，按默认排布重建 `rows` 与全 1 权重。
- 交互：
  - 行与行之间有一条 6px 的横分隔条：拖动它 → 上下两行的高度权重互补变化（一行变高，另一行等量变矮），两行里所有格子一起受影响；
  - 同一行两格之间有一条 6px 的竖分隔条：拖动它 → 两格的宽度权重互补变化（一格变宽，另一格等量变窄），同一行之外的格子不受影响；
  - 权重拖动有像素下限：行高不小于 140px、格宽不小于 200px（`MIN_PANE_H` / `MIN_PANE_W`），换算成权重后夹住；
  - 拖动过程中只改 `draft`，松手才写入布局并持久化；鼠标位移小于 2px 视为点击。
- 「均分」：把所有 `rowWeights` 与 `colWeights` 重置为 1，分隔条回到平均分配。
- 增删格子：新格子先填最后一行剩余的位置，满了再开新行（新行权重 1）；关闭格子后若某行空了，该行连同它的权重一起删除。
- 最大化：v0.5 是「只渲染被最大化的那一格」，v0.6 起改为覆盖层、其余格保持挂载（见 §18）；`Esc` 或「还原」退出。
- 布局用 CSS flex 实现：外层 `flex-direction: column`，每行 `flex-grow: rowWeight; flex-basis: 0`；行内每格 `flex-grow: colWeight; flex-basis: 0`。这样浏览器负责像素换算，窗口缩放自动跟随，不需要 ResizeObserver，也不会出现「面板没铺满」的空白。
- 存储护栏：`normalizeRows` 只保留已知格子 id、去重、丢掉空行，并保证每个格子都有归属；`normalizeLayout` 接受 v1/v2/v3，权重必须是正数。
- 不做：拖拽移动格子位置、任意嵌套切分（只有「行 → 两格」两级）、撤销、吸附。


## 18. v0.6 性能与稳定

- 背景：v0.5 每格都是一份完整的 `conversation.content`。格子一多，拖动分隔条会重算所有格的样式；任意一格抛错会把该槽位条目整块打空；DSH 升级若改了工厂签名，整个面板都不可用；最大化会重挂载对话，滚动位置和正在流式的回复都会丢。
- 改动：
  1. **重渲染隔离**：模块级 `PaneShell = React.memo(...)`，把格子外壳（标题栏 + 身体 + 选择器）与父级的布局状态隔开；父级的回调全部用 `useCallback` 保持稳定引用。拖动分隔条时只有布局容器和分隔条重算，各格的对话组件不重渲染。
  2. **双层错误边界**：格子级 `PaneBoundary` 捕获后按 600ms / 1200ms 退避自动重建两次，仍失败才显示错误卡片，卡片上有「重试」；面板级 `PageBoundary` 兜住整块面板的异常，提供「清空布局并重置」（先 `localStorage.removeItem` 再重挂）。
  3. **工厂槽降级**：`renderFactorySlot('conversation.content', ...)` 包 `try/catch`。失败时 `console.error('[multi-session] conversation.content is unavailable', error)`，该格只显示「此视图暂不可用」+ 重试按钮，不影响其它格；重试通过递增 `attempt` 同时作为子树 `key`，强制重建。
  4. **会话引用可重试**：`usePaneReference(..., retryToken)` 把重试计数放进依赖，`SessionProvider` 的 `empty` 分支与失败卡片都接到同一个 `retry`。
  5. **最大化不重挂载**：所有格子始终挂载，最大化只是把目标格改成 `position: absolute; inset: 0; z-index: 20` 的覆盖层，其余格 `visibility: hidden`。这样切换最大化会保留滚动位置、输入框草稿与流式回复。
- 不做（留给后续）：非焦点格降频/虚拟化、流式消息节流、跨格广播。当前所有格子保持实时渲染，靠 memo 与边界控制成本。
- 验收：`node --check client.js`、`scripts/smoke.mjs`、`scripts/render-smoke.mjs` 全绿；单格工厂抛错只降级该格；面板级异常可一键重置；最大化/还原不丢对话状态。

## 19. v0.7 最小化

- 需求：每格都能最小化；收起时仍要在面板上方看到该会话的标题。
- 交互：标题栏新增「最小化」（一条横线图标）。收起后该格离开网格，工具栏下方出现「已收起」横条，条上是一枚 chip：运行状态点 + 会话标题 + 关闭按钮。点 chip 展开，格子回到它原来所在的行与列位置。
- 数据：每个格子增加 `minimized: boolean`；布局版本 3 → 4（`normalizeLayout` 继续接受 1/2/3，旧数据默认 `false`）。`rows` 不因收起而改变，所以展开能精确复位。
- 网格：`visibleGrid(layout)` 过滤掉收起的格子；同一行两格收掉一格时，另一格独占整行；整行都收起时整行不渲染，剩余行按 `rowWeights` 重新铺满。分隔条拖动同样基于可见行计算，跨过被收起行的相邻可见行也能正确互补。
- 与最大化互斥：最小化当前最大化的格子会先退出最大化；从存储恢复时，若 `maximizedId` 指向已收起的格子则清空。
- 全部收起时，网格区显示「所有格子都收起了，点上面的标题展开」。
- 收起即卸载该格的对话视图（会话本身在后台继续运行，展开时重新挂载并显示最新状态）；这样收起也是对多格场景的一种减负。
- 不做：收起时保持对话挂载、拖拽 chip 排序、把 chip 收进标题栏。

## 20. v0.7 新建会话时选择工作区（不跳转）

- 问题：在格子里新建的会话是空白会话，原生 hero 会显示「选择工作区」。那个选择器由 `ui-conversation` 的 factory inject 提供：`selectWorkspace(workspaceId)` → `uiWorkspace.openWorkspace(...)` → 建好会话后 `replaceMain(sessionId, ..., 'reveal')` → `ctx.layout.selectPanel(null)`；而 `selectPanel(null)` 的语义就是「显示当前会话」，于是主面板从 `multisession` 切回 `conversation`，看起来像「点完工作区就跳走了」。
- 方案：新建会话时先由插件自己问工作区。点击空格的「新建会话」或选择器底部的「新建会话」→ 弹出工作区对话框（列出 `useWorkspaces()` 的 `items`，每行标题 + 路径 + 会话数）→ 选定后直接 `sessions.create({ workspaceId })`，成功后 `assignSession(paneId, id)` 绑到当前格。整个过程不调用 `uiWorkspace.openWorkspace`，因此没有任何 `selectPanel(null)`，页面留在多会话面板。
- 没有工作区时（`items` 为空）才退回 `createTarget()` 的启发式（当前会话的 `cwd` / 最近会话的 `cwd` / Host 默认），对话框里给一个「默认位置」按钮。
- 对话框形态：面板级覆盖层（`position:absolute; inset:0; z-index:50`），卡片式，`role="dialog"` + `aria-label`，列表项带 `data-workspace-id` 便于测试；`busy` 时禁用选项；取消关闭不收格子。
- 测试：`render-smoke` 断言「点新建先出现工作区对话框」「列出全部工作区」「未选之前不调用 `sessions.create`」「选 `ws-1` 后 `create({ workspaceId: 'ws-1' })` 并绑定」；失败路径同样先选工作区再拒绝。
- 不做：在已绑定空白会话的 hero 里替换工作区选择器（那是 `ui-conversation` 的 root 作用域槽，插件无权覆盖）；从其它面板拖入工作区；格内切换工作区。

