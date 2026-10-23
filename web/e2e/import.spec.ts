import path from "node:path";
import { expect, test } from "@playwright/test";

import { api, apiLogin, login } from "./helpers";

const fx = (f: string) => path.join(__dirname, "fixtures", f);

test("administrator: o'quvchilarni Excel, Word, PDF va CSV fayldan qo'shadi", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page, "907777777");
  await page.waitForURL(/\/director/);
  await page.goto("/director/students");
  await page.getByRole("button", { name: "Fayldan qo'shish" }).first().click();
  const dialog = page.getByRole("dialog");
  const file = dialog.locator('input[type="file"]');

  // Bir xil ro'yxat to'rt formatda: hammasi bir xil tushunilishi kerak
  for (const f of ["oquvchilar.docx", "oquvchilar.pdf", "oquvchilar.csv", "oquvchilar.xlsx"]) {
    await file.setInputFiles(fx(f));
    await expect(dialog.getByText(f)).toBeVisible();
    await expect(dialog.getByText("Tayyor: 4"), f).toBeVisible();
    await expect(dialog.getByText("Izohli: 1"), f).toBeVisible();
    await expect(dialog.getByText("Allaqachon bor: 1"), f).toBeVisible();
    await expect(dialog.getByText("Xato: 1"), f).toBeVisible();
  }
  await expect(dialog.getByText("Sinf topilmadi: 10-V")).toBeVisible();
  await dialog.getByRole("button", { name: "5 ta o'quvchini qo'shish" }).click();
  await expect(dialog.getByText("5 ta o'quvchi qo'shildi")).toBeVisible();
  await dialog.getByRole("button", { name: "Yopish", exact: true }).last().click();

  const tok = await apiLogin("907777777");
  const boot = await api<{ students: { id: string; name: string; birthDay?: string; classId: string; parentIds: string[] }[]; users: { id: string; phone: string; childIds: string[] }[] }>("/bootstrap", tok);
  const jasur = boot.data.students.find((s) => s.name === "Aliyev Jasur")!;
  const akmal = boot.data.students.find((s) => s.name === "Aliyev Akmal")!;
  expect(jasur).toMatchObject({ birthDay: "2015-04-12", classId: "c_5a" });
  // Aka-uka: bitta ota-ona profili
  expect(jasur.parentIds).toEqual(akmal.parentIds);
  expect(boot.data.users.find((u) => u.id === jasur.parentIds[0])!.childIds.length).toBe(2);
  expect(boot.data.students.find((s) => s.name === "Karimova Nilufar")).toMatchObject({ birthDay: "2013-09-03", classId: "c_7b" });

  // Qayta yuklansa: hammasi "allaqachon bor"
  await page.getByRole("button", { name: "Fayldan qo'shish" }).first().click();
  await page.getByRole("dialog").locator('input[type="file"]').setInputFiles(fx("oquvchilar.xlsx"));
  await expect(page.getByRole("dialog").getByText("Allaqachon bor: 6")).toBeVisible();
});
