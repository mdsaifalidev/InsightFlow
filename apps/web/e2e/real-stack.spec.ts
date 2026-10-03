import { expect, test, type Page } from "@playwright/test"

// The PRD happy path against the real services: the Node auth service issues
// the session, the Python service ingests, queries and writes the Brief, and
// the app reaches both through Next rewrites (ADR-013). Run it with
// `pnpm e2e:real`, which boots the stack first.

/** Two bad rows: the second has an extra cell, which ingest must reject. */
const brokenCsv = "order_id,amount\nA-1,10\nA-2,20\nA-3,30,extra\n"

async function register(page: Page) {
  await page.goto("/register")
  await page.getByLabel("Name").fill("Real Stack Analyst")
  await page
    .getByLabel("Work email")
    .fill(`e2e-real-${Date.now()}@insightflow.dev`)
  // Only this test account ever sees it; the auth service stores an argon2 hash.
  await page
    .getByLabel("Password")
    .fill(`pw-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  await page.getByRole("button", { name: "Create account" }).click()
  await expect(page).toHaveURL(/\/app\/datasets$/)
}

test("the analyst flow works end to end against the real services", async ({
  page,
}) => {
  await test.step("signed-out /app/* is redirected by the server", async () => {
    const response = await page.goto("/app/datasets")
    expect(response?.url()).toContain("/login")
    await expect(page).toHaveURL(/\/login\?next=%2Fapp%2Fdatasets/)
  })

  await test.step("sign up through the auth service", async () => {
    await register(page)
    await expect(page.getByText("Start with a file")).toBeVisible()
    // The auth service issued a real session, not a mocked one.
    const cookies = await page.context().cookies()
    expect(cookies.map((c) => c.name)).toContain("if_session")
  })

  await test.step("a sample is ingested with live progress", async () => {
    await page.getByRole("button", { name: /E-commerce orders/ }).click()
    const dialog = page.getByRole("dialog")
    // Stages stream over SSE from the worker, through Redis pub/sub.
    await expect(dialog.getByText("Reading the file")).toBeVisible({
      timeout: 60_000,
    })
    await expect(dialog.getByText("Ready", { exact: true })).toBeVisible({
      timeout: 120_000,
    })
    await dialog.getByRole("link", { name: "Open dashboard" }).click()
    await expect(
      page.getByRole("heading", { name: "E-commerce orders" })
    ).toBeVisible()
  })

  const brief = page.getByRole("region", { name: "Brief" })

  await test.step("the Brief carries the planted story and links numbers to charts", async () => {
    await expect(brief).toContainText("in April 2025", { timeout: 60_000 })
    await expect(brief).toContainText("Electronics")
    await expect(page.getByTestId("kpi-label").first()).toHaveText("Orders")

    // Hovering a computed number marks its point on the matching chart.
    const marker = page.locator("[data-widget-id] .recharts-reference-line")
    await brief
      .getByText(/^−\d+\.\d%$/)
      .first()
      .hover()
    await expect(marker.first()).toBeAttached()
    await page.getByRole("heading", { name: "Charts" }).hover()
    await expect(marker).toHaveCount(0)
  })

  await test.step("filters re-query the service and live in the URL", async () => {
    const orders = page.getByTestId("kpi-value").first()
    const before = await orders.textContent()
    const toolbar = page.getByRole("toolbar", { name: "Filters" })

    await toolbar.getByRole("button", { name: "Filter", exact: true }).click()
    await page.getByRole("option", { name: "Region" }).click()
    // Values and counts come from the data service, not the browser.
    await page.getByRole("option", { name: /^Europe/ }).click()
    await page.getByRole("button", { name: "Apply" }).click()

    await expect(toolbar).toContainText("Region:Europe")
    await expect(orders).not.toHaveText(before ?? "")
    await expect(page).toHaveURL(/where=/)
  })

  await test.step("the table pages and sorts on the server", async () => {
    await page
      .getByRole("navigation", { name: "Dataset views" })
      .getByRole("link", { name: "Table" })
      .click()
    await expect(page.getByText(/^Rows 1–\d+ of/)).toBeVisible()

    await page.getByRole("button", { name: "Sort by Revenue" }).click()
    await expect(page).toHaveURL(/sort=revenue(%3A|:)desc/)

    const revenues = () =>
      page.$$eval('tbody tr td[data-column="revenue"]', (cells) =>
        cells
          .slice(0, 10)
          .map((cell) => Number(cell.textContent?.replace(/[^0-9.]/g, "")))
      )
    await expect
      .poll(async () => {
        const values = await revenues()
        return (
          values.length === 10 &&
          values.every((v, i) => i === 0 || values[i - 1]! >= v)
        )
      })
      .toBe(true)

    const regions = await page.$$eval(
      'tbody tr td[data-column="region"]',
      (cells) => [...new Set(cells.map((cell) => cell.textContent))]
    )
    expect(regions).toEqual(["Europe"])
  })

  await test.step("a custom chart is previewed and saved", async () => {
    await page
      .getByRole("navigation", { name: "Dataset views" })
      .getByRole("link", { name: "Dashboard" })
      .click()
    await page.getByRole("button", { name: "Add chart" }).click()

    const dialog = page.getByRole("dialog")
    await dialog.getByRole("radio", { name: "Bar" }).click()
    await dialog.getByRole("combobox", { name: "Group by" }).click()
    await page.getByRole("option", { name: "Category" }).click()
    await dialog.getByRole("combobox", { name: "Summarize" }).click()
    await page.getByRole("option", { name: "Average" }).click()
    await dialog.getByRole("combobox", { name: "Of" }).click()
    await page.getByRole("option", { name: "Unit price" }).click()

    // The preview is a real /query round trip.
    await expect(
      dialog.locator(".recharts-bar-rectangle").first()
    ).toBeAttached()
    await expect(dialog.getByLabel("Title")).toHaveValue(
      "Average unit price by category"
    )
    await dialog.getByRole("button", { name: "Add to dashboard" }).click()

    // Widget titles are card headings, not ARIA headings; the per-chart menu
    // carries the title and is the stable hook.
    await expect(
      page.getByRole("button", {
        name: "Options for Average unit price by category",
      })
    ).toBeVisible()
  })

  await test.step("the Brief can be regenerated as a job", async () => {
    await page.getByRole("button", { name: "Regenerate" }).click()
    await expect(brief).toContainText("in April 2025", { timeout: 60_000 })
  })

  await test.step("a column type override re-profiles and rebuilds", async () => {
    await page
      .getByRole("navigation", { name: "Dataset views" })
      .getByRole("link", { name: "Columns" })
      .click()
    await page.getByRole("combobox", { name: "Type of discount_pct" }).click()
    await page.getByRole("option", { name: "Category" }).click()
    await expect(page.getByRole("row", { name: /discount_pct/ })).toContainText(
      "Changed",
      {
        timeout: 60_000,
      }
    )
  })

  await test.step("a malformed upload fails with the offending row", async () => {
    await page.getByRole("link", { name: "Datasets" }).first().click()
    await page.getByRole("button", { name: "Upload file" }).click()
    await page.locator('input[type="file"]').setInputFiles({
      name: "broken-export.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(brokenCsv),
    })
    await page.getByRole("button", { name: "Upload", exact: true }).click()
    // The message shows in the dialog and again on the failed library row.
    await expect(
      page.getByText("Row 4 has 3 columns, expected 2.").first()
    ).toBeVisible({ timeout: 60_000 })
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Close" })
      .first()
      .click()
  })

  await test.step("deleting removes the datasets", async () => {
    for (const name of ["broken-export", "E-commerce orders"]) {
      await page.getByRole("button", { name: `Actions for ${name}` }).click()
      await page.getByRole("menuitem", { name: "Delete" }).click()
      await page.getByRole("button", { name: "Delete dataset" }).click()
      await expect(page.getByRole("link", { name })).toHaveCount(0)
    }
    await expect(page.getByText("Start with a file")).toBeVisible()
  })
})
