# DSH 多会话面板 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 DSH Web GUI 主面板新增「多会话」工作台，同页并排 1–4 个独立会话的完整对话（原生记录 + 原生输入框），布局与绑定持久化。

**Architecture:** 纯客户端 cordis bundle。注册 `main` 面板（key `multisession`）+ `sidebar.panellist` 图标；面板条目声明自有 session 作用域子槽 `multisession.pane` 以获得注入的 `SessionProvider`；每格用 `<SessionProvider session={retainedRef}>` 显式绑定会话，内部 `renderFactorySlot('conversation.content', { variant:'embedded', phase, hero }, { slots:{ views: FixedChatConversationView } })` 复用官方对话渲染。

**Tech Stack:** 手写 `window.__ModuleLoader__.load` 客户端 bundle（无构建）、React 18（仅 `require('react')`）、内联样式 + `--dsw-alias-*` token、Node 22 做冒烟测试。

**Spec:** `docs/superpowers/specs/2026-11-06-multi-session-panel-design.md`

## Global Constraints

- 包名 `@local/dsh-multi-session`，且必须等于 `client.js` 里 `__ModuleLoader__.load({ id })` 的 id。
- 不 `require` 任何 `@deepseek-ai/*` 包；只 `require('react')`。
- 不写 CSS 文件、不注入 `<style>`；全部内联 style，颜色一律 `var(--dsw-alias-*)`。
- 可见文案不得硬编码，全部走 `ctx.locale` 的 `multisession` 命名空间（zh / en 两份）。
- 所有注册都包在 `ctx.effect` 或 `ctx.slots.inject` 里（可回收）。
- 面板必须在 `main` 注册时声明 `children: { 'multisession.pane': { kind:'single', scope:'session' } }`，否则拿不到 `SessionProvider`。
- 自建槽位名 `multisession.pane` 不得与他人冲突；不得重复声明 `main.conversation` / `conversation.session` 等已占用槽位。
- 每格必须有 ErrorBoundary 隔离；`retain` 必须在 effect cleanup 里 `release()`。
- 格数硬上限 4，下限 1。

---

### Task 1: 包骨架 + 冒烟测试

**Files:**
- Create: `scripts/smoke.mjs`
- Create: `package.json`, `index.js`, `cordis.patch.yml`, `icon.svg`, `locale/zh.json`, `locale/en.json`
- Create: `client.js`

**Interfaces:**
- Produces: `client.js` 导出 `{ inject: string[], apply(ctx) }`；注册三件事：`main`(key `multisession`)、`multisession.pane`、`sidebar.panellist`(id `multisession`)。
- Produces: `apply` 后 `registrations` 里可断言：`main` 条目有 `children['multisession.pane'].scope === 'session'`。

- [ ] **Step 1: 写失败的冒烟测试**

