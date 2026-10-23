import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

import { api, apiLogin, login, pickProfile } from "./helpers";

// Sintetik yuzlar (SFHQ, MIT litsenziya; haqiqiy odam emas) — public/demo bilan bir xil manba
const fx = (f: string) => path.join(__dirname, "fixtures", f);

function unpack(b64: string): number[] {
  const buf = Buffer.from(b64, "base64");
  const scale = buf.readFloatLE(0);
  return Array.from(new Int8Array(buf.buffer, buf.byteOffset + 4, buf.length - 4), (v) => (v / 127) * scale);
}
const cos = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0) / (Math.hypot(...a) * Math.hypot(...b));

test("o'qituvchi: yuz namunasini galereyadagi rasmdan qo'shadi", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page, "903333333");
  await pickProfile(page, "O'qituvchi");
  await page.goto("/teacher/classes/c_7b?tab=students");
  await page.getByRole("link", { name: "Rasmdan" }).first().waitFor();
  await page.goto("/teacher/enroll/s_b0?from=c_7b&mode=photo");
  await expect(page.getByRole("button", { name: /Rasm tanlash/ })).toBeEnabled({ timeout: 60_000 });

  // Yaroqli rasm, yuzsiz rasm va ko'p yuzli sinf rasmi
  await page.locator('input[type="file"]').setInputFiles([fx("yuz-0.jpg"), fx("yuzsiz.jpg"), fx("sinf.jpg")]);
  await expect(page.getByText(/Yaroqli/)).toHaveCount(1, { timeout: 30_000 });
  await expect(page.getByText("Rasmda yuz topilmadi")).toBeVisible();
  await expect(page.getByText(/bir nechta yuz bor|Yuz juda kichik/)).toBeVisible();
  await page.getByRole("button", { name: /Namunani saqlash \(1 ta rasm\)/ }).click();
  await expect(page).toHaveURL(/\/teacher\/classes\/c_7b/);

  // Serverda: bitta namuna (shu yuzning kamera namunalariga mos) va yuz kesimi fayl sifatida
  const tok = await apiLogin("903333333");
  const boot = await api<{ students: { id: string; faceQ?: string[]; facePhoto?: string; faceModel?: string }[] }>("/bootstrap", tok);
  const st = boot.data.students.find((s) => s.id === "s_b0")!;
  expect(st.faceQ?.length).toBe(1);
  expect(st.facePhoto).toMatch(/\/files\/[0-9a-f]{32}$/);
  const demo = JSON.parse(fs.readFileSync(path.join(__dirname, "../public/demo/sinf-demo.json"), "utf8")) as { faces: { id: string; templates: number[][] }[] };
  const mine = unpack(st.faceQ![0]);
  const same = Math.max(...demo.faces[0].templates.map((t) => cos(mine, t)));
  const others = Math.max(...demo.faces.slice(1).flatMap((f) => f.templates.map((t) => cos(mine, t))));
  // Rasmdan olingan namuna videodagi o'sha yuzni taniydi, boshqalarni emas
  expect(same).toBeGreaterThan(0.4);
  expect(same).toBeGreaterThan(others + 0.1);
  console.log(`rasm→video o'xshashlik: o'zi ${same.toFixed(2)}, boshqalar max ${others.toFixed(2)}`);
});
