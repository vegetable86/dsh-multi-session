import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import vm from 'node:vm'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

let bundle
const React = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  Component: class {
    constructor(p) {
      this.props = p
      this.state = {}
    }
  },
  Fragment: 'Fragment',
  memo: component => component,
  useState: v => [typeof v === 'function' ? v() : v, () => {}],
  useEffect: () => {},
  useLayoutEffect: () => {},
  useMemo: f => f(),
  useRef: v => ({ current: v }),
  useCallback: f => f,
  useContext: () => null,
  createContext: () => ({ Provider: 'Provider', Consumer: 'Consumer' }),
}

function load() {
  const source = readFileSync(join(root, 'client.js'), 'utf8')
  const sandbox = {
    window: { __ModuleLoader__: { load: b => { bundle = b } }, localStorage: undefined, addEventListener() {}, removeEventListener() {} },
    console,
    setTimeout,
    clearTimeout,
    Date,
    JSON,
    Number,
    String,
    Set,
    Math,
  }
  vm.runInNewContext(source, sandbox, { filename: 'client.js' })
  return bundle
}

const assert = (cond, msg) => {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exitCode = 1
  } else {
    console.log('ok  -', msg)
  }
}

load()
assert(bundle !== undefined, 'bundle loaded through __ModuleLoader__')
assert(bundle && bundle.id === '@local/dsh-multi-session', 'bundle id equals package name')

const registrations = []
const injections = []
const localeRegistrations = []
const retained = []
const ctx = {
  effect: fn => {
    const dispose = fn()
    return typeof dispose === 'function' ? dispose : () => {}
  },
  locale: {
    register: (ns, dicts) => { localeRegistrations.push({ ns, dicts }); return () => {} },
    bind: ns => key => `${ns}.${key}`,
  },
  slots: {
    inject: (name, cb) => { injections.push(name); cb(); return () => {} },
    register: (opts, comp) => { registrations.push({ opts, comp }); return () => {} },
  },
  sessions: {
    list: { getSnapshot: () => ({ ids: [], byId: {}, phase: 'ready' }) },
    retain: (id, options) => {
      const ref = { sessionId: id, options, released: false, release() { this.released = true } }
      retained.push(ref)
      return ref
    },
  },
}

const mod = bundle.factory(p => {
  if (p === 'react') return React
  throw new Error('bundle must not require anything but react, got: ' + p)
})
assert(JSON.stringify(mod.inject) === JSON.stringify(['slots', 'locale', 'sessions']), 'client inject list is slots/locale/sessions')
mod.apply(ctx)

const main = registrations.find(r => r.opts.name === 'main')
const pane = registrations.find(r => r.opts.name === 'multisession.pane')
const icon = registrations.find(r => r.opts.name === 'sidebar.panellist')

assert(main !== undefined, 'main panel registration exists')
assert(main && main.opts.key === 'multisession', 'main panel key is multisession')
assert(main && typeof main.comp === 'function', 'main panel component is a function')
assert(main && main.opts.children && main.opts.children['multisession.pane'], 'main declares multisession.pane child')
assert(main && main.opts.children['multisession.pane'].kind === 'single', 'pane slot kind is single')
assert(main && main.opts.children['multisession.pane'].scope === 'session', 'pane slot scope is session')
assert(pane !== undefined && typeof pane.comp === 'function', 'pane component registered')
assert(icon !== undefined, 'sidebar panellist registration exists')
assert(icon && icon.opts.id === 'multisession', 'sidebar icon id equals panel key')
assert(icon && typeof icon.opts.label === 'function', 'sidebar label is lazy for i18n')
assert(icon && typeof icon.comp === 'function', 'sidebar icon component is a function')
assert(injections.includes('main') && injections.includes('sidebar.panellist'), 'registers through inject on host slots')
assert(localeRegistrations.length === 1 && localeRegistrations[0].ns === 'multisession', 'locale namespace registered')
const dicts = localeRegistrations[0] && localeRegistrations[0].dicts
assert(dicts && dicts.zh && dicts.en, 'zh and en dictionaries present')
const zhKeys = Object.keys(dicts.zh).sort()
const enKeys = Object.keys(dicts.en).sort()
assert(JSON.stringify(zhKeys) === JSON.stringify(enKeys), 'zh/en dictionary keys match')

console.log(process.exitCode ? 'SMOKE FAILED' : 'SMOKE OK')
