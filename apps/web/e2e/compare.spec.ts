import { expect, test } from "@playwright/test";

test.describe("Phase 9: Compare View E2E Smoke Test", () => {
  test("renders compare view with verdict badges, forest plot, and executive summary", async ({
    page,
  }) => {
    // Navigate to the Compare Hero Page
    await page.goto("/compare");

    // 1. Assert Executive Summary renders with non-empty text
    const summary = page.locator("#executive-summary");
    await expect(summary).toBeVisible();
    await expect(summary).toContainText("JSON Schema Validity");
    await expect(summary).toContainText("Claude 3.5 Haiku");
    await expect(summary).toContainText("Llama 3.3 70B");

    // 2. Assert Verdict Badges render with text and icons (not color alone)
    const betterBadge = page.locator('span[aria-label="Verdict: Better"]').first();
    await expect(betterBadge).toBeVisible();
    await expect(betterBadge).toContainText("BETTER");
    await expect(betterBadge.locator("svg")).toBeVisible();

    const worseBadge = page.locator('span[aria-label="Verdict: Worse"]').first();
    await expect(worseBadge).toBeVisible();
    await expect(worseBadge).toContainText("WORSE");
    await expect(worseBadge.locator("svg")).toBeVisible();

    const noDiffBadge = page
      .locator('span[aria-label="Verdict: No meaningful difference"]')
      .first();
    await expect(noDiffBadge).toBeVisible();
    await expect(noDiffBadge).toContainText("NO MEANINGFUL DIFFERENCE");
    await expect(noDiffBadge.locator("svg")).toBeVisible();

    const inconclusiveBadge = page.locator('span[aria-label="Verdict: Inconclusive"]').first();
    await expect(inconclusiveBadge).toBeVisible();
    await expect(inconclusiveBadge).toContainText("INCONCLUSIVE");
    await expect(inconclusiveBadge.locator("svg")).toBeVisible();

    // 3. Assert Forest Plot SVG renders with equivalence band
    const forestPlot = page.locator('svg[role="img"]').first();
    await expect(forestPlot).toBeVisible();
    await expect(page.locator("text=Equivalence Band: ±0.03")).toBeVisible();

    // 4. Assert Simpson's Paradox Warning is displayed
    const simpsonsAlert = page.locator('section[aria-label="Simpson\'s Paradox Alert"]');
    await expect(simpsonsAlert).toBeVisible();
    await expect(simpsonsAlert).toContainText("Simpson's Paradox Detected");

    // 5. Assert Judge Trust Badge is visible
    const judgeBadge = page.locator('span:has-text("TRUSTED")').first();
    await expect(judgeBadge).toBeVisible();
  });
});
