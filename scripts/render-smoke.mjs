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
const stubCanvas = scope => {
  const canvas = scope.querySelector('[data-multisession-canvas]')
  if (canvas) {
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1200, height: 800, right: 1200, bottom: 800, x: 0, y: 0 })
  }
  return canvas
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
await act(async () => {
  createButton.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
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

const iconContainer = document.createElement('div')
const iconRoot = createRoot(iconContainer)
await act(async () => { iconRoot.render(React.createElement(icon.comp, { size: 16, active: false })) })
const iconHtml = iconContainer.innerHTML

const checks = [
  [bundle.id === '@local/dsh-multi-session', 'bundle id'],
  [mainHtml.includes('标题甲') && mainHtml.includes('标题乙'), 'main renders both pane titles'],
  [mainHtml.includes('data-slot="multisession.pane"'), 'each pane renders the owned session slot'],
  [!!paneBox(container, 'p1') && paneBox(container, 'p1').left === '0px' && paneBox(container, 'p2').left === '600px' && paneBox(container, 'p1').width === '590px', 'two panes fill a wide panel instead of leaving a dead column'],
  [mainHtml.includes('data-provider="true"'), 'SessionProvider receives a retained reference'],
  [(mainHtml.match(/data-provider="true"/g) || []).length === 2, 'two session providers for two panes'],
  [releasesBeforeCreate === 0, 'references stay retained while mounted'],
  [paneHtml.includes('data-factory="conversation.content"'), 'pane renders conversation.content factory'],
  [paneHtml.includes('data-variant="embedded"'), 'factory variant is embedded'],
  [paneHtml.includes('data-phase="active"'), 'phase is active for a running session'],
  [paneHtml.includes('data-view="function"'), 'views slot override is a component'],
  [iconHtml.includes('<svg'), 'sidebar icon renders svg'],
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
await act(async () => {
  emptyCreate.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
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
  !!paneBox(manyContainer, 'm2') && paneBox(manyContainer, 'm2').left === '800px' && paneBox(manyContainer, 'm2').width === '390px',
  'a wide panel fits six panes in three columns',
])
checks.push([!!addButton && !addButton.disabled, 'add button stays enabled past four panes'])
checks.push([manyContainer.textContent.includes('6 paneCount'), 'toolbar reports the pane count without a cap'])
const headersBefore = manyContainer.querySelectorAll('button[title="switchSession"]').length
await act(async () => { addButton.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })) })
const headersAfter = manyContainer.querySelectorAll('button[title="switchSession"]').length
checks.push([headersBefore === 6 && headersAfter === 7, 'adding a seventh pane works'])
await act(async () => { manyRoot.unmount() })

// Free canvas: the title bar moves one pane, the corner grip resizes only that
// pane, and auto-arrange drops every manual rectangle.
dom.window.localStorage.setItem('dsh.multi-session.v1', JSON.stringify({
  version: 2,
  panes: [
    { id: 'd1', sessionId: 'session-a' },
    { id: 'd2', sessionId: 'session-b' },
  ],
  maximizedId: null,
}))
const dragContainer = document.createElement('div')
document.body.appendChild(dragContainer)
const dragRoot = createRoot(dragContainer)
await act(async () => { dragRoot.render(React.createElement(main.comp, mainProps)) })
stubCanvas(dragContainer)
const pointer = (type, x, y) => new dom.window.MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y })
const header = dragContainer.querySelector('[data-pane-id="d1"] > div')
await act(async () => { header.dispatchEvent(pointer('pointerdown', 100, 100)) })
await act(async () => { emitWindow('pointermove', { clientX: 220, clientY: 100, cancelable: false }) })
await act(async () => { emitWindow('pointerup', {}) })
checks.push([paneBox(dragContainer, 'd1').left === '120px', 'dragging the title bar moves one pane'])
checks.push([paneBox(dragContainer, 'd2').left === '600px', 'moving one pane leaves its neighbour alone'])

await sleep(260)
const dragged = JSON.parse(dom.window.localStorage.getItem('dsh.multi-session.v1'))
checks.push([
  dragged.version === 2 && !!dragged.panes[0].rect && Math.abs(dragged.panes[0].rect.x - 0.1) < 0.01,
  'the dragged rectangle is persisted as a fraction',
])

const grip = dragContainer.querySelector('[data-multisession-canvas] div[style*="nwse-resize"]')
await act(async () => { grip.dispatchEvent(pointer('pointerdown', 600, 700)) })
await act(async () => { emitWindow('pointermove', { clientX: 700, clientY: 700, cancelable: false }) })
await act(async () => { emitWindow('pointerup', {}) })
checks.push([paneBox(dragContainer, 'd1').width === '694px', 'dragging the corner grip resizes only that pane'])
checks.push([paneBox(dragContainer, 'd2').width === '590px', 'resizing one pane leaves its neighbour alone'])

const autoButton = Array.from(dragContainer.querySelectorAll('button')).find(button => button.getAttribute('title') === 'autoArrange')
await act(async () => { autoButton.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })) })
checks.push([
  paneBox(dragContainer, 'd1').left === '0px' && paneBox(dragContainer, 'd1').width === '590px',
  'auto arrange restores the tidy grid',
])
await sleep(260)
const arranged = JSON.parse(dom.window.localStorage.getItem('dsh.multi-session.v1'))
checks.push([arranged.panes.every(item => !item.rect), 'auto arrange clears the stored geometry'])
await act(async () => { dragRoot.unmount() })

let failed = false
for (const [ok, label] of checks) {
  console.log((ok ? 'ok  -' : 'FAIL:') + ' ' + label)
  if (!ok) failed = true
}
console.log(failed ? 'RENDER SMOKE FAILED' : 'RENDER SMOKE OK')
if (failed) process.exitCode = 1
