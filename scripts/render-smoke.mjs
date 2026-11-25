import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import vm from 'node:vm'
import { JSDOM } from 'jsdom'
import React from 'react'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/' })
globalThis.window = dom.window
globalThis.document = dom.window.document
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const { createRoot } = await import('react-dom/client')
const { act } = await import('react-dom/test-utils')

const layout = {
  version: 1,
  panes: [
    { id: 'p1', sessionId: 'session-a' },
    { id: 'p2', sessionId: 'session-b' },
  ],
  maximizedId: null,
}
dom.window.localStorage.setItem('dsh.multi-session.v1', JSON.stringify(layout))

let bundle
/* Report a wide panel so the canvas geometry runs for real. */
class FakeResizeObserver {
  constructor(callback) { this.callback = callback }
  observe() { this.callback([{ contentRect: { width: 1200, height: 800 } }]) }
  disconnect() {}
}
/* The plugin listens on window for pointer moves while dragging; jsdom's window
   is not the sandbox object, so keep a tiny event registry the test can fire. */
const windowListeners = new Map()
const emitWindow = (type, event) => {
  for (const fn of Array.from(windowListeners.get(type) || [])) fn(event)
}
const sandbox = {
  window: {
    __ModuleLoader__: { load: b => { bundle = b } },
    localStorage: dom.window.localStorage,
    addEventListener(type, fn) {
      const set = windowListeners.get(type) || new Set()
      set.add(fn)
      windowListeners.set(type, set)
    },
    removeEventListener(type, fn) {
      const set = windowListeners.get(type)
      if (set) set.delete(fn)
    },
  },
  ResizeObserver: FakeResizeObserver,
  console,
  setTimeout,
  clearTimeout,
  Date,
  JSON,
  Number,
  String,
  Set,
  Map,
  Math,
  Object,
  Array,
}
vm.runInNewContext(readFileSync(join(root, 'client.js'), 'utf8'), sandbox, { filename: 'client.js' })

const registrations = []
const state = {
  phase: 'ready',
  ids: ['session-a', 'session-b', 'session-blank'],
  byId: {
    'session-a': { id: 'session-a', displayTitle: '标题甲', updatedAt: 200, running: true, blank: false },
    'session-b': { id: 'session-b', displayTitle: '标题乙', updatedAt: 100, running: false, blank: false },
    'session-blank': { id: 'session-blank', displayTitle: '空白', updatedAt: 300, running: false, blank: true },
  },
}
const session = {
  sessionId: 'session-a',
  blank: false,
  running: true,
  awaitingFirstTurn: false,
  promptAttempted: true,
  openState: 'open',
}
const conversation = { activeTargets: new Set() }
const releases = []
const created = []
let failing = false
const workspaces = {
  phase: 'ready',
  items: [
    { workspaceId: 'ws-1', path: 'C:/alpha', sessionIds: ['session-a'] },
    { workspaceId: 'ws-2', path: 'C:/beta', sessionIds: ['session-b'] },
  ],
}

const openedInMain = []
const openedWorkspaces = []
const readFiles = []
const remote = {
  workspaceFiles: {
    read: (sessionId, path) => {
      readFiles.push([sessionId, path])
      return Promise.resolve({ ok: true, value: { text: 'first line\nsecond line', lines: 2 } })
    },
  },
}
const sidebarRight = {
  openResource: address => { throw new Error('sidebarRight: no session surface is mounted (' + address + ')') },
}
const uiWorkspace = {
  openSession: id => openedInMain.push(id),
  openWorkspace: workspaceId => {
    openedWorkspaces.push(workspaceId)
    return Promise.resolve()
  },
}

const ctx = {
  effect: fn => fn() || (() => {}),
  locale: { register: () => () => {}, bind: () => key => key },
  slots: {
    inject: (name, cb) => { cb(); return () => {} },
    register: (opts, comp) => { registrations.push({ opts, comp }); return () => {} },
  },
  sessions: {
    list: { getSnapshot: () => state },
    retain: (id, options) => {
      const ref = { sessionId: id, options, release() { releases.push(id) } }
      return ref
    },
    create: options => {
      created.push(options)
      return failing ? Promise.reject(new Error('boom')) : Promise.resolve('fresh-session-1234')
    },
  },
  uiWorkspace,
  sidebarRight,
  remote,
}
const mod = bundle.factory(p => {
  if (p === 'react') return React
  throw new Error('unexpected require: ' + p)
})
mod.apply(ctx)

const main = registrations.find(r => r.opts.name === 'main')
const pane = registrations.find(r => r.opts.name === 'multisession.pane')
const icon = registrations.find(r => r.opts.name === 'sidebar.panellist')
const useSessions = selector => selector(state)