```js
// scripts/smoke.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import vm from 'node:vm'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const source = readFileSync(join(root, 'client.js'), 'utf8')

let bundle
const React = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  Component: class { constructor(p) { this.props = p; this.state = {} } },
  useState: v => [typeof v === 'function' ? v() : v, () => {}],
  useEffect: () => {}, useMemo: f => f(), useRef: v => ({ current: v }),
  useCallback: f => f, useContext: () => null, Fragment: 'Fragment',
}
const sandbox = {
  window: { __ModuleLoader__: { load: b => { bundle = b } } },
  console,
}
vm.runInNewContext(source, sandbox, { filename: 'client.js' })

const assert = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); process.exitCode = 1 } else console.log('ok  -', msg) }

assert(bundle && bundle.id === '@local/dsh-multi-session', 'bundle id matches package name')

const registrations = []
const injections = []
const ctx = {
  effect: fn => { const d = fn(); return typeof d === 'function' ? d : () => {} },
  locale: { register: () => () => {}, bind: () => key => key },
  slots: {
    inject: (name, cb) => { injections.push(name); cb(); return () => {} },
    register: (opts, comp) => { registrations.push({ opts, comp }); return () => {} },
  },
  sessions: { list: { getSnapshot: () => ({ ids: [], byId: {}, phase: 'ready' }) }, retain: () => ({ release() {} }) },
}
const mod = bundle.factory(p => { if (p === 'react') return React; throw new Error('unexpected require ' + p) })
assert(JSON.stringify(mod.inject) === JSON.stringify(['slots', 'locale', 'sessions']), 'client inject list')
mod.apply(ctx)

const main = registrations.find(r => r.opts.name === 'main')
const pane = registrations.find(r => r.opts.name === 'multisession.pane')
const icon = registrations.find(r => r.opts.name === 'sidebar.panellist')
assert(main && main.opts.key === 'multisession', 'main panel key')
assert(main.opts.children && main.opts.children['multisession.pane'], 'pane slot declared as child')
assert(main.opts.children['multisession.pane'].kind === 'single', 'pane slot kind single')
assert(main.opts.children['multisession.pane'].scope === 'session', 'pane slot scope session')
assert(pane && typeof pane.comp === 'function', 'pane component registered')
assert(icon && icon.opts.id === 'multisession', 'sidebar icon id matches panel key')
assert(typeof icon.opts.label === 'function', 'sidebar label is lazy (i18n)')
assert(injections.includes('main') && injections.includes('sidebar.panellist'), 'injects into host slots')
console.log(process.exitCode ? 'SMOKE FAILED' : 'SMOKE OK')
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node scripts/smoke.mjs`
Expected: `ENOENT ... client.js`

- [ ] **Step 3: 写 package.json / index.js / cordis.patch.yml / locale / icon / client.js 最小实现**

`package.json`：`name`、`private:true`、`type:module`、`exports{".","/client","/locale/*.json","/icon"}`、`files`、`dsh.bundle.patch`、`dsh.client{platform:'web',immediately:true,inject:[...]}`。

`client.js`：`window.__ModuleLoader__.load({ id, factory(require){ const React=require('react'); ... return { inject, apply } } })`，先只注册 `main`(占位组件) + `multisession.pane`(占位) + `sidebar.panellist`。

- [ ] **Step 4: 跑测试确认通过**

Run: `node scripts/smoke.mjs` → `SMOKE OK`

- [ ] **Step 5: 提交**

```bash
git add -A && git commit -m "feat: 包骨架与槽位注册骨架"
```

---

### Task 2: 单格嵌入官方对话内容

**Files:**
- Modify: `client.js`

**Interfaces:**
- Consumes: `SessionProvider`（props 注入）、`renderSlot`、`renderFactorySlot`。
- Produces: `ConversationPane`（session scope 槽位组件）+ `FixedChatConversationView`。

- [ ] **Step 1: 在 client.js 内实现 phase 计算与工厂渲染**

```js
function FixedChatConversationView(props) { return props.renderSlot('conversation.session', { view: 'chat' }) }
function ConversationPane({ sessionId, useSession, useConversation, useSessions, renderFactorySlot }) {
  const session = useSession(v => v)
  const conversation = useConversation(v => v)
  const active = (conversation.activeTargets && conversation.activeTargets.size > 0)
    || (!session.blank && !session.awaitingFirstTurn) || session.running
  const shellPhase = active ? 'active' : session.promptAttempted ? 'engaging' : 'blank'
  const summaryBlank = useSessions(s => s.byId[sessionId]?.blank)
  const settling = shellPhase === 'blank' && session.openState === 'loading' && summaryBlank !== true
  const hero = shellPhase === 'blank' && (session.openState === 'open' || summaryBlank === true)
  const phase = settling ? 'settling' : hero ? 'hero' : 'active'
  return h('div', { style: styles.conversation },
    renderFactorySlot('conversation.content', { variant: 'embedded', phase, hero },
      { slots: { views: FixedChatConversationView } }))
}
```

- [ ] **Step 2: 页面容器渲染单格**

`MultiSessionPage` 用 `sessions.retain(sessionId, { source:'multisessionPane' })` 在 `useEffect` 里取引用、cleanup 释放，`<SessionProvider session={ref} empty={...}>{renderSlot('multisession.pane', {})}</SessionProvider>`。

