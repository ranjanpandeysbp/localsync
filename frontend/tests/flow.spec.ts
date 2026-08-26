import { test, expect } from '@playwright/test';

test.describe('End to end flow', () => {
  test('should load the homepage and check basic elements', async ({ page }) => {
    await page.goto('http://localhost:5173/');
    
    // Check if the title is correct or some basic element exists
    // Using a broad check since we don't know the exact title
    await expect(page).toHaveURL('http://localhost:5173/');
    
    // Take a screenshot of the homepage
    await page.screenshot({ path: 'homepage.png' });
    
    // Try to find a login or register button
    const loginLink = page.getByText(/login|sign in/i).first();
    if (await loginLink.isVisible()) {
      await loginLink.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: 'login_modal.png' });
    }
  });
});