const container = document.getElementById('root')
const root_ = createRoot(container)
const mainProps = {
  t: key => key,
  sessions: ctx.sessions,
  uiWorkspace,
  remote,
  useSessions,
  useWorkspaces: selector => selector(workspaces),
  SessionProvider: props => React.createElement('div', {
    'data-provider': String(!!props.session),
    'data-session': props.session ? props.session.sessionId : '',
  }, props.children),
  renderSlot: name => React.createElement('div', { 'data-slot': name }, 'session slot'),
  renderFactorySlot: () => React.createElement('div', null, 'factory'),
  usePanelInfo: () => ({ id: 'multisession' }),
}
/* Inline geometry the plugin wrote on a pane, as a CSSStyleDeclaration. */
const paneBox = (scope, id) => {
  const element = scope.querySelector('[data-pane-id="' + id + '"]')
  return element ? element.style : null
}
const rowOf = (scope, id) => {
  const element = scope.querySelector('[data-pane-id="' + id + '"]')
  return element ? element.parentElement : null
}
const stubHost = scope => {
  const host = scope.querySelector('[data-multisession-host]')
  if (host) {
    host.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1200, height: 800, right: 1200, bottom: 800, x: 0, y: 0 })
  }
  return host
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
await act(async () => { root_.render(React.createElement(main.comp, mainProps)) })

const mainHtml = container.innerHTML
const mainGrid = container.querySelector('[style*="grid-template-columns"]')
const releasesBeforeCreate = releases.length

// Open the first pane's picker and create a session from it.
const openButton = container.querySelector('button[title="switchSession"]')
await act(async () => { openButton.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })) })
const dialog = container.querySelector('[role="dialog"]')
const createButton = dialog
  ? Array.from(dialog.querySelectorAll('button')).find(button => button.textContent === 'newSession')
  : null
await act(async () => { createButton.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })) })
/* Creating asks which workspace first; nothing is created until a choice is made. */
const workspaceDialog = container.querySelector('[role="dialog"][aria-label="chooseWorkspace"]')
const workspacesOffered = workspaceDialog
  ? Array.from(workspaceDialog.querySelectorAll('[data-workspace-id]')).map(button => button.getAttribute('data-workspace-id'))
  : []
const createdBeforePick = created.length
const workspaceOption = workspaceDialog ? workspaceDialog.querySelector('[data-workspace-id="ws-1"]') : null
await act(async () => {
  workspaceOption.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
  await Promise.resolve()
  await Promise.resolve()
})
const createdHtml = container.innerHTML

const paneContainer = document.createElement('div')
const paneRoot = createRoot(paneContainer)
await act(async () => {
  paneRoot.render(React.createElement(pane.comp, {
    t: key => key,
    sessionId: 'session-a',
    useSession: selector => selector(session),
    useConversation: selector => selector(conversation),
    useSessions,
    renderFactorySlot: (name, input, options) => React.createElement('div', {
      'data-factory': name,
      'data-variant': input.variant,
      'data-phase': input.phase,
      'data-hero': String(input.hero),
      'data-view': typeof options.slots.views,
    }, 'factory output'),
    renderSlot: () => null,
  }))
})
const paneHtml = paneContainer.innerHTML

// A conversation contract that throws must degrade to a message, not blank the panel.
const brokenContainer = document.createElement('div')
const brokenRoot = createRoot(brokenContainer)
await act(async () => {
  brokenRoot.render(React.createElement(pane.comp, {
    t: key => key,
    sessionId: 'session-a',
    useSession: selector => selector(session),
    useConversation: selector => selector(conversation),
    useSessions,
    renderFactorySlot: () => { throw new Error('factory gone') },
    renderSlot: () => null,
  }))
})
const brokenHtml = brokenContainer.innerHTML
await act(async () => { brokenRoot.unmount() })

const iconContainer = document.createElement('div')
const iconRoot = createRoot(iconContainer)
await act(async () => { iconRoot.render(React.createElement(icon.comp, { size: 16, active: false })) })
const iconHtml = iconContainer.innerHTML

const checks = [
  [bundle.id === '@local/dsh-multi-session', 'bundle id'],
  [mainHtml.includes('标题甲') && mainHtml.includes('标题乙'), 'main renders both pane titles'],
  [mainHtml.includes('data-slot="multisession.pane"'), 'each pane renders the owned session slot'],
  [container.querySelector('[data-pane-id="p1"]').closest('[data-split="row"]') === container.querySelector('[data-pane-id="p2"]').closest('[data-split="row"]') && paneBox(container, 'p1').flexGrow === '1', 'two panes share one row with equal weight'],
  [mainHtml.includes('data-provider="true"'), 'SessionProvider receives a retained reference'],
  [(mainHtml.match(/data-provider="true"/g) || []).length === 2, 'two session providers for two panes'],
  [releasesBeforeCreate === 0, 'references stay retained while mounted'],
  [paneHtml.includes('data-factory="conversation.content"'), 'pane renders conversation.content factory'],
  [paneHtml.includes('data-variant="embedded"'), 'factory variant is embedded'],
  [paneHtml.includes('data-phase="active"'), 'phase is active for a running session'],
  [paneHtml.includes('data-view="function"'), 'views slot override is a component'],
  [brokenHtml.includes('viewUnavailable'), 'a broken conversation contract degrades to a message'],
  [brokenHtml.includes('retry'), 'the degraded pane still offers a retry'],
  [iconHtml.includes('<svg'), 'sidebar icon renders svg'],
  [workspaceDialog !== null, 'new session asks for a workspace first'],
  [workspacesOffered.join(',') === 'ws-1,ws-2', 'the workspace dialog lists every workspace'],
  [createdBeforePick === 0, 'nothing is created before a workspace is picked'],
  [created.length === 1 && created[0] && created[0].workspaceId === 'ws-1', 'new session inherits the pane workspace'],
  [createdHtml.includes('data-session="fresh-session-1234"'), 'pane binds the created session'],
  [createdHtml.includes('fresh-se'), 'header shows the created session'],
  [container.querySelector('[role="dialog"]') === null, 'picker closes after creating'],
]

