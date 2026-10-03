import { expect, test } from "@playwright/test"

// The other suites run with reducedMotion:"reduce" so they assert settled
// states. This one deliberately opts back in, so the animated path is still
// covered: a reveal that never completes, or a CTA that can't be clicked while
// the page is moving, would otherwise ship unnoticed.
test.use({ reducedMotion: "no-preference" })

/**
 * The scroll-driven rules have to be asserted as PRESENT somewhere, separately
 * from asserting they are inert under reduced motion.
 *
 * landing.spec.ts checks the device settles to clip-path:none with
 * reducedMotion:"reduce". That check passes just as happily when the CSS does
 * not exist at all -- which is exactly what happened once: a `git checkout` of
 * globals.css during an unrelated experiment silently discarded the whole
 * block, every suite stayed green, and the hero quietly stopped animating for
 * three commits. "Inert when it should be" and "absent" are different states
 * and need different assertions.
 */
test("the scroll-driven hero rules are actually shipped", async ({ page }) => {
  await page.goto("/")
  const rules = await page.evaluate(() => {
    const found: string[] = []
    const walk = (list: CSSRuleList) => {
      for (const rule of list) {
        if (rule instanceof CSSKeyframesRule)
          found.push("@keyframes " + rule.name)
        if ("cssRules" in rule) walk((rule as CSSGroupingRule).cssRules)
        if (rule instanceof CSSStyleRule) found.push(rule.selectorText)
      }
    }
    for (const sheet of document.styleSheets) {
      try {
        walk(sheet.cssRules)
      } catch {
        // A cross-origin sheet; none of ours are.
      }
    }
    return found
  })

  for (const needed of [
    "@keyframes deck-arrive",
    "@keyframes csv-recede",
    "@keyframes trace-draw",
    ".hero-transform",
    ".hero-deck",
    "@keyframes header-settle",
    ".site-header",
  ]) {
    expect(rules, `${needed} must be in the shipped CSS`).toContain(needed)
  }
})

test("the page animates without trapping the visitor", async ({ page }) => {
  await test.step("the hero is readable from the first paint", async () => {
    await page.goto("/")
    // The hero is CSS-animated and never opacity-gated, so it is legible
    // immediately rather than after hydration.
    const heading = page.getByRole("heading", {
      name: /Turn a spreadsheet into a dashboard/,
    })
    await expect(heading).toBeVisible({ timeout: 3_000 })
    await expect(heading).toHaveCSS("opacity", "1")
  })

  await test.step("a below-the-fold section reveals when scrolled to", async () => {
    const heading = page.getByRole("heading", {
      name: "An AI summary you can actually quote",
    })
    await heading.scrollIntoViewIfNeeded()
    // Reveals are opacity + translateY; the section must finish at full opacity.
    await expect
      .poll(
        async () => {
          const el = page.locator("#grounded")
          return el.evaluate((node) => {
            // The pipeline's first row. This used to read the dl's parent
            // Reveal, but the dl was a restatement of this list and was cut;
            // RevealItem carries opacity on the element itself, so the row is
            // now both what exists and what animates.
            const row = node.querySelector("ol > li")
            return row ? getComputedStyle(row).opacity : "0"
          })
        },
        { timeout: 10_000 }
      )
      .toBe("1")
  })

  await test.step("the CTA is clickable while the page is still moving", async () => {
    // Straight back to the top and click immediately: no entrance may leave an
    // interactive element permanently unstable (Playwright waits for the box to
    // stop moving, and an infinite transform would hang until the timeout).
    await page.goto("/")
    await page
      .getByRole("link", { name: "Create an account" })
      .first()
      .click({ timeout: 10_000 })
    await expect(page).toHaveURL(/\/register$/, { timeout: 30_000 })
  })

  await test.step("the chart still fits after a resize", async () => {
    // Loading narrow is not the same as arriving narrow. This catches a chart
    // that fails to re-measure downward; it does NOT catch every stale
    // measurement (setViewportSize fires a clean ResizeObserver pass, which a
    // real window drag does not always do) — the min-w-0 on DrawIn's wrappers
    // is what actually guarantees the container can shrink.
    await page.goto("/")
    await page.setViewportSize({ width: 1280, height: 800 })
    await page
      .getByRole("heading", {
        name: "This is the real thing, not a picture of it",
      })
      .scrollIntoViewIfNeeded()
    await expect(page.locator(".recharts-surface").first()).toBeVisible()
    await page.setViewportSize({ width: 420, height: 800 })
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              document.documentElement.scrollWidth -
              document.documentElement.clientWidth
          ),
        { timeout: 5_000 }
      )
      .toBeLessThanOrEqual(0)
  })

  await test.step("nothing overflows sideways once everything has moved", async () => {
    await page.goto("/")
    await page.setViewportSize({ width: 375, height: 812 })
    // Scroll the whole page so every reveal fires, then measure — the existing
    // landing spec measures one still frame at the top and cannot see this.
    await page.evaluate(async () => {
      const step = window.innerHeight
      for (let y = 0; y < document.body.scrollHeight; y += step) {
        window.scrollTo(0, y)
        await new Promise((r) => setTimeout(r, 120))
      }
    })
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              document.documentElement.scrollWidth -
              document.documentElement.clientWidth
          ),
        { timeout: 5_000 }
      )
      .toBeLessThanOrEqual(0)
  })
})
