import { expect, test } from "@playwright/test";

import { api, apiLogin, login, PASSWORD, pickProfile } from "./helpers";

test("o'qituvchi farzandi shu maktabda: profil tanlanadi va almashtiriladi", async ({ page }) => {
  await login(page, "903333333");
  // Kirishdan keyin: qaysi profil bilan
  await pickProfile(page, "Ota-ona");
  await expect(page).toHaveURL(/\/parent/);
  await expect(page.getByText("Sherzod Karimov").first()).toBeVisible();
  // O'qituvchi sahifasi ochilsa: yo'naltirish emas, profilga o'tish taklifi
  await page.goto("/teacher");
  await expect(page.getByRole("heading", { name: "Bu sahifa boshqa profilingizda" })).toBeVisible();
  await page.getByRole("button", { name: /^O'qituvchi profiliga o'tish/ }).click();
  await expect(page).toHaveURL(/\/teacher$/);
  // Profil menyusi orqali ota-onaga qaytish
  await page.getByRole("button", { name: "Profil va sozlamalar" }).first().click();
  await page.getByRole("button", { name: /^Ota-ona profiliga o'tish/ }).click();
  await expect(page).toHaveURL(/\/parent/);
  await expect(page.getByText("Sherzod Karimov").first()).toBeVisible();
});

test("ota-ona profili o'qituvchi ma'lumotini ko'rmaydi", async () => {
  const tok = await apiLogin("903333333");
  const list = await api<{ id: string; role: string }[]>("/auth/profiles", tok);
  const parent = list.data.find((p) => p.role === "parent")!;
  const sw = await api<{ token: string }>("/auth/profiles/switch", tok, { userId: parent.id });
  expect(sw.status).toBe(200);
  const boot = await api<{ students: { id: string }[] }>("/bootstrap", sw.data.token);
  expect(boot.data.students.map((s) => s.id)).toEqual(["s_a2"]);
});

test("boshqa rolning sahifasi: jim yo'naltirish emas, boshqa hisob bilan kirish taklifi", async ({ page }) => {
  await login(page, "905555555");
  await expect(page).toHaveURL(/\/parent/);
  await page.goto("/director");
  await expect(page.getByRole("heading", { name: "Bu sahifa direktor va administrator uchun" })).toBeVisible();
  await expect(page).toHaveURL(/\/director$/);
  await page.getByRole("button", { name: "Chiqib, boshqa hisob bilan kirish" }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fdirector/);
  await page.getByPlaceholder("ism.familiya yoki 90 123 45 67").fill("902222222");
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/director$/);
  // Begona yo'l (boshqa sayt) ?next= orqali ochilmaydi
  await page.getByRole("button", { name: "Profil va sozlamalar" }).first().click();
  await page.getByRole("button", { name: "Chiqish" }).click();
  await page.goto("/login?next=//evil.example");
  await page.getByPlaceholder("ism.familiya yoki 90 123 45 67").fill("905555555");
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/parent$/);
});
