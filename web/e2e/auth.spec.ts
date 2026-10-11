import { expect, test } from "@playwright/test";

import { api, apiLogin, login, pickProfile } from "./helpers";

test("noto'g'ri parol: xato xabari, kirilmaydi", async ({ page }) => {
  await login(page, "905555555", "000000");
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("ota-ona kiradi; kirish tokeni saqlanmaydi; sahifa yangilansa sessiya qoladi", async ({ page }) => {
  await login(page, "905555555");
  await expect(page).toHaveURL(/\/parent/);
  await expect(page.getByText("Aziz Karimov").first()).toBeVisible();
  const stored = await page.evaluate(() => Object.keys(localStorage));
  // Uzoq muddatli token yo'q, faqat almashinuvchi refresh token
  expect(stored).not.toContain("edunazorat-token");
  expect(stored).toContain("edunazorat-rt");
  const rt1 = await page.evaluate(() => localStorage.getItem("edunazorat-rt"));
  await page.reload();
  await expect(page.getByText("Aziz Karimov").first()).toBeVisible();
  const rt2 = await page.evaluate(() => localStorage.getItem("edunazorat-rt"));
  expect(rt2).not.toBe(rt1);
});

test("boshqa qurilmadan 'hammadan chiqish': bu oyna kirish sahifasiga qaytadi", async ({ page }) => {
  await login(page, "903333333");
  await pickProfile(page, "O'qituvchi");
  await expect(page).toHaveURL(/\/teacher/);
  const other = await apiLogin("903333333");
  const r = await api<{ revoked: number }>("/auth/sessions/revoke-others", other, {});
  expect(r.data.revoked).toBeGreaterThan(0);
  await page.reload();
  await expect(page).toHaveURL(/\/login/);
});

test("chiqish: sessiya serverda ham bekor", async ({ page }) => {
  await login(page, "902222222");
  await expect(page).toHaveURL(/\/director/);
  const rt = await page.evaluate(() => localStorage.getItem("edunazorat-rt"));
  await page.getByRole("button", { name: "Profil va sozlamalar" }).first().click();
  await page.getByRole("button", { name: "Chiqish" }).click();
  await expect(page).toHaveURL(/\/login/);
  const res = await fetch("http://localhost:4310/auth/refresh", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refreshToken: rt }) });
  expect(res.status).toBe(401);
});

test("rus tili: lug'at faqat tanlanganda yuklanadi va sahifa yangilansa saqlanadi", async ({ page }) => {
  await login(page, "905555555");
  await expect(page).toHaveURL(/\/parent/);
  await page.getByRole("button", { name: "Profil va sozlamalar" }).first().click();
  await page.getByRole("tab", { name: "Русский" }).click();
  await expect(page.getByRole("button", { name: "Выйти" })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Главная").first()).toBeVisible();
  // Qaytarish (boshqa testlarga ta'sir qilmasin)
  await page.getByRole("button", { name: /Профиль/ }).first().click();
  await page.getByRole("tab", { name: "O'zbekcha" }).click();
  await expect(page.getByRole("button", { name: "Chiqish" })).toBeVisible();
});
