import { expect, test } from "@playwright/test"

// The public front door. Nothing else covers "/", and the page must render
// without waiting on the MSW worker (mocks/msw-provider.tsx) — the regression
// this file exists to catch.

test("a visitor can read the landing page and reach sign-up", async ({
  page,
}) => {
  await test.step("the hero renders immediately, with no redirect", async () => {
    await page.goto("/")
    await expect(page).toHaveURL(/\/$/)
    await expect(
      page.getByRole("heading", {
        name: /Turn a spreadsheet into a dashboard/,
      })
    ).toBeVisible({ timeout: 5_000 })
  })

  await test.step("the file-to-dashboard device shows its finished state", async () => {
    // This suite runs with reducedMotion:"reduce", so the scroll-driven wipe in
    // globals.css never applies and the device must already be in its finished
    // state. What this asserts, precisely, is the reduced-motion gate: hoisting
    // those rules out of @media (prefers-reduced-motion: no-preference) makes
    // the clip-path assertion fail, which was checked by doing it.
    //
    // The @supports and no-JavaScript paths are the same construction -- the
    // finished composition is the default and the keyframes only run backwards
    // from it -- but Playwright always runs JS and Chromium supports
    // scroll-timeline, so neither is directly covered here.
    const rows = page.getByRole("table", { name: /rows of orders\.csv/ })
    await expect(rows).toBeVisible()
    await expect(
      rows.getByRole("columnheader", { name: "revenue" })
    ).toBeAttached()
    // The literal head of the committed CSV, not a hand-written sample.
    await expect(rows.getByText("ORD-000001")).toBeVisible()

    const deck = page.locator(".hero-deck")
    await expect(deck).toBeVisible()
    // Unclipped: with the animation inert the dashboard is simply there.
    await expect(deck).toHaveCSS("clip-path", "none")
  })

  await test.step("the live section renders real computed numbers", async () => {
    const kpis = page.getByTestId("kpi-strip")
    await expect(kpis.getByTestId("kpi-label").first()).toHaveText("Orders")
    // The engine's output, not copy: 12,253 rows in the orders sample.
    await expect(kpis.getByTestId("kpi-value").first()).toHaveText("12.3K")
    await expect(page.locator(".recharts-surface").first()).toBeVisible()
  })

  await test.step("a grounded number links back to its point on the chart", async () => {
    // −22.1% is the engine's real April figure for the committed orders.csv
    // (golden fixture fact f2 = -0.2206), rendered by the product's own Brief
    // component. The page used to show −18.4% here -- a number a human typed,
    // captioned as coming from that file, twelve inches under the claim that
    // every number is computed and never written. U+2212, from formatDelta.
    const mark = page.getByText("−22.1%")
    await mark.hover()
    await expect(mark).toHaveAttribute("data-active", "true")
  })

  await test.step("the page fits a phone in both themes", async () => {
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme })
      await page.setViewportSize({ width: 375, height: 812 })
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth
      )
      expect(overflow, `no horizontal scroll in ${scheme}`).toBeLessThanOrEqual(
        0
      )
    }
    await page.setViewportSize({ width: 1280, height: 720 })
  })

  await test.step("the primary call to action leads to sign-up", async () => {
    await page.getByRole("link", { name: "Create an account" }).first().click()
    await expect(page).toHaveURL(/\/register$/)
    await expect(
      page.getByRole("heading", { name: "Create your account" })
    ).toBeVisible()
  })
})

test("there is no way in without an account", async ({ page }) => {
  // ADR-015 removed the no-signup demo. Every call to action on the page is
  // a link to /register or /login, and nothing offers to skip that.
  await page.goto("/")
  await expect(
    page.getByRole("button", { name: /try it|no sign-?up|demo/i })
  ).toHaveCount(0)
  await expect(page.getByText(/no sign-?up/i)).toHaveCount(0)

  await page.getByRole("link", { name: "Sign in" }).last().click()
  await expect(page).toHaveURL(/\/login$/)
})