await act(async () => { root_.unmount() })
checks.push([
  releases.includes('session-a') && releases.includes('session-b') && releases.includes('fresh-session-1234'),
  'unmount releases every reference',
])

// Failure path: an empty pane offers create, and a rejected create keeps it empty.
failing = true
dom.window.localStorage.setItem('dsh.multi-session.v1', JSON.stringify({
  version: 1,
  panes: [{ id: 'p9', sessionId: null }],
  maximizedId: null,
}))
const emptyContainer = document.createElement('div')
document.body.appendChild(emptyContainer)
const emptyRoot = createRoot(emptyContainer)
await act(async () => { emptyRoot.render(React.createElement(main.comp, mainProps)) })
const emptyCreate = Array.from(emptyContainer.querySelectorAll('button')).find(button => button.textContent === 'newSession')
await act(async () => { emptyCreate.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })) })
const emptyWorkspaceDialog = emptyContainer.querySelector('[role="dialog"][aria-label="chooseWorkspace"]')
const emptyWorkspaceOption = emptyWorkspaceDialog
  ? emptyWorkspaceDialog.querySelector('[data-workspace-id="ws-1"]')
  : null
await act(async () => {
  emptyWorkspaceOption.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
  await Promise.resolve()
  await Promise.resolve()
})
const failureHtml = emptyContainer.innerHTML
checks.push([
  failureHtml.includes('createFailed') && failureHtml.includes('boom'),
  'failed create reports the error',
])
checks.push([
  Array.from(emptyContainer.querySelectorAll('button')).some(button => button.textContent === 'newSession'),
  'failed create leaves the pane usable',
])
await act(async () => { emptyRoot.unmount() })

// A workspace pick made from the blank hero stays in the tile it came from.
failing = false
dom.window.localStorage.setItem('dsh.multi-session.v1', JSON.stringify({
  version: 1,
  panes: [{ id: 'w1', sessionId: 'session-blank' }],
  maximizedId: null,
}))
const blankContainer = document.createElement('div')
document.body.appendChild(blankContainer)
const blankRoot = createRoot(blankContainer)
await act(async () => { blankRoot.render(React.createElement(main.comp, mainProps)) })
const createdBeforePickInPane = created.length
await act(async () => {
  blankContainer.querySelector('[data-theme]').dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true }))
  await ctx.uiWorkspace.openWorkspace('ws-2')
  await Promise.resolve()
})
checks.push([
  created.length === createdBeforePickInPane + 1 &&
    created[created.length - 1] &&
    created[created.length - 1].workspaceId === 'ws-2',
  'a workspace pick inside a pane creates the session there',
])
checks.push([
  openedWorkspaces.length === 0,
  'the same pick skips the reveal that would leave the panel',
])
checks.push([
  blankContainer.innerHTML.includes('data-session="fresh-session-1234"'),
  'the picked workspace lands in the same pane',
])
await act(async () => { blankRoot.unmount() })

// No hard cap: six panes render, and the toolbar keeps adding more.
dom.window.localStorage.setItem('dsh.multi-session.v1', JSON.stringify({
  version: 1,
  panes: Array.from({ length: 6 }, (_, index) => ({ id: 'm' + index, sessionId: null })),
  maximizedId: null,
}))
const manyContainer = document.createElement('div')
document.body.appendChild(manyContainer)
const manyRoot = createRoot(manyContainer)
await act(async () => { manyRoot.render(React.createElement(main.comp, mainProps)) })
const addButton = Array.from(manyContainer.querySelectorAll('button')).find(button => button.textContent.startsWith('+ '))
checks.push([
  !!paneBox(manyContainer, 'm2') &&
    manyContainer.querySelectorAll('[data-split="col"]').length === 2 &&
    manyContainer.querySelectorAll('[data-split="row"]').length === 3,
  'six panes tile as three stacked rows of two',
])
checks.push([!!addButton && !addButton.disabled, 'add button stays enabled past four panes'])
checks.push([manyContainer.querySelectorAll('[data-pane-id]').length === 6, 'every pane renders without a hard cap'])
const headersBefore = manyContainer.querySelectorAll('button[title="switchSession"]').length
await act(async () => { addButton.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })) })
const headersAfter = manyContainer.querySelectorAll('button[title="switchSession"]').length
checks.push([headersBefore === 6 && headersAfter === 7, 'adding a seventh pane works'])
await act(async () => { manyRoot.unmount() })

// Tiling: dragging the divider between rows re-splits their heights, dragging the
// divider inside a row re-splits its two panes, and even-out resets both.
dom.window.localStorage.setItem('dsh.multi-session.v1', JSON.stringify({
  version: 3,
  panes: [
    { id: 'd1', sessionId: 'session-a' },
    { id: 'd2', sessionId: 'session-b' },
    { id: 'd3', sessionId: null },
  ],
  rows: [['d1'], ['d2', 'd3']],
  rowWeights: [1, 1],
  colWeights: { d1: 1, d2: 1, d3: 1 },
  maximizedId: null,
}))
const dragContainer = document.createElement('div')
document.body.appendChild(dragContainer)
const dragRoot = createRoot(dragContainer)
await act(async () => { dragRoot.render(React.createElement(main.comp, mainProps)) })
stubHost(dragContainer)
const pointer = (type, x, y) => new dom.window.MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y })
const splitBoxes = () => Array.from(dragContainer.querySelectorAll('[data-split]'))
splitBoxes().forEach(box => {
  box.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1200, bottom: 800, width: 1200, height: 800, x: 0, y: 0 })
})

