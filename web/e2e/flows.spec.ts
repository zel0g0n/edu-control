import { expect, test } from "@playwright/test";

import { api, apiLogin, login, pickProfile } from "./helpers";

test("o'qituvchi davomat oladi → ota-onaga real vaqtda xabar keladi", async ({ browser }) => {
  // Ota-ona oynasi ochiq turadi
  const parentCtx = await browser.newContext();
  const parent = await parentCtx.newPage();
  await login(parent, "905555555");
  await expect(parent).toHaveURL(/\/parent/);

  const teacherCtx = await browser.newContext();
  const teacher = await teacherCtx.newPage();
  await login(teacher, "903333333");
  await pickProfile(teacher, "O'qituvchi");
  await expect(teacher).toHaveURL(/\/teacher/);
  const tok = await apiLogin("903333333");
  const boot = await api<{ lessons: { id: string; teacherId: string; classId: string }[] }>("/bootstrap", tok);
  const lesson = boot.data.lessons.find((l) => l.teacherId === "t_math" && l.classId === "c_7b")!;
  await teacher.goto(`/teacher/lesson/${lesson.id}/rollcall`);
  await teacher.getByRole("button", { name: "Qolganlar keldi" }).click();
  await teacher.getByRole("button", { name: /^Saqlash/ }).click();
  await expect(teacher.getByText(/Davomat saqlandi/)).toBeVisible();

  // Ota-onada sahifani yangilamasdan bildirishnoma
  await expect(parent.getByText(/Kamila Karimova.*keldi/).first()).toBeVisible({ timeout: 15_000 });
  await parentCtx.close();
  await teacherCtx.close();
});

test("administrator: lid → o'quvchi → parol (kirish kartasi)", async ({ page }) => {
  await login(page, "908888888");
  await expect(page).toHaveURL(/\/director/);
  await page.goto("/director/leads");
  await page.getByRole("button", { name: "Lid qo'shish" }).first().click();
  await page.getByLabel("Ism", { exact: true }).fill("E2E Sinov Lid");
  await page.locator("input[inputmode=numeric]").first().fill("901239876");
  await page.getByRole("button", { name: "Saqlash" }).click();
  await expect(page.getByRole("heading", { name: "E2E Sinov Lid" })).toBeVisible();
  await page.getByRole("button", { name: "O'quvchi qilish" }).first().click();
  await page.getByRole("button", { name: "O'quvchi qilish" }).last().click();
  await expect(page).toHaveURL(/\/director\/students\//);
  await expect(page.getByText("e2e.sinov").first()).toBeVisible();
  await page.getByRole("button", { name: "Parol berish" }).last().click();
  await expect(page.locator("#credential-card")).toBeVisible();
  await expect(page.locator("#credential-card")).toContainText(/\d{6}/);
});

test("direktor: faoliyat jurnali; filial administratori faqat o'z filiali", async ({ page }) => {
  await login(page, "902222222");
  await expect(page).toHaveURL(/\/director/);
  await page.goto("/director/audit");
  await expect(page.getByRole("heading", { name: "Faoliyat jurnali" })).toBeVisible();
  await expect(page.getByText("Tizimga kirdi").first()).toBeVisible();
  // Direktor o'zgartira olmaydi: "O'quvchi qo'shish" tugmasi yo'q
  await page.goto("/director/students");
  await expect(page.getByRole("button", { name: "O'quvchi qo'shish" })).toHaveCount(0);

  const branch = await apiLogin("908888889");
  const view = await api<{ classes: { id: string }[] }>("/bootstrap", branch);
  expect(view.data.classes.map((c) => c.id)).toEqual(["c_sat"]);
});
