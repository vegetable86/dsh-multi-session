/**
 * Builds the publishable copy of this plugin.
 *
 * The working copy stays `@local/dsh-multi-session` so the profile's link install
 * keeps pointing at the source tree. Publishing needs a name you actually own, and
 * the client bundle's factory id must equal that package name, so the release copy
 * is generated here instead of being maintained by hand.
 *
 *   node scripts/pack-release.mjs [--name @scope/name] [--out dist/release]
 */
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const argv = process.argv.slice(2)
const flag = (name, fallback) => {
  const index = argv.indexOf('--' + name)
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback
}

const source = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const target = flag('name', '@vegataa/' + source.name.split('/').pop())
const outDir = join(root, flag('out', 'dist/release'))

rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

const files = ['index.js', 'client.js', 'cordis.patch.yml', 'icon.svg', 'icon.png', 'README.md']
for (const file of files) cpSync(join(root, file), join(outDir, file))
mkdirSync(join(outDir, 'locale'), { recursive: true })
for (const file of readdirSync(join(root, 'locale'))) {
  if (file.endsWith('.json')) cpSync(join(root, 'locale', file), join(outDir, 'locale', file))
}

// package.json: rename, and drop dev-only fields the published package cannot use.
const manifest = {
  name: target,
  version: source.version,
  description: source.description,
  type: source.type,
  exports: source.exports,
  files: source.files,
  keywords: source.keywords,
  publishConfig: source.publishConfig,
  dsh: source.dsh,
  repository: source.repository,
  homepage: source.homepage,
  author: source.author,
  license: source.license,
  icon: source.icon,
}
writeFileSync(join(outDir, 'package.json'), JSON.stringify(manifest, null, 2) + '\n')

// The bundle id is asserted by the host loader, so it must follow the package name.
const bundlePath = join(outDir, 'client.js')
const bundle = readFileSync(bundlePath, 'utf8')
const renamed = bundle.replace(
  "id: '" + source.name + "'",
  "id: '" + target + "'",
)
if (renamed === bundle) throw new Error('client.js: bundle id not found for ' + source.name)
writeFileSync(bundlePath, renamed)

const patchPath = join(outDir, 'cordis.patch.yml')
const patch = readFileSync(patchPath, 'utf8').replace(source.name, target)
writeFileSync(patchPath, patch)

const readmePath = join(outDir, 'README.md')
writeFileSync(readmePath, readFileSync(readmePath, 'utf8').split(source.name).join(target))

console.log('release ready:', outDir)
console.log('  name   :', target)
console.log('  version:', source.version)
