import { expect, test } from "@playwright/test"

// PRD happy path on the mock backend: sign up, try a sample, read the Brief,
// filter, explore rows, and upload a real file through the XHR upload path.

const csv = [
  "Order Date,Region,Units,Net Revenue",
  ...Array.from({ length: 60 }, (_, i) =>
    [
      `2025-0${1 + (i % 6)}-${String(1 + (i % 28)).padStart(2, "0")}`,
      ["EU", "US", "APAC"][i % 3],
      1 + (i % 4),
      `"${(1000 + i * 12.5).toLocaleString("en-US")}"`,
    ].join(",")
  ),
].join("\n")

test("an analyst goes from sign-up to a filtered dashboard and an upload", async ({
  page,
}) => {
  await test.step("sign up", async () => {
    await page.goto("/register")
    await page.getByLabel("Name").fill("E2E Analyst")
    await page.getByLabel("Work email").fill(`e2e-${Date.now()}@example.com`)
    await page.getByLabel("Password").fill("playwright-pass")
    await page.getByRole("button", { name: "Create account" }).click()
    await expect(page).toHaveURL(/\/app\/datasets$/)
    await expect(page.getByText("Start with a file")).toBeVisible()
  })

  await test.step("try the orders sample and follow processing", async () => {
    await page.getByRole("button", { name: /E-commerce orders/ }).click()
    const open = page
      .getByRole("dialog")
      .getByRole("link", { name: "Open dashboard" })
    await expect(open).toBeVisible({ timeout: 45_000 })
    await open.click()
  })

  const brief = page.getByRole("region", { name: "Brief" })

  await test.step("the Brief tells the planted story and links numbers to charts", async () => {
    await expect(brief).toContainText("in April 2025", { timeout: 30_000 })
    await expect(brief).toContainText("Electronics")
    await expect(page.getByTestId("kpi-label").first()).toHaveText("Orders")

    // A vertical marker line has a zero-width box, so assert it's rendered
    // (attached) rather than "visible"; it goes away when the pointer leaves.
    const marker = page.locator("[data-widget-id] .recharts-reference-line")
    await brief.getByText("−22.1%").hover()
    await expect(marker.first()).toBeAttached()
    await page.getByRole("heading", { name: "Charts" }).hover()
    await expect(marker).toHaveCount(0)
  })

  await test.step("a region filter changes the KPIs and lives in the URL", async () => {
    const orders = page.getByTestId("kpi-value").first()
    const before = await orders.textContent()
    const toolbar = page.getByRole("toolbar", { name: "Filters" })
    await toolbar.getByRole("button", { name: "Filter", exact: true }).click()
    await page.getByRole("option", { name: "Region" }).click()
    await page.getByRole("option", { name: /^Europe/ }).click()
    await page.getByRole("button", { name: "Apply" }).click()
    await expect(toolbar).toContainText("Region:Europe")
    await expect(orders).not.toHaveText(before ?? "")
    await expect(page).toHaveURL(/where=/)
  })

  await test.step("the table keeps the filter and sorts on the server", async () => {
    await page
      .getByRole("navigation", { name: "Dataset views" })
      .getByRole("link", { name: "Table" })
      .click()
    await expect(page.getByText(/^Rows 1–50 of/)).toBeVisible()
    await page.getByRole("button", { name: "Sort by Revenue" }).click()
    await expect(page).toHaveURL(/sort=revenue(%3A|:)desc/)

    // The previous page stays on screen until the sorted one arrives.
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

  await test.step("upload a CSV through the real upload path", async () => {
    await page.getByRole("link", { name: "Datasets" }).first().click()
    await page.getByRole("button", { name: "Upload file" }).click()
    await page.locator('input[type="file"]').setInputFiles({
      name: "q3_sales.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    })
    await expect(page.getByLabel("Dataset name")).toHaveValue("q3_sales")
    await page.getByRole("button", { name: "Upload", exact: true }).click()
    const open = page
      .getByRole("dialog")
      .getByRole("link", { name: "Open dashboard" })
    await expect(open).toBeVisible({ timeout: 45_000 })
    await open.click()
    await expect(page.getByRole("heading", { name: "q3_sales" })).toBeVisible()
    await page
      .getByRole("navigation", { name: "Dataset views" })
      .getByRole("link", { name: "Columns" })
      .click()
    await expect(page.getByRole("row", { name: /net_revenue/ })).toContainText(
      "Number"
    )
  })
})
