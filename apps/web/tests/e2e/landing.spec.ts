import { test, expect } from '@playwright/test';

test('landing renders sign in/up links', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Ethical price intelligence/i);
  await expect(page.getByRole('link', { name: /sign in/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /create account/i })).toBeVisible();
});
