import { defineConfig, devices } from "@playwright/test";
import process from "node:process";

const isCI = Boolean(process.env.CI);

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: "./tests",
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: isCI,
  /* Retry on CI only */
  retries: isCI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: isCI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: "html",
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('')`. */
    baseURL: "https://127.0.0.1:3157/pptypst/",
    ignoreHTTPSErrors: true,
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 3157 --strictPort",
    url: "https://127.0.0.1:3157/pptypst/powerpoint.html",
    reuseExistingServer: !isCI,
    timeout: 120_000,
    ignoreHTTPSErrors: true,
  },
});