checks.push([splitBoxes().length === 2, 'three panes tile as a nested split tree'])
checks.push([splitBoxes()[0].getAttribute('data-split') === 'col', 'the outer split stacks the lone pane above the pair'])

const horizontal = dragContainer.querySelector('div[style*="row-resize"]')
await act(async () => { horizontal.dispatchEvent(pointer('pointerdown', 600, 400)) })
checks.push([
  dragContainer.querySelector('[data-multisession-host]').style.cursor === 'row-resize',
  'a row divider shows the resize cursor while dragging',
])
await act(async () => { emitWindow('pointermove', { clientX: 600, clientY: 500, cancelable: false }) })
await act(async () => { emitWindow('pointerup', {}) })
const outer = splitBoxes()[0]
checks.push([
  Number(outer.children[0].style.flexGrow) > 0.5,
  'dragging the stacked divider gives the top pane more height',
])

const vertical = dragContainer.querySelector('div[style*="col-resize"]')
await act(async () => { vertical.dispatchEvent(pointer('pointerdown', 800, 600)) })
await act(async () => { emitWindow('pointermove', { clientX: 700, clientY: 600, cancelable: false }) })
await act(async () => { emitWindow('pointerup', {}) })
const inner = splitBoxes().find(box => box.getAttribute('data-split') === 'row')
checks.push([
  Number(inner.children[0].style.flexGrow) < Number(inner.children[2].style.flexGrow),
  'dragging the side-by-side divider trades width inside the row',
])

await sleep(260)
const tiled = JSON.parse(dom.window.localStorage.getItem('dsh.multi-session.v1'))
const storedTree = tiled.tabs[0].tree
checks.push([
  tiled.version === 9 && storedTree.ratio > 0.5 && storedTree.second.ratio < 0.5,
  'the split ratios are persisted on the tree',
])

const autoButton = Array.from(dragContainer.querySelectorAll('button')).find(button => button.getAttribute('title') === 'autoArrange')
await act(async () => { autoButton.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })) })
checks.push([
  Number(splitBoxes()[0].children[0].style.flexGrow) === 0.5,
  'even out restores an even split',
])
await sleep(260)
const evened = JSON.parse(dom.window.localStorage.getItem('dsh.multi-session.v1'))
const evenTree = evened.tabs[0].tree
checks.push([
  evenTree.ratio === 0.5 && evenTree.second.ratio === 0.5,
  'even out clears the stored ratios',
])
await act(async () => { dragRoot.unmount() })

// Maximising must not re-parent or unmount the conversation: every tile stays in the DOM,
// the target becomes an absolute overlay and the rest are hidden.
dom.window.localStorage.setItem('dsh.multi-session.v1', JSON.stringify({
  version: 3,
  panes: [
    { id: 'x1', sessionId: 'session-a' },
    { id: 'x2', sessionId: 'session-b' },
  ],
  rows: [['x1', 'x2']],
  rowWeights: [1],
  colWeights: { x1: 1, x2: 1 },
  maximizedId: null,
}))
const maxContainer = document.createElement('div')
document.body.appendChild(maxContainer)
const maxRoot = createRoot(maxContainer)
await act(async () => { maxRoot.render(React.createElement(main.comp, mainProps)) })
stubHost(maxContainer)
const click = element => act(async () => { element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })) })
await click(maxContainer.querySelector('[data-pane-id="x2"] button[title="maximize"]'))
const maximizedCell = maxContainer.querySelector('[data-pane-id="x2"]')
checks.push([
  maxContainer.querySelectorAll('[data-pane-id]').length === 2 && maximizedCell.style.position === 'absolute',
  'maximising keeps every tile mounted, target becomes an overlay',
])
await click(maxContainer.querySelector('[data-pane-id="x2"] button[title="restore"]'))
checks.push([
  maxContainer.querySelector('[data-pane-id="x2"]').style.position !== 'absolute',
  'restoring puts the tile back into its row',
])
await act(async () => { maxRoot.unmount() })

