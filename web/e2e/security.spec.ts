import { expect, test } from "@playwright/test";

import { API, apiLogin } from "./helpers";

test("sayt xavfsizlik sarlavhalari", async ({ request }) => {
  const r = await request.get("/login");
  const h = r.headers();
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["content-security-policy"]).toContain(`connect-src 'self' ${API}`);
  // Skriptlar faqat har so'rovga yangi nonce bilan: 'unsafe-inline' yo'q
  const script = /script-src ([^;]+)/.exec(h["content-security-policy"])![1];
  expect(script).not.toContain("'unsafe-inline'");
  expect(script).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
  const again = (await request.get("/login")).headers()["content-security-policy"];
  expect(again).not.toBe(h["content-security-policy"]);
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["permissions-policy"]).toContain("camera=(self)");
});

test("sahifada CSP buzilishi yo'q (barcha skriptlar nonce bilan)", async ({ page }) => {
  const violations: string[] = [];
  await page.addInitScript(() => document.addEventListener("securitypolicyviolation", (e) => console.error(`CSPV ${e.violatedDirective} ${e.blockedURI}`)));
  page.on("console", (m) => { if (m.text().startsWith("CSPV")) violations.push(m.text()); });
  await page.goto("/login");
  await page.getByPlaceholder("ism.familiya yoki 90 123 45 67").fill("905555555");
  await page.locator('input[type="password"]').fill("246810");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/parent/);
  await page.goto("/parent/payments");
  await expect(page.getByText("Kvitansiya ID").first()).toBeVisible();
  // Mavzu skripti (nonce bilan) ishladi: html'da mavzu atributi bor
  expect(await page.evaluate(() => document.documentElement.dataset.theme ?? document.documentElement.className)).toBeTruthy();
  expect(violations).toEqual([]);
});

test("API sarlavhalari, sxema tekshiruvi, imzosiz fayl", async () => {
  const health = await fetch(`${API}/health`);
  expect(health.headers.get("x-frame-options")).toBe("DENY");
  expect(health.headers.get("cache-control")).toBe("no-store");
  expect(await health.json()).toEqual({ ok: true, db: true, ready: true, push: false });
  const t = await apiLogin("908888888");
  const bad = await fetch(`${API}/commands/lead.save`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` }, body: JSON.stringify({ name: { $gt: "" }, phone: "1", interest: "", source: "x" }) });
  expect(bad.status).toBe(400);
  expect((await bad.json()).key).toBe("err.invalid");
  expect((await fetch(`${API}/files/${"a".repeat(32)}`)).status).toBe(401);
  // Token URL'da qabul qilinmaydi
  expect((await fetch(`${API}/events?token=${t}`)).status).toBe(401);
});
