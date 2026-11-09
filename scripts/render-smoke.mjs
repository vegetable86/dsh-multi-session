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
  ids: ['session-a', 'session-b'],
  byId: {
    'session-a': { id: 'session-a', displayTitle: '标题甲', updatedAt: 200, running: true, blank: false },
    'session-b': { id: 'session-b', displayTitle: '标题乙', updatedAt: 100, running: false, blank: false },
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
  [rowOf(container, 'p1') === rowOf(container, 'p2') && paneBox(container, 'p1').flexGrow === '1', 'two panes share one row with equal weight'],
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
    rowOf(manyContainer, 'm0') === rowOf(manyContainer, 'm1') &&
    rowOf(manyContainer, 'm0') !== rowOf(manyContainer, 'm2'),
  'six panes tile as three rows of two',
])
checks.push([!!addButton && !addButton.disabled, 'add button stays enabled past four panes'])
checks.push([manyContainer.textContent.includes('6 paneCount'), 'toolbar reports the pane count without a cap'])
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
const rowDivs = () => Array.from(dragContainer.querySelectorAll('[data-multisession-host] div'))
  .filter(element => element.style.flexDirection === 'row' && element.style.display === 'flex')
const weight = id => Number(paneBox(dragContainer, id).flexGrow)

checks.push([rowDivs().length === 2, 'three panes tile as two rows'])
checks.push([rowDivs()[0].contains(dragContainer.querySelector('[data-pane-id="d1"]')), 'the lone pane owns the first row'])

const horizontal = dragContainer.querySelector('[data-multisession-host] div[style*="row-resize"]')
await act(async () => { horizontal.dispatchEvent(pointer('pointerdown', 600, 400)) })
await act(async () => { emitWindow('pointermove', { clientX: 600, clientY: 500, cancelable: false }) })
await act(async () => { emitWindow('pointerup', {}) })
const firstRowWeight = Number(rowDivs()[0].style.flexGrow)
const secondRowWeight = Number(rowDivs()[1].style.flexGrow)
checks.push([
  firstRowWeight > secondRowWeight && Math.abs(firstRowWeight + secondRowWeight - 2) < 0.01,
  'dragging the row divider trades height between the two rows',
])

const vertical = dragContainer.querySelector('[data-multisession-host] div[style*="col-resize"]')
await act(async () => { vertical.dispatchEvent(pointer('pointerdown', 800, 600)) })
await act(async () => { emitWindow('pointermove', { clientX: 700, clientY: 600, cancelable: false }) })
await act(async () => { emitWindow('pointerup', {}) })
checks.push([
  weight('d2') < weight('d3') && Math.abs(weight('d2') + weight('d3') - 2) < 0.01,
  'dragging the column divider trades width inside one row',
])

await sleep(260)
const tiled = JSON.parse(dom.window.localStorage.getItem('dsh.multi-session.v1'))
checks.push([
  tiled.version === 4 && tiled.rowWeights[0] > tiled.rowWeights[1] && tiled.colWeights.d2 < tiled.colWeights.d3,
  'the split weights are persisted',
])

const autoButton = Array.from(dragContainer.querySelectorAll('button')).find(button => button.getAttribute('title') === 'autoArrange')
await act(async () => { autoButton.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })) })
checks.push([
  Number(rowDivs()[0].style.flexGrow) === 1 && weight('d2') === 1 && weight('d3') === 1,
  'even out restores an even split',
])
await sleep(260)
const evened = JSON.parse(dom.window.localStorage.getItem('dsh.multi-session.v1'))
checks.push([
  evened.rowWeights.every(item => item === 1) && Object.values(evened.colWeights).every(item => item === 1),
  'even out clears the stored weights',
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
  minimizedStore.version === 4 && minimizedStore.panes.find(pane => pane.id === 'n1').minimized === true,
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

let failed = false
for (const [ok, label] of checks) {
  console.log((ok ? 'ok  -' : 'FAIL:') + ' ' + label)
  if (!ok) failed = true
}
console.log(failed ? 'RENDER SMOKE FAILED' : 'RENDER SMOKE OK')
if (failed) process.exitCode = 1
