import { defineConfig } from "@playwright/test";
import { baseUrl } from "./scripts/e2e-common.mjs";

const baseURL = baseUrl();

const desktopUser = {
  "oai-authenticated-user-id": process.env.E2E_USER_ID_DESKTOP ?? "e2e-desktop",
  "oai-authenticated-user-email": process.env.E2E_USER_EMAIL_DESKTOP ?? "e2e-desktop@sites.test",
  "oai-authenticated-user-full-name": "Teste Desktop",
};

const mobileUser = {
  "oai-authenticated-user-id": process.env.E2E_USER_ID_MOBILE ?? "e2e-mobile",
  "oai-authenticated-user-email": process.env.E2E_USER_EMAIL_MOBILE ?? "e2e-mobile@sites.test",
  "oai-authenticated-user-full-name": "Teste Mobile",
};

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.mjs",
  globalTeardown: "./tests/e2e/global-teardown.mjs",
  fullyParallel: false,
  workers: 2,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
  ],
  outputDir: "test-results",
  use: {
    baseURL,
    actionTimeout: 15_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "desktop",
      use: {
        browserName: "chromium",
        viewport: { width: 1440, height: 900 },
        extraHTTPHeaders: desktopUser,
      },
    },
    {
      name: "mobile",
      use: {
        browserName: "chromium",
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        extraHTTPHeaders: mobileUser,
      },
    },
  ],
});