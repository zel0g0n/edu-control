import path from "node:path";
import { expect, test } from "@playwright/test";

import { API, api, apiLogin, login } from "./helpers";

type Boot = { students: { id: string; name: string; classId: string; parentConsent: boolean; parentIds: string[]; photo?: string; facePhoto?: string; faceQ?: string[]; consentAt?: number }[]; users: { id: string; phone: string }[] };

test("ota-ona: kirishda farzand rasmi uchun rozilik (rad etsa — kira olmaydi)", async ({ page }) => {
  const adm = await apiLogin("907777777");
  const boot = await api<Boot>("/bootstrap", adm);
  const kid = boot.data.students.find((s) => !s.parentConsent && s.parentIds.length === 1)!;
  const parentId = kid.parentIds[0];
  const phone = boot.data.users.find((u) => u.id === parentId)!.phone;
  const card = await api<{ password: string }>("/auth/password/reset", adm, { userId: parentId });

  const signIn = async () => {
    await page.goto("/login");
    await page.getByPlaceholder("ism.familiya yoki 90 123 45 67").fill(phone.slice(3));
    await page.locator('input[type="password"]').fill(card.data.password);
    await page.keyboard.press("Enter");
  };
  await signIn();
  await expect(page.getByRole("heading", { name: "Farzandingiz rasmidan foydalanishga rozilik" })).toBeVisible();
  await expect(page.getByText(kid.name)).toBeVisible();
  // Rad etish → chiqish
  await page.getByRole("button", { name: "Rozi emasman" }).click();
  await page.getByRole("button", { name: "Chiqish" }).click();
  await expect(page).toHaveURL(/\/login/);
  // Qayta kirib rozilik
  await signIn();
  // Birinchi kirishdagi "parolni almashtiring" oynasi rozilikdan keyin chiqadi
  await expect(page.getByRole("button", { name: "Roziman, davom etish" })).toBeDisabled();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Roziman, davom etish" }).click();
  await expect(page).toHaveURL(/\/parent/);
  await expect(page.getByRole("heading", { name: "Farzandingiz rasmidan foydalanishga rozilik" })).toHaveCount(0);
  const after = (await api<Boot>("/bootstrap", adm)).data.students.find((s) => s.id === kid.id)!;
  expect(after.parentConsent).toBe(true);
  expect(after.consentAt).toBeGreaterThan(0);
  // Sozlamalarda rozilik tugmasi yo'q
  await page.goto("/parent/child");
  await expect(page.getByText("Rozilikni bekor qilish uchun maktab administratsiyasiga murojaat qiling.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Rozilik/ })).toHaveCount(0);
});

test("administrator: yangi o'quvchiga rasm (rozilikgacha faqat rasm), rozilik bor o'quvchiga — darhol namuna", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page, "907777777");
  await page.waitForURL(/\/director/);
  await page.goto("/director/students");
  await page.getByRole("button", { name: "O'quvchi qo'shish" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("input").first().fill("Rasmli Bola");
  await dialog.locator('input[type="file"]').setInputFiles(path.join(__dirname, "fixtures", "yuz-0.jpg"));
  await expect(dialog.getByRole("button", { name: "Boshqa rasm" })).toBeVisible({ timeout: 60_000 });
  await dialog.getByRole("button", { name: "Saqlash" }).click();
  await expect(page).toHaveURL(/\/director\/students\/s_/);

  const adm = await apiLogin("907777777");
  let boot = (await api<Boot>("/bootstrap", adm)).data;
  const fresh = boot.students.find((s) => s.name === "Rasmli Bola")!;
  expect(fresh.photo).toMatch(/\/files\/[0-9a-f]{32}$/);
  expect(fresh.faceQ ?? []).toEqual([]);
  // O'qituvchiga rozilikgacha rasm ko'rinmaydi
  const tboot = (await api<Boot>("/bootstrap", await apiLogin("903333333"))).data;
  const inT = tboot.students.find((s) => s.id === fresh.id);
  if (inT) expect(inT.photo).toBeUndefined();

  // Rozilik bor o'quvchi: tahrirlashda rasm → yuz namunasi darhol
  const withConsent = boot.students.find((s) => s.parentConsent && !(s.faceQ?.length) && s.name !== "Rasmli Bola")!;
  await page.goto(`/director/students/${withConsent.id}`);
  await page.getByRole("button", { name: /Tahrirlash/ }).first().click();
  await page.getByRole("dialog").locator('input[type="file"]').setInputFiles(path.join(__dirname, "fixtures", "yuz-1.jpg"));
  await expect(page.getByRole("dialog").getByRole("button", { name: "Boshqa rasm" })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("dialog").getByRole("button", { name: "Saqlash" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  boot = (await api<Boot>("/bootstrap", adm)).data;
  const enrolled = boot.students.find((s) => s.id === withConsent.id)!;
  expect(enrolled.faceQ?.length).toBe(1);
  expect(enrolled.facePhoto).toMatch(/\/files\//);
  void API;
});

test.describe("rozilikdan keyin rasmdan namuna", () => {
  test("administrator rasmni oldindan yuklaydi → ota-ona rozilik beradi → o'qituvchi kamerasi ochilganda namuna tayyor", async ({ page }) => {
    test.setTimeout(120_000);
    const fs = await import("node:fs");
    const adm = await apiLogin("907777777");
    const tch = await apiLogin("903333333");
    const tb = await api<{ lessons: { id: string; classId: string; teacherId: string }[] }>("/bootstrap", tch);
    const boot = (await api<Boot>("/bootstrap", adm)).data;
    const myLessons = tb.data.lessons.filter((l) => l.teacherId === "t_math");
    const kid = boot.students.find((s) => !["s_a0", "s_b0", "s_a2"].includes(s.id) && s.parentIds.length === 1 && !(s.faceQ?.length)
      && myLessons.some((l) => l.classId === s.classId))!;
    // Boshlang'ich holat: rozilik yo'q (administrator ota-ona murojaati bilan bekor qila oladi)
    expect((await api("/commands/consent.set", adm, { studentId: kid.id, consent: false })).status).toBe(200);
    const lesson = myLessons.find((l) => l.classId === kid.classId)!;
    const photo = "data:image/jpeg;base64," + fs.readFileSync(path.join(__dirname, "fixtures", "yuz-2.jpg")).toString("base64");
    expect((await api("/commands/student.photo", adm, { studentId: kid.id, photo })).status).toBe(200);
    // Rozilik: ota-ona
    const card = await api<{ password: string }>("/auth/password/reset", adm, { userId: kid.parentIds[0] });
    const phone = boot.users.find((u) => u.id === kid.parentIds[0])!.phone;
    const pr = await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ login: phone, password: card.data.password }) });
    const ptok = ((await pr.json()) as { token: string }).token;
    expect((await api("/commands/consent.set", ptok, { studentId: kid.id, consent: true })).status).toBe(200);
    // O'qituvchi kamerani ochadi
    await login(page, "903333333");
    await page.getByRole("button", { name: /^O'qituvchi/ }).click();
    await page.waitForURL(/\/teacher/);
    await page.goto(`/teacher/lesson/${lesson.id}/camera`);
    await expect(page.getByText(/namunasi rasmidan tayyorlandi/)).toBeVisible({ timeout: 60_000 });
    const st = (await api<Boot>("/bootstrap", adm)).data.students.find((s) => s.id === kid.id)!;
    expect(st.faceQ?.length).toBe(1);
  });
});