// Minimising collapses a pane into the strip above the grid; the chip keeps the title.
dom.window.localStorage.setItem('dsh.multi-session.v1', JSON.stringify({
  version: 4,
  panes: [
    { id: 'n1', sessionId: 'session-a' },
    { id: 'n2', sessionId: 'session-b' },
  ],
  rows: [['n1'], ['n2']],
  rowWeights: [1, 1],
  colWeights: { n1: 1, n2: 1 },
  maximizedId: null,
}))
const minContainer = document.createElement('div')
document.body.appendChild(minContainer)
const minRoot = createRoot(minContainer)
await act(async () => { minRoot.render(React.createElement(main.comp, mainProps)) })
stubHost(minContainer)
await click(minContainer.querySelector('[data-pane-id="n1"] button[title="minimize"]'))
const chip = minContainer.querySelector('[data-minimized-id="n1"]')
checks.push([
  !!chip && chip.textContent.includes('标题甲') && !minContainer.querySelector('[data-pane-id="n1"]'),
  'minimising collapses the pane into a chip that keeps its title',
])
checks.push([!!minContainer.querySelector('[data-pane-id="n2"]'), 'the neighbouring pane keeps its cell'])
await sleep(260)
const minimizedStore = JSON.parse(dom.window.localStorage.getItem('dsh.multi-session.v1'))
checks.push([
  minimizedStore.version === 9 && minimizedStore.tabs[0].panes.find(pane => pane.id === 'n1').minimized === true,
  'the collapsed flag is persisted',
])
await click(chip)
checks.push([!!minContainer.querySelector('[data-pane-id="n1"]'), 'clicking the chip restores the pane'])
await click(minContainer.querySelector('[data-pane-id="n1"] button[title="minimize"]'))
await click(minContainer.querySelector('[data-pane-id="n2"] button[title="minimize"]'))
checks.push([
  minContainer.textContent.includes('allMinimized') &&
    minContainer.querySelectorAll('[data-minimized-id]').length === 2,
  'collapsing every pane keeps both titles in the strip',
])
await act(async () => { minRoot.unmount() })

// Immersive mode lifts the whole panel out of the frame and remembers the choice.
dom.window.localStorage.setItem('dsh.multi-session.v1', JSON.stringify({
  version: 5,
  panes: [{ id: 'i1', sessionId: 'session-a' }],
  rows: [['i1']],
  rowWeights: [1],
  colWeights: { i1: 1 },
  maximizedId: null,
  immersive: false,
}))
const immContainer = document.createElement('div')
document.body.appendChild(immContainer)
const immRoot = createRoot(immContainer)
await act(async () => { immRoot.render(React.createElement(main.comp, mainProps)) })
stubHost(immContainer)
await click(immContainer.querySelector('button[aria-label="immersive"]'))
const immersiveRoot = immContainer.querySelector('[data-immersive]')
checks.push([!!immersiveRoot && immersiveRoot.style.position === 'fixed', 'immersive lifts the panel into a fixed overlay'])
checks.push([
  !!immersiveRoot && immersiveRoot.style.getPropertyValue('--ms-accent').trim() === 'var(--dsw-alias-state-success-primary)',
  'the panel scopes its own palette onto the root',
])
checks.push([
  !!immersiveRoot && immersiveRoot.getAttribute('data-theme') === 'harness',
  'the board starts on the platform skin',
])
await sleep(260)
const immersiveStore = JSON.parse(dom.window.localStorage.getItem('dsh.multi-session.v1'))
checks.push([immersiveStore.immersive === true, 'the immersive flag is persisted'])
await act(async () => { emitWindow('keydown', { key: 'Escape' }) })
checks.push([
  immContainer.querySelector('[data-immersive]') === null && !!immContainer.querySelector('[data-pane-id="i1"]'),
  'Esc leaves immersive without touching the grid',
])
await act(async () => { immRoot.unmount() })

// Browser-like tabs: each tab carries its own whole board.
dom.window.localStorage.setItem('dsh.multi-session.v1', JSON.stringify({
  version: 6,
  activeTabId: 't1',
  immersive: false,
  theme: 'claude',
  tabs: [
    {
      id: 't1',
      title: '第一个',
      panes: [{ id: 'tabpane1', sessionId: 'session-a' }],
      rows: [['tabpane1']],
      rowWeights: [1],
      colWeights: { tabpane1: 1 },
      maximizedId: null,
    },
    {
      id: 't2',
      title: '第二个',
      panes: [{ id: 'tabpane2', sessionId: 'session-b' }],
      rows: [['tabpane2']],
      rowWeights: [1],
      colWeights: { tabpane2: 1 },
      maximizedId: null,
    },
  ],
}))
const tabContainer = document.createElement('div')
document.body.appendChild(tabContainer)
const tabRoot = createRoot(tabContainer)
await act(async () => { tabRoot.render(React.createElement(main.comp, mainProps)) })
stubHost(tabContainer)

checks.push([
  tabContainer.querySelectorAll('[data-tab-id]').length === 2 &&
    !!tabContainer.querySelector('[data-pane-id="tabpane1"]') &&
    !tabContainer.querySelector('[data-pane-id="tabpane2"]'),
  'only the active tab renders its own board',
])

const firstPaneBefore = tabContainer.querySelector('[data-pane-id="tabpane1"]')
await click(tabContainer.querySelector('[data-tab-id="t2"]'))
const firstBoard = tabContainer.querySelector('[data-board-id="t1"]')
checks.push([
  !!tabContainer.querySelector('[data-pane-id="tabpane2"]') &&
    !!firstBoard && firstBoard.style.display === 'none',
  'switching a tab shows the other board and hides the first',
])
checks.push([
  !!firstBoard && firstBoard.textContent.includes('tabDormant'),
  'an inactive tab keeps its grid but drops the live conversation',
])

