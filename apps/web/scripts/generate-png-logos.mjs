import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "@playwright/test"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const publicDir = path.resolve(__dirname, "../public")

async function main() {
  const browser = await chromium.launch({ channel: "msedge" })

  const logoSvg = fs.readFileSync(path.join(publicDir, "logo.svg"), "utf8")
  const iconSvg = fs.readFileSync(path.join(publicDir, "icon.svg"), "utf8")
  const logoWhiteSvg = logoSvg.replace('fill="#161a22"', 'fill="#ffffff"')

  async function render(svgContent, width, height, outputPath, { bg = "transparent", type = "png", quality } = {}) {
    const page = await browser.newPage({
      viewport: { width, height },
      deviceScaleFactor: 1, // Exactly width x height pixels output
    })

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { background: ${bg}; overflow: hidden; }
            svg { display: block; width: 100%; height: 100%; }
          </style>
        </head>
        <body>${svgContent}</body>
      </html>
    `

    await page.setContent(html, { waitUntil: "networkidle" })
    await page.screenshot({
      path: outputPath,
      omitBackground: bg === "transparent",
      type,
      ...(type === "jpeg" ? { quality: quality ?? 95 } : {}),
    })
    await page.close()

    const stats = fs.statSync(outputPath)
    console.log(`Saved: ${path.basename(outputPath)} (${width}x${height}px, ${(stats.size / 1024).toFixed(1)} KB)`)
  }

  console.log("--- Generating Status Page Compliant Logos (< 400x200px, < 150KB) ---")

  // 1. Full Logo PNG (350x70px - strictly < 400x200px)
  await render(logoSvg, 350, 70, path.join(publicDir, "status-logo.png"))

  // 2. Full Logo Dark Mode PNG (350x70px)
  await render(logoWhiteSvg, 350, 70, path.join(publicDir, "status-logo-dark.png"))

  // 3. Square Icon Mark PNG (160x160px - strictly < 400x200px)
  await render(iconSvg, 160, 160, path.join(publicDir, "status-icon.png"))

  // 4. Full Logo JPG (350x70px with white background)
  await render(logoSvg, 350, 70, path.join(publicDir, "status-logo.jpg"), { bg: "#ffffff", type: "jpeg" })

  // 5. Square Icon Mark JPG (160x160px with white background)
  await render(iconSvg, 160, 160, path.join(publicDir, "status-icon.jpg"), { bg: "#ffffff", type: "jpeg" })

  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
