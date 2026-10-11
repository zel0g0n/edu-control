import { expect, test } from "@playwright/test";
import { totpCode, totpStep } from "@edunazorat/shared";

import { login } from "./helpers";

// Super admin (boshqa testlarda ishlatilmaydi): 2FA yoqiladi, keyin kirishda kod so'raladi
test("2FA: profil orqali yoqish, keyingi kirishda ilova kodi, zaxira kod", async ({ page }) => {
  await login(page, "900000000");
  await expect(page).toHaveURL(/\/admin/);
  await page.getByRole("button", { name: "Profil va sozlamalar" }).first().click();
  await page.getByRole("button", { name: "Ikki bosqichli kirish" }).click();
  await page.getByRole("button", { name: "Yoqish" }).click();
  await page.getByRole("button", { name: "Boshlash" }).click();
  await page.getByText("QR skanerlab bo'lmasa").click();
  const secret = (await page.getByTestId("mfa-secret").innerText()).replace(/\s/g, "");
  expect(secret).toMatch(/^[A-Z2-7]{32}$/);
  await page.getByLabel("Kod").fill(await totpCode(secret, totpStep(Date.now())));
  await page.getByRole("button", { name: "Tasdiqlash" }).click();
  const codes = (await page.getByTestId("backup-codes").innerText()).split(/\s+/).filter(Boolean);
  expect(codes).toHaveLength(10);
  await page.getByLabel("Zaxira kodlarni saqlab qo'ydim").check();
  await page.getByRole("button", { name: "Tayyor" }).click();
  await expect(page.getByText("Yoqilgan")).toBeVisible();
  await page.keyboard.press("Escape");

  // Chiqib qayta kirish: parol yetarli emas
  await page.getByRole("button", { name: "Profil va sozlamalar" }).first().click();
  await page.getByRole("button", { name: "Chiqish" }).click();
  await login(page, "900000000");
  await expect(page.getByRole("heading", { name: "Ikki bosqichli kirish" })).toBeVisible();
  await page.getByLabel("Kod").fill("000000");
  await page.getByRole("button", { name: "Tasdiqlash" }).click();
  await expect(page.getByText(/Kod noto'g'ri/)).toBeVisible();
  await page.getByLabel("Kod").fill(await totpCode(secret, totpStep(Date.now()) + 1));
  await page.getByRole("button", { name: "Tasdiqlash" }).click();
  await expect(page).toHaveURL(/\/admin/);

  // Telefon yo'q: zaxira kod bilan
  await page.getByRole("button", { name: "Profil va sozlamalar" }).first().click();
  await page.getByRole("button", { name: "Chiqish" }).click();
  await login(page, "900000000");
  await page.getByLabel("Kod").fill(codes[0]);
  await page.getByRole("button", { name: "Tasdiqlash" }).click();
  await expect(page).toHaveURL(/\/admin/);
});
