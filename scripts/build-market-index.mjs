/**
 * Build a format-1 plugin market index for this plugin.
 *
 * The index is what DSH's Discover page reads from an "index source" URL, so a
 * single self-published file is enough to make the plugin appear in a market
 * without waiting for a curated catalog to accept it.
 *
 * Usage: node scripts/build-market-index.mjs [--out market/index.json]
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseMarketIndex, marketInstallTarget } from '@deepseek-ai/dsh-plugin-market-index'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const NAME = '@vegataa/dsh-multi-session'
const SKIP_VERSIONS = new Set(['0.0.0-stage'])

const outArg = process.argv.indexOf('--out')
const outFile = resolve(root, outArg > 0 ? process.argv[outArg + 1] : 'market/index.json')

const readJson = async (rel) => JSON.parse(await readFile(resolve(root, rel), 'utf8'))

const [localeEn, localeZh] = await Promise.all([readJson('locale/en.json'), readJson('locale/zh.json')])
const pkg = await readJson('package.json')
const iconSvg = await readFile(resolve(root, 'icon.svg'))

const registry = 'https://registry.npmjs.org/'
const response = await fetch(registry + encodeURIComponent(NAME))
if (!response.ok) throw new Error(`registry ${response.status} for ${NAME}`)
const doc = await response.json()

const versions = Object.keys(doc.versions)
  .filter((version) => {
    if (SKIP_VERSIONS.has(version)) return false
    const manifest = doc.versions[version]
    if (!doc.time?.[version]) return false
    if (manifest.deprecated) return false
    return typeof manifest.dsh?.bundle?.patch === 'string'
  })
  .map((version) => {
    const manifest = doc.versions[version]
    const entry = {
      version,
      publishTimestamp: Math.floor(Date.parse(doc.time[version]) / 1000),
      source: { type: 'npm' },
    }
    const dshEngine = manifest.engines?.dsh
    if (typeof dshEngine === 'string' && dshEngine.trim() !== '') entry.engines = { dsh: dshEngine.trim() }
    return entry
  })

if (versions.length === 0) throw new Error(`no publishable versions for ${NAME}`)

const latest = doc['dist-tags']?.latest
const distTags = {}
if (latest && versions.some((entry) => entry.version === latest)) distTags.latest = latest

const index = {
  format: 1,
  title: { en: 'Multi-Session Market', zh: '多会话插件市场' },
  description: {
    en: 'A market index with the multi-session split view plugin for DeepSeek Harness.',
    zh: '仅收录 DeepSeek Harness 多会话分屏插件的市场索引。',
  },
  plugins: [
    {
      name: NAME,
      title: {
        en: localeEn.meta?.title ?? pkg.name,
        zh: localeZh.meta?.title ?? localeEn.meta?.title ?? pkg.name,
      },
      description: {
        en: localeEn.meta?.description ?? pkg.description ?? '',
        zh: localeZh.meta?.description ?? localeEn.meta?.description ?? pkg.description ?? '',
      },
      icon: `data:image/svg+xml;base64,${iconSvg.toString('base64')}`,
      author: 'vegataa',
      metadata: {
        keywords: Array.isArray(pkg.keywords) ? pkg.keywords : [],
      },
      ...(Object.keys(distTags).length > 0 ? { 'dist-tags': distTags } : {}),
      versions,
    },
  ],
}

// Validate exactly as DSH would, against the URL this file is meant to live at.
const indexUrl = process.env.MARKET_INDEX_URL ?? 'https://cdn.jsdelivr.net/npm/@vegataa/dsh-multi-session-market@1/index.json'
const parsed = parseMarketIndex(index, indexUrl)

await mkdir(dirname(outFile), { recursive: true })
await writeFile(outFile, JSON.stringify(index, null, 2) + '\n', 'utf8')

const plugin = parsed.plugins[0]
const newest = plugin.versions[0]
const target = marketInstallTarget(plugin.name, newest)
console.log(`index written: ${outFile}`)
console.log(`plugins: ${parsed.plugins.length}, versions: ${plugin.versions.map((v) => v.version).join(', ')}`)
console.log(`icon bytes: ${iconSvg.length} (inline ${parsed.plugins[0].icon.startsWith('data:') ? 'data URL' : 'reference'})`)
console.log(`install target: ${target.spec}${target.registry ? ' @ ' + target.registry : ''}`)