/* Two panes may point at one session, but only one live composer is allowed. */
dom.window.localStorage.setItem('dsh.multi-session.v1', JSON.stringify({
  version: 7,
  activeTabId: 's1',
  immersive: false,
  density: 'compact',
  tabs: [{
    id: 's1',
    title: '',
    panes: [
      { id: 'dup1', sessionId: 'session-a' },
      { id: 'dup2', sessionId: 'session-a' },
    ],
    rows: [['dup1', 'dup2']],
    rowWeights: [1],
    colWeights: { dup1: 1, dup2: 1 },
    maximizedId: null,
  }],
}))
const dupContainer = document.createElement('div')
document.body.appendChild(dupContainer)
const dupRoot = createRoot(dupContainer)
await act(async () => { dupRoot.render(React.createElement(main.comp, mainProps)) })
checks.push([
  dupContainer.querySelector('[data-pane-id="dup2"]').textContent.includes('duplicatePane'),
  'a session bound twice shows a notice instead of a second composer',
])
await act(async () => { dupRoot.unmount() })
dom.window.localStorage.setItem('dsh.multi-session.v1', JSON.stringify({
  version: 7,
  activeTabId: 't1',
  immersive: false,
  density: 'compact',
  tabs: [{
    id: 't1', title: '甲', panes: [{ id: 'tabpane1', sessionId: 'session-a' }],
    rows: [['tabpane1']], rowWeights: [1], colWeights: { tabpane1: 1 }, maximizedId: null,
  }, {
    id: 't2', title: '乙', panes: [{ id: 'tabpane2', sessionId: 'session-b' }],
    rows: [['tabpane2']], rowWeights: [1], colWeights: { tabpane2: 1 }, maximizedId: null,
  }],
}))

await click(tabContainer.querySelector('button[aria-label="newTab"]'))
checks.push([
  tabContainer.querySelectorAll('[data-tab-id]').length === 3,
  'the plus button opens another tab',
])
checks.push([
  tabContainer.querySelectorAll('[data-board-id]').length <= 3,
  'the mounted board budget caps how many tabs stay alive',
])

await act(async () => { await sleep(260) })
const tabStore = JSON.parse(dom.window.localStorage.getItem('dsh.multi-session.v1'))
const newestTab = tabStore.tabs[tabStore.tabs.length - 1]
checks.push([
  Array.isArray(newestTab.panes) && newestTab.panes.length === 1 &&
    newestTab.panes.every(pane => pane.sessionId === null),
  'a new tab starts empty instead of copying the current one',
])
checks.push([
  tabStore.theme === 'claude' && tabContainer.querySelector('[data-theme]').getAttribute('data-theme') === 'claude',
  'a new tab keeps the chosen skin',
])
checks.push([
  tabStore.version === 9 && tabStore.tabs.length === 3 && typeof tabStore.activeTabId === 'string',
  'all tabs are persisted together',
])

await click(tabContainer.querySelector('[data-tab-id="t1"] [aria-label="closeTab"]'))
checks.push([
  tabContainer.querySelectorAll('[data-tab-id]').length === 2 &&
    !tabContainer.querySelector('[data-tab-id="t1"]'),
  'closing a tab removes it from the strip',
])

const renameTarget = tabContainer.querySelector('[data-tab-id="t2"]')
await act(async () => {
  renameTarget.dispatchEvent(new dom.window.MouseEvent('dblclick', { bubbles: true }))
})
const renameInput = tabContainer.querySelector('[data-tab-id="t2"] input')
let renamed = false
if (renameInput) {
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set
  await act(async () => {
    setter.call(renameInput, '改过的名字')
    renameInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
  })
  await act(async () => {
    renameInput.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  })
  renamed = tabContainer.textContent.includes('改过的名字')
}
checks.push([renamed, 'double-clicking a tab renames it'])

// Dragging a tab onto another one reorders the strip without switching tabs.
const tabIdsBefore = Array.from(tabContainer.querySelectorAll('[data-tab-id]'))
  .map(element => element.getAttribute('data-tab-id'))
const draggedTab = tabIdsBefore[0]
const targetTab = tabIdsBefore[tabIdsBefore.length - 1]
const tabDragStart = new dom.window.Event('dragstart', { bubbles: true })
Object.defineProperty(tabDragStart, 'dataTransfer', {
  value: { effectAllowed: '', setData: () => {}, getData: () => draggedTab },
})
await act(async () => {
  tabContainer.querySelector('[data-tab-id="' + draggedTab + '"]').dispatchEvent(tabDragStart)
})
await act(async () => {
  tabContainer.querySelector('[data-tab-id="' + targetTab + '"]')
    .dispatchEvent(new dom.window.Event('drop', { bubbles: true, cancelable: true }))
})
await act(async () => { await sleep(260) })
const tabOrder = JSON.parse(dom.window.localStorage.getItem('dsh.multi-session.v1')).tabs.map(tab => tab.id)
checks.push([
  tabOrder.indexOf(draggedTab) > tabOrder.indexOf(targetTab),
  'dragging a tab reorders the strip',
])
await act(async () => { tabRoot.unmount() })

