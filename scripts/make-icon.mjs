// Generates icon.png (256x256) from the same geometry as icon.svg.
// No dependencies: the drawing is rasterised by hand and encoded as PNG.
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

const SIZE = 256
const SS = 4 // supersampling factor per axis
const VIEW = 64 // icon.svg viewBox

const BLUE = [59, 110, 245]

function roundedRectDistance(px, py, cx, cy, hx, hy, r) {
  const qx = Math.abs(px - cx) - hx + r
  const qy = Math.abs(py - cy) - hy + r
  const ax = Math.max(qx, 0)
  const ay = Math.max(qy, 0)
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - r
}

function segmentDistance(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1
  const dy = y2 - y1
  const lengthSquared = dx * dx + dy * dy
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSquared))
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}

function covered(x, y) {
  const stroke = 2 // half of the 4-unit stroke
  if (Math.abs(roundedRectDistance(x, y, 32, 32, 26, 20, 6)) <= stroke) return true
  if (segmentDistance(x, y, 26, 12, 26, 52) <= stroke) return true
  if (segmentDistance(x, y, 26, 38, 58, 38) <= stroke) return true
  return false
}

const pixels = Buffer.alloc(SIZE * SIZE * 4)
for (let py = 0; py < SIZE; py++) {
  for (let px = 0; px < SIZE; px++) {
    let hits = 0
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const x = ((px + (sx + 0.5) / SS) / SIZE) * VIEW
        const y = ((py + (sy + 0.5) / SS) / SIZE) * VIEW
        if (covered(x, y)) hits++
      }
    }
    const offset = (py * SIZE + px) * 4
    const alpha = Math.round((hits / (SS * SS)) * 255)
    pixels[offset] = BLUE[0]
    pixels[offset + 1] = BLUE[1]
    pixels[offset + 2] = BLUE[2]
    pixels[offset + 3] = alpha
  }
}

const crcTable = new Int32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  crcTable[n] = c
}
function crc32(buffer) {
  let c = 0xffffffff
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

const header = Buffer.alloc(13)
header.writeUInt32BE(SIZE, 0)
header.writeUInt32BE(SIZE, 4)
header[8] = 8 // bit depth
header[9] = 6 // colour type: RGBA
header[10] = 0
header[11] = 0
header[12] = 0

const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1))
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0 // filter: none
  pixels.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4)
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', header),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
])

writeFileSync(new URL('../icon.png', import.meta.url), png)
console.log('icon.png written:', png.length, 'bytes')
