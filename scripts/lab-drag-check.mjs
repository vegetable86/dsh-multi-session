import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'

const html = readFileSync('docs/drafts/motion-lab.html', 'utf8')
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  beforeParse(window) {
    window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
    window.Element.prototype.animate = function () { return { onfinish: null, finished: Promise.resolve() } }
  },
})
const { window } = dom
const { document } = window
const stage = document.getElementById('stage')
Object.defineProperty(stage, 'clientWidth', { value: 1200 })
Object.defineProperty(stage, 'clientHeight', { value: 760 })
stage.getBoundingClientRect = () => ({ left: 0, top: 100, width: 1200, height: 760, right: 1200, bottom: 860, x: 0, y: 100 })
window.dispatchEvent(new window.Event('resize'))

const panes = () => [...document.querySelectorAll('.pane')]
const widths = () => panes().map(p => parseFloat(p.style.width))
const before = widths()
const split = document.querySelector('.split[data-key="c"]')
console.log('split found:', !!split, 'before:', before.join(','))

const down = new window.MouseEvent('pointerdown', { bubbles: true, clientX: 600, clientY: 500 })
split.dispatchEvent(down)
const move = new window.MouseEvent('pointermove', { bubbles: true, clientX: 900, clientY: 500 })
split.dispatchEvent(move)
window.dispatchEvent(new window.MouseEvent('pointerup', { bubbles: true }))
const after = widths()
console.log('after:', after.join(','))
console.log('first bottom pane grew:', after[1] > before[1])
console.log('second bottom pane shrank:', after[2] < before[2])

const rowSplit = document.querySelector('.split[data-key="r"]')
const heightsBefore = panes().map(p => parseFloat(p.style.height))
rowSplit.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, clientY: 400 }))
rowSplit.dispatchEvent(new window.MouseEvent('pointermove', { bubbles: true, clientY: 620 }))
window.dispatchEvent(new window.MouseEvent('pointerup', { bubbles: true }))
const heightsAfter = panes().map(p => parseFloat(p.style.height))
console.log('row drag moved boundary:', heightsBefore[0] !== heightsAfter[0], heightsBefore[0], '->', heightsAfter[0])
