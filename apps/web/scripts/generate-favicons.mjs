import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import { Buffer } from "node:buffer"
import { fileURLToPath } from "node:url"
import { chromium } from "@playwright/test"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const publicDir = path.resolve(__dirname, "../public")
const appDir = path.resolve(__dirname, "../app")

function createIco(pngEntries) {
  // pngEntries: array of { width, height, buffer }
  const count = pngEntries.length
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // ICO format
  header.writeUInt16LE(count, 4) // image count

  let offset = 6 + count * 16
  const dirEntries = []
  for (const item of pngEntries) {
    const entry = Buffer.alloc(16)
    entry.writeUInt8(item.width >= 256 ? 0 : item.width, 0)
    entry.writeUInt8(item.height >= 256 ? 0 : item.height, 1)
    entry.writeUInt8(0, 2) // color palette count
    entry.writeUInt8(0, 3) // reserved
    entry.writeUInt16LE(1, 4) // color planes
    entry.writeUInt16LE(32, 6) // bits per pixel
    entry.writeUInt32LE(item.buffer.length, 8) // size of image data
    entry.writeUInt32LE(offset, 12) // offset
    dirEntries.push(entry)
    offset += item.buffer.length
  }

  return Buffer.concat([
    header,
    ...dirEntries,
    ...pngEntries.map((item) => item.buffer),
  ])
}

async function main() {
  const browser = await chromium.launch({ channel: "msedge" })
  const iconSvg = fs.readFileSync(path.join(publicDir, "icon.svg"), "utf8")

  async function renderToBuffer(width, height) {
    const page = await browser.newPage({
      viewport: { width, height },
      deviceScaleFactor: 1,
    })

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { background: transparent; overflow: hidden; }
            svg { display: block; width: 100%; height: 100%; }
          </style>
        </head>
        <body>${iconSvg}</body>
      </html>
    `

    await page.setContent(html, { waitUntil: "networkidle" })
    const buffer = await page.screenshot({
      omitBackground: true,
      type: "png",
    })
    await page.close()
    return buffer
  }

  console.log("--- Generating Favicon & App Icon Assets ---")

  // Generate individual PNG buffers
  const [b16, b32, b48, b96, b180, b192, b512] = await Promise.all([
    renderToBuffer(16, 16),
    renderToBuffer(32, 32),
    renderToBuffer(48, 48),
    renderToBuffer(96, 96),
    renderToBuffer(180, 180),
    renderToBuffer(192, 192),
    renderToBuffer(512, 512),
  ])

  // 1. Multi-resolution favicon.ico (16, 32, 48)
  const icoBuffer = createIco([
    { width: 16, height: 16, buffer: b16 },
    { width: 32, height: 32, buffer: b32 },
    { width: 48, height: 48, buffer: b48 },
  ])
  fs.writeFileSync(path.join(publicDir, "favicon.ico"), icoBuffer)
  fs.writeFileSync(path.join(appDir, "favicon.ico"), icoBuffer)
  console.log(`Saved favicon.ico: ${(icoBuffer.length / 1024).toFixed(1)} KB`)

  // 2. Apple Touch Icon (180x180)
  fs.writeFileSync(path.join(publicDir, "apple-touch-icon.png"), b180)
  fs.writeFileSync(path.join(appDir, "apple-icon.png"), b180)
  console.log("Saved apple-touch-icon.png & app/apple-icon.png (180x180)")

  // 3. Android / PWA / Google Search square PNG icons
  fs.writeFileSync(path.join(publicDir, "icon-48.png"), b48)
  fs.writeFileSync(path.join(publicDir, "icon-96.png"), b96)
  fs.writeFileSync(path.join(publicDir, "icon-192.png"), b192)
  fs.writeFileSync(path.join(publicDir, "icon-512.png"), b512)
  fs.writeFileSync(path.join(publicDir, "icon.png"), b512)
  console.log("Saved PNG icons (48px, 96px, 192px, 512px)")

  await browser.close()
  console.log("Done generating all icon assets.")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
