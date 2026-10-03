import { expect, test, type Page } from "@playwright/test"

// Captures the product shots used on the landing page, from the seeded mock
// data (fixed 2025 dates, so every run produces the same charts).
const DIR = "public/screenshots"

/**
 * Waits until the page stops changing size across animation frames. Column
 * widths and chart containers are measured after paint, so a capture taken
 * too early differs from the next run by a pixel — which is enough to make
 * every `pnpm --filter web shots` produce a new binary.
 */
async function stableLayout(page: Page) {
  await page.waitForFunction(
    () =>
      new Promise<boolean>((resolve) => {
        const measure = () => [
          document.documentElement.scrollWidth,
          document.documentElement.scrollHeight,
          document.querySelector("table")?.scrollWidth ?? 0,
        ]
        let last = measure()
        let stable = 0
        const tick = () => {
          const now = measure()
          stable = now.every((v, i) => v === last[i]) ? stable + 1 : 0
          last = now
          // Three identical frames: long enough to outlast a layout pass,
          // short enough not to slow the capture noticeably.
          if (stable >= 3) resolve(true)
          else requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }),
    undefined,
    { timeout: 15_000 }
  )
}

/**
 * Waits for every finite animation to finish — CSS transitions, CSS keyframes
 * and Motion (which drives the Web Animations API). Infinite ones are ignored
 * or this would never resolve; none are in frame in these captures.
 */
async function animationsFinished(page: Page) {
  await page.waitForFunction(
    () =>
      document
        .getAnimations()
        .filter((a) => a.playState === "running")
        .every((a) => a.effect?.getComputedTiming().iterations === Infinity),
    undefined,
    { timeout: 15_000 }
  )
}

/** Nothing hovered, nothing focused, fonts settled, nothing still moving. */
async function settle(page: Page) {
  await page.mouse.move(0, 0)
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur())
  await page.evaluate(() => document.fonts.ready)
  await stableLayout(page)
  await animationsFinished(page)
}

/** Charts size themselves from the container, so wait for one to exist. */
async function settleWithCharts(page: Page) {
  await expect(page.locator(".recharts-surface").first()).toBeVisible()
  await settle(page)
}

test("capture the product screenshots", async ({ page }, testInfo) => {
  const theme = testInfo.project.name

  // The "dataset is ready" toast is true to life but belongs to the moment,
  // not to a screenshot that sits on a page for months. Hide it in CSS —
  // removing the node breaks React's portal on the next render.
  await page.addInitScript(() => {
    const style = document.createElement("style")
    style.textContent = "[data-sonner-toaster]{display:none!important}"
    document.addEventListener("DOMContentLoaded", () =>
      document.head.append(style)
    )
  })

  // Mock ingest is timed by this; zero keeps "just now" true for the relative
  // timestamps on screen, which is what makes the images reproducible.
  await page.addInitScript(() => {
    localStorage.setItem(
      "insightflow.mock.v1",
      JSON.stringify({
        version: 1,
        settings: { latencyMs: 0, failNextUpload: false },
      })
    )
  })

  await test.step("sign in and open a sample dashboard", async () => {
    await page.goto("/register")
    await page.getByLabel("Name").fill("Maya Chen")
    await page.getByLabel("Work email").fill("maya@example.com")
    await page.getByLabel("Password").fill("screenshot-pass")
    await page.getByRole("button", { name: "Create account" }).click()

    await page.getByRole("button", { name: /E-commerce orders/ }).click()
    const open = page
      .getByRole("dialog")
      .getByRole("link", { name: "Open dashboard" })
    await expect(open).toBeVisible({ timeout: 60_000 })
    await open.click()
    await expect(page.getByTestId("kpi-label").first()).toHaveText("Orders")
  })

  const brief = page.getByRole("region", { name: "Brief" })
  await expect(brief).toContainText("in April 2025", { timeout: 60_000 })

  await test.step("dashboard", async () => {
    // Frame the headline numbers and the charts, which is what "auto
    // dashboard" has to show — and what the landing hero renders this as.
    //
    // Anchor on the Charts heading, not the KPI strip: the strip is now a rail
    // beside the Brief, so framing on it fills the shot with prose and no
    // chart. Backing off by the strip's own height brings the rail into frame
    // above the charts. scrollIntoViewIfNeeded is no use here — it stops as
    // soon as an edge is visible.
    await page.getByRole("heading", { name: "Charts" }).evaluate((el) => {
      const rail = document.querySelector('[data-testid="kpi-strip"]')
      const lift = rail ? rail.getBoundingClientRect().height + 32 : 0
      el.scrollIntoView({ block: "start" })
      // Clear the sticky header (h-14) plus the rail above the heading.
      window.scrollBy(0, -(72 + lift))
    })
    await settleWithCharts(page)
    await page.screenshot({ path: `${DIR}/dashboard-${theme}.png` })
  })

  await test.step("brief", async () => {
    // Same reason as the dashboard step: scrollIntoViewIfNeeded stops as soon
    // as an edge is visible, so the sticky header (h-14) sat over the Brief's
    // first line and an element screenshot clips the header pixels with it.
    await brief.evaluate((el) => {
      el.scrollIntoView({ block: "start" })
      window.scrollBy(0, -72)
    })
    await settleWithCharts(page)
    await brief.screenshot({ path: `${DIR}/brief-${theme}.png` })
  })

  await test.step("table", async () => {
    await page
      .getByRole("navigation", { name: "Dataset views" })
      .getByRole("link", { name: "Table" })
      .click()
    await expect(page.getByText(/^Rows 1–\d+ of/)).toBeVisible()
    await settle(page)
    await page.screenshot({ path: `${DIR}/table-${theme}.png` })
  })

  await test.step("chart builder", async () => {
    await page
      .getByRole("navigation", { name: "Dataset views" })
      .getByRole("link", { name: "Dashboard" })
      .click()
    const add = page.getByRole("button", { name: "Add chart" })
    await add.scrollIntoViewIfNeeded()
    await add.click()
    const dialog = page.getByRole("dialog")
    await dialog.getByRole("radio", { name: "Bar" }).click()
    await dialog.getByRole("combobox", { name: "Group by" }).click()
    // The popover anchors to its trigger: let it stop moving before clicking.
    const option = page.getByRole("option", { name: "Category" })
    await expect(option).toBeVisible()
    await option.click({ force: true })
    await expect(
      dialog.locator(".recharts-bar-rectangle").first()
    ).toBeAttached()
    await settleWithCharts(page)
    await dialog.screenshot({ path: `${DIR}/chart-builder-${theme}.png` })
  })
})