- [ ] **Step 3: 冒烟测试仍通过 + 手工安装验证渲染**

Run: `node scripts/smoke.mjs`；安装后目测：对话历史、输入框、滚动都正常。

- [ ] **Step 4: 提交**

```bash
git add -A && git commit -m "feat: 单格嵌入官方 conversation.content"
```

---

### Task 3: 1–4 格网格 + 增删 + 最大化

**Files:** Modify `client.js`

- [ ] **Step 1: 布局状态机** `{ panes: [{ id, sessionId }], maximizedId }`，纯函数 `addPane/closePane/toggleMax/assign`。
- [ ] **Step 2: 网格样式**：1 格单列；2 格两列；3 格第三格 `gridColumn:'1 / -1'`；4 格两列两行；`grid-auto-rows: minmax(0,1fr)`、`gap:12px`。
- [ ] **Step 3: 最大化**：目标格 `gridColumn:'1 / -1', gridRow:'1 / -1'`，其余 `display:'none'`（保持挂载）；Esc 还原；关闭按钮在 `panes.length === 1` 时禁用。
- [ ] **Step 4: 窄屏**：ResizeObserver 测容器宽 < 760 → 单列 + 纵向滚动。
- [ ] **Step 5: 冒烟 + 目测 + 提交** `feat: 1-4 格网格与最大化`

---

### Task 4: 会话选择器

**Files:** Modify `client.js`

- [ ] **Step 1: 列表投影**：`useSessions(s => s)` → 过滤 `blank`、`origin === 'subagent'`，按 `updatedAt` 降序。
- [ ] **Step 2: 搜索**：`displayTitle` 与 `id` 的大小写不敏感子串匹配。
- [ ] **Step 3: UI**：绝对定位弹出层（`bg-overlay` + `border-l2`），搜索框自动聚焦，行 = 标题 + 运行状态点 + 时间；点击绑定并关闭；「清空该格」；Esc / × 关闭。
- [ ] **Step 4: 首次自动填充**：无持久化状态时，`sessions.list.getSnapshot()` 里取最近 2 个可用会话填格；0 个则一格空态。
- [ ] **Step 5: 冒烟 + 目测 + 提交** `feat: 会话选择器与自动填充`

---

### Task 5: 持久化 + 健壮性 + 文案

**Files:** Modify `client.js`；Create `README.md`

- [ ] **Step 1: localStorage** `dsh.multi-session.v1`，防抖 200ms，读入校验（版本、pane 数量 1–4、id 唯一、sessionId 字符串或 null、maximizedId 必须在 panes 内）。
- [ ] **Step 2: 失效会话**：`byId[sessionId]` 不存在且列表已就绪 → 该格显示「会话不可用」+ 改绑入口；`retain` 抛错同样降级。
- [ ] **Step 3: ErrorBoundary**：每格包裹，捕获后显示错误卡片 + 重试；`console.error` 带前缀。
- [ ] **Step 4: i18n**：zh/en 两份字典覆盖所有可见文案；`label: () => t('panelLabel')`。
- [ ] **Step 5: README**：安装命令、能力、限制（内部扩展点风险）。
- [ ] **Step 6: 提交** `feat: 持久化、错误隔离与文案`

---

### Task 6: 安装与验收

- [ ] **Step 1:** `plugin_manager action=install_bundle target=D:\plugins\muti-sessions`
- [ ] **Step 2:** 用户打开 `http://127.0.0.1:61375`，点侧边栏「多会话」，逐条走验收标准 1–8
- [ ] **Step 3:** 按反馈修样式/布局，提交

## Self-Review

- 覆盖：入口(T1)、单格渲染(T2)、多格布局(T3)、选择器(T4)、持久化/降级/i18n(T5)、安装验收(T6)，对应 spec §3–§11。
- 无占位符：所有"怎么算 phase""怎么声明子槽""怎么 release"均给出具体代码或明确规则。
- 类型一致：`multisession.pane` / `multisession` / `multisessionPane` / `dsh.multi-session.v1` 全文一致。
