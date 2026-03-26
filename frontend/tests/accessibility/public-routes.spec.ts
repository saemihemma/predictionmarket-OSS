import { expect, test, type Locator, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const PUBLIC_ROUTES = ["/markets", "/markets/create", "/airdrop"] as const;

async function expectKeyboardReachable(page: Page, locator: Locator, maxTabs = 20) {
  for (let step = 0; step < maxTabs; step += 1) {
    const isFocused = await locator.evaluate((element) => element === document.activeElement);
    if (isFocused) {
      return;
    }
    await page.keyboard.press("Tab");
  }

  throw new Error(`Keyboard focus never reached ${await locator.evaluate((element) => (element as HTMLElement).outerHTML)}`);
}

async function expectNoSeriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const seriousViolations = results.violations.filter((violation) =>
    ["critical", "serious"].includes(violation.impact ?? ""),
  );
  expect(seriousViolations, JSON.stringify(seriousViolations, null, 2)).toEqual([]);
}

test.describe("public route accessibility smoke", () => {
  for (const route of PUBLIC_ROUTES) {
    test(`axe + landmark smoke for ${route}`, async ({ page }) => {
      await page.goto(route);
      await expect(page.locator("main")).toHaveCount(1);
      await expectNoSeriousViolations(page);
    });
  }

  test("root redirects to /markets", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/markets$/);
  });

  test("markets primary actions are keyboard reachable", async ({ page }) => {
    await page.goto("/markets");
    const createLink = page.getByRole("link", { name: /\+ create market/i });
    await expectKeyboardReachable(page, createLink);
    await expect(createLink).toBeFocused();
  });

  test("create wizard title input is keyboard reachable", async ({ page }) => {
    await page.goto("/markets/create");
    const titleInput = page.getByLabel(/market title/i);
    await expectKeyboardReachable(page, titleInput);
    await expect(titleInput).toBeFocused();
  });

  test("airdrop desktop keeps primary actions keyboard reachable", async ({ page }) => {
    await page.goto("/airdrop");
    const returnAction = page.getByRole("link", { name: /return to the orchestrator/i });
    await expectKeyboardReachable(page, returnAction);
    await expect(returnAction).toBeFocused();
  });

  test("airdrop mobile shows desktop-only claim messaging", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
    });
    const page = await context.newPage();
    await page.goto("/airdrop");
    await expect(page.getByRole("button", { name: /available on desktop \/ pc/i })).toBeVisible();
    await expect(page.getByText(/claims are desktop \/ pc only\./i)).toBeVisible();
    await expect(page.getByText(/eve vault claiming is temporarily desktop-only\./i).first()).toBeVisible();
    await expect(page.getByText(/how to connect/i)).toHaveCount(0);
    await context.close();
  });
});
