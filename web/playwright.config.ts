import { defineConfig, devices } from "@playwright/test";

// Boshdan-oxir testlar: haqiqiy API (xotiradagi Postgres, demo ma'lumot) + production build qilingan sayt.
// Sayt NEXT_PUBLIC_API_URL=http://localhost:4310 bilan yig'ilgan bo'lishi kerak (npm run e2e:build).
const API_PORT = 4310;
const WEB_PORT = 3310;

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    launchOptions: { args: ["--no-proxy-server"] },
  },
  webServer: [
    {
      command: "node ../api/dist/main.js",
      url: `http://localhost:${API_PORT}/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        PORT: String(API_PORT),
        DATABASE_URL: "pglite:memory",
        SEED_DEMO: "true",
        SMS_DEV_MODE: "true",
        WEB_ORIGIN: `http://localhost:${WEB_PORT}`,
        PUBLIC_URL: `http://localhost:${API_PORT}`,
        JWT_SECRET: "e2e-test-secret-e2e-test-secret-e2e-test-secret",
        RATE_LIMIT_SCALE: "20",
      },
    },
    {
      command: `npx next start -p ${WEB_PORT}`,
      url: `http://localhost:${WEB_PORT}/login`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