// Panes can hand a session back to the main view, and swap sessions by dragging.
dom.window.localStorage.setItem('dsh.multi-session.v1', JSON.stringify({
  version: 6,
  activeTabId: 'sw1',
  immersive: false,
  tabs: [{
    id: 'sw1',
    title: '交换',
    panes: [{ id: 'p1', sessionId: 'session-a' }, { id: 'p2', sessionId: 'session-b' }],
    rows: [['p1', 'p2']],
    rowWeights: [1],
    colWeights: { p1: 1, p2: 1 },
    maximizedId: null,
  }],
}))
const swapContainer = document.createElement('div')
document.body.appendChild(swapContainer)
const swapRoot = createRoot(swapContainer)
await act(async () => { swapRoot.render(React.createElement(main.comp, mainProps)) })
stubHost(swapContainer)

const mainViewButton = swapContainer.querySelector('[data-pane-id="p1"] button[aria-label="openInMain"]')
checks.push([!!mainViewButton, 'a bound pane offers the open-in-main action'])
if (mainViewButton) await click(mainViewButton)
checks.push([openedInMain[0] === 'session-a', 'open in main hands the bound session to the workspace service'])

const changesButton = swapContainer.querySelector('[data-pane-id="p1"] button[aria-label="changes"]')
checks.push([!!changesButton, 'a bound pane offers the changed-files drawer'])
if (changesButton) await click(changesButton)
const drawerNode = swapContainer.querySelector('[data-changes-drawer]')
checks.push([
  !!drawerNode && drawerNode.textContent.includes('changesEmpty'),
  'the changed-files drawer opens inside the tile',
])

await act(async () => {
  ctx.sidebarRight.openResource('dsh-resource://file/session/session-a/src/a.ts')
})
await act(async () => { await sleep(20) })
const fileDrawer = swapContainer.querySelector('[data-file-drawer]')
checks.push([
  !!fileDrawer && fileDrawer.textContent.includes('first line'),
  'a transcript file link previews inside the tile instead of the right sidebar',
])
checks.push([
  readFiles.length > 0 && readFiles[0][1] === 'src/a.ts',
  'the preview asks the remote workspace reader for the linked path',
])

const drawerHandle = fileDrawer && fileDrawer.querySelector('[data-drawer-handle]')
checks.push([!!drawerHandle, 'a drawer offers a resize grip'])
if (drawerHandle && fileDrawer.parentElement) {
  fileDrawer.parentElement.getBoundingClientRect = () => ({
    left: 0, right: 1000, width: 1000, top: 0, bottom: 600, height: 600, x: 0, y: 0,
  })
  await act(async () => { drawerHandle.dispatchEvent(pointer('mousedown', 700, 300)) })
  await act(async () => { emitWindow('mousemove', pointer('mousemove', 520, 300)) })
  await act(async () => { emitWindow('mouseup', pointer('mouseup', 520, 300)) })
  checks.push([fileDrawer.style.width === '480px', 'dragging the grip resizes the drawer'])
}

const dropEvent = new dom.window.Event('drop', { bubbles: true, cancelable: true })
Object.defineProperty(dropEvent, 'dataTransfer', {
  value: { types: ['text/x-multisession-pane'], getData: () => 'p1' },
})
await act(async () => {
  swapContainer.querySelector('[data-pane-id="p2"]').dispatchEvent(dropEvent)
})
await act(async () => { await sleep(260) })
const swapped = JSON.parse(dom.window.localStorage.getItem('dsh.multi-session.v1'))
const swappedPanes = swapped.tabs[0].panes
checks.push([
  swappedPanes.find(pane => pane.id === 'p1').sessionId === 'session-b' &&
    swappedPanes.find(pane => pane.id === 'p2').sessionId === 'session-a',
  'dropping a pane header on another tile swaps their sessions',
])
await act(async () => { swapRoot.unmount() })

// v0.11 affordances: first-run hint bar, drag handle, instant tooltip and a
// density switch that persists with the rest of the board.
dom.window.localStorage.removeItem('dsh.multi-session.v1')
dom.window.localStorage.removeItem('dsh.multi-session.hint.v1')
const polishContainer = document.createElement('div')
document.body.appendChild(polishContainer)
const polishRoot = createRoot(polishContainer)
await act(async () => { polishRoot.render(React.createElement(main.comp, mainProps)) })
stubHost(polishContainer)

const hintBar = polishContainer.querySelector('[data-hint-bar]')
checks.push([!!hintBar, 'the first visit shows the interaction hints'])
checks.push([
  polishContainer.querySelectorAll('svg circle').length >= 6,
  'every pane header carries a drag handle',
])
const dismissButton = hintBar
  ? Array.from(hintBar.querySelectorAll('button')).find(button => button.textContent === 'hintDismiss')
  : null
if (dismissButton) await click(dismissButton)
checks.push([
  !polishContainer.querySelector('[data-hint-bar]') &&
    dom.window.localStorage.getItem('dsh.multi-session.hint.v1') === '1',
  'dismissing the hints remembers the choice',
])
await click(polishContainer.querySelector('button[aria-label="hintShow"]'))
checks.push([!!polishContainer.querySelector('[data-hint-bar]'), 'the tips button brings the hints back'])

const densityButton = polishContainer.querySelector('button[aria-label="densityComfortable"]')
checks.push([!!densityButton, 'the toolbar offers a density switch'])
if (densityButton) await click(densityButton)
await act(async () => { await sleep(260) })
const denseStore = JSON.parse(dom.window.localStorage.getItem('dsh.multi-session.v1'))
checks.push([
  denseStore.version === 9 && denseStore.density === 'comfortable' &&
    !!polishContainer.querySelector('button[aria-label="densityCompact"]'),
  'density toggles and is stored with the board',
])

