import { test, expect } from '@playwright/test';

test('login page renders all fields', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByLabel(/email/i)).toBeVisible();
  await expect(page.getByLabel(/password/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
});

test('signup page renders all fields', async ({ page }) => {
  await page.goto('/signup');
  await expect(page.getByLabel(/full name/i)).toBeVisible();
  await expect(page.getByLabel(/work email/i)).toBeVisible();
  await expect(page.getByLabel(/password/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /create account/i })).toBeVisible();
});

test('authenticated routes redirect to login', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login(\?|$)/);
});

test('client-side form validation rejects bad email', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill('not-an-email');
  await page.getByLabel(/password/i).fill('short');
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page.getByText(/invalid email|email/i).first()).toBeVisible();
});
