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
const sandbox = {
  window: {
    __ModuleLoader__: { load: b => { bundle = b } },
    localStorage: dom.window.localStorage,
    addEventListener() {},
    removeEventListener() {},
  },
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
await act(async () => {
  root_.render(React.createElement(main.comp, {
    t: key => key,
    sessions: ctx.sessions,
    useSessions,
    SessionProvider: props => React.createElement('div', { 'data-provider': String(!!props.session) }, props.children),
    renderSlot: name => React.createElement('div', { 'data-slot': name }, 'session slot'),
    renderFactorySlot: () => React.createElement('div', null, 'factory'),
    usePanelInfo: () => ({ id: 'multisession' }),
  }))
})

const mainHtml = container.innerHTML

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
  [mainHtml.includes('data-provider="true"'), 'SessionProvider receives a retained reference'],
  [(mainHtml.match(/data-provider="true"/g) || []).length === 2, 'two session providers for two panes'],
  [releases.length === 0, 'references stay retained while mounted'],
  [paneHtml.includes('data-factory="conversation.content"'), 'pane renders conversation.content factory'],
  [paneHtml.includes('data-variant="embedded"'), 'factory variant is embedded'],
  [paneHtml.includes('data-phase="active"'), 'phase is active for a running session'],
  [paneHtml.includes('data-view="function"'), 'views slot override is a component'],
  [iconHtml.includes('<svg'), 'sidebar icon renders svg'],
]

await act(async () => { root_.unmount() })
checks.push([releases.length === 2 && releases.includes('session-a') && releases.includes('session-b'), 'unmount releases both references'])

let failed = false
for (const [ok, label] of checks) {
  console.log((ok ? 'ok  -' : 'FAIL:') + ' ' + label)
  if (!ok) failed = true
}
console.log(failed ? 'RENDER SMOKE FAILED' : 'RENDER SMOKE OK')
if (failed) process.exitCode = 1