// v0.18: the skin picker swaps the scoped palette and remembers the choice.
const themeButton = polishContainer.querySelector('button[aria-label="themeTitle"]')
checks.push([!!themeButton, 'the toolbar offers a theme picker'])
if (themeButton) await click(themeButton)
checks.push([
  polishContainer.querySelectorAll('[data-theme-option]').length === 6,
  'the picker lists every bundled skin',
])
const themeMenuNode = polishContainer.querySelector('[data-theme-menu]')
checks.push([
  !!themeMenuNode && themeMenuNode.style.position === 'fixed',
  'the skin menu escapes the clipped tab strip',
])
const claudeOption = polishContainer.querySelector('[data-theme-option="claude"]')
if (claudeOption) await click(claudeOption)
await act(async () => { await sleep(260) })
const themedStore = JSON.parse(dom.window.localStorage.getItem('dsh.multi-session.v1'))
const themedRoot = polishContainer.firstElementChild
checks.push([
  themedStore.version === 9 && themedStore.theme === 'claude' &&
    !!themedRoot && themedRoot.getAttribute('data-theme') === 'claude' &&
    themedRoot.style.getPropertyValue('--ms-accent').trim() === '#D97757' &&
    themedRoot.style.getPropertyValue('--dsw-alias-bg-base').trim() === '#FAF9F5' &&
    themedRoot.style.getPropertyValue('--dsw-alias-bg-layer-2').trim() === '#EFEDE4' &&
    themedRoot.style.getPropertyValue('--dsw-specific-bubble').trim() === '#EFEDE4' &&
    themedRoot.style.getPropertyValue('--dsw-specific-input-major').trim() === '#EFEDE4' &&
    themedRoot.style.getPropertyValue('--dsw-alias-turn-trigger-bg').trim() === '#EFEDE4',
  'choosing a skin repaints the panel and persists',
])
if (themeButton) await click(themeButton)
const harnessOption = polishContainer.querySelector('[data-theme-option="harness"]')
if (harnessOption) await click(harnessOption)
await act(async () => { await sleep(260) })
checks.push([
  polishContainer.firstElementChild.getAttribute('data-theme') === 'harness' &&
    polishContainer.firstElementChild.style.getPropertyValue('--ms-accent').trim() ===
      'var(--dsw-alias-state-success-primary)',
  'the default skin falls back to the platform palette',
])

const minimizeButton = polishContainer.querySelector('button[aria-label="minimize"]')
if (minimizeButton) {
  await act(async () => {
    minimizeButton.dispatchEvent(new dom.window.MouseEvent('mouseover', { bubbles: true }))
  })
}
checks.push([!!polishContainer.querySelector('[role="tooltip"]'), 'hovering an icon shows a tooltip'])
await act(async () => { polishRoot.unmount() })

// Right-click a pane header to split it: the fresh half starts empty and opens its picker.
dom.window.localStorage.setItem('dsh.multi-session.v1', JSON.stringify({
  version: 9,
  activeTabId: 'tab-split',
  immersive: false,
  density: 'compact',
  theme: 'harness',
  tabs: [{
    id: 'tab-split',
    title: '',
    panes: [{ id: 'sp1', sessionId: 'session-a' }],
    tree: { kind: 'leaf', paneId: 'sp1' },
    maximizedId: null,
  }],
}))
const splitContainer = document.createElement('div')
document.body.appendChild(splitContainer)
const splitRoot = createRoot(splitContainer)
await act(async () => { splitRoot.render(React.createElement(main.comp, mainProps)) })
const splitHeader = splitContainer.querySelector('[data-pane-id="sp1"] div[draggable="true"]')
await act(async () => {
  splitHeader.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 2, clientX: 140, clientY: 90 }))
})

checks.push([!!splitContainer.querySelector('[data-pane-menu]'), 'right-clicking a pane header opens its menu'])
const splitDownItem = Array.from(splitContainer.querySelectorAll('[data-pane-menu] button'))
  .find(button => button.textContent === 'splitDown')
if (splitDownItem) await click(splitDownItem)
checks.push([
  splitContainer.querySelectorAll('[data-pane-id]').length === 2 &&
    !!splitContainer.querySelector('[data-split="col"]'),
  'split down adds an empty pane under the current one',
])
await act(async () => { await sleep(260) })
const splitStore = JSON.parse(dom.window.localStorage.getItem('dsh.multi-session.v1'))
checks.push([
  splitStore.tabs[0].tree.kind === 'split' && splitStore.tabs[0].tree.axis === 'col' &&
    splitStore.tabs[0].panes.length === 2 &&
    splitStore.tabs[0].panes.filter(pane => pane.sessionId === null).length === 1,
  'the split is stored as a tree and the new half is empty',
])
await act(async () => { splitRoot.unmount() })

let failed = false
for (const [ok, label] of checks) {
  console.log((ok ? 'ok  -' : 'FAIL:') + ' ' + label)
  if (!ok) failed = true
}
console.log(failed ? 'RENDER SMOKE FAILED' : 'RENDER SMOKE OK')
if (failed) process.exitCode = 1

