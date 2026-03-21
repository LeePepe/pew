import { test, expect } from "@playwright/test";

test("app loads and shows page title", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/pew/i);
});
