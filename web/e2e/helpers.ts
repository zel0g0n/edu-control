import { expect, type Page } from "@playwright/test";

export const API = "http://localhost:4310";
export const PASSWORD = "246810";

/** Login sahifasi orqali kirish. */
export async function login(page: Page, who: string, password = PASSWORD) {
  await page.goto("/login");
  await page.getByPlaceholder("ism.familiya yoki 90 123 45 67").fill(who);
  await page.locator('input[type="password"]').fill(password);
  await page.keyboard.press("Enter");
}

/** API'ga to'g'ridan-to'g'ri (ikkinchi foydalanuvchi o'rnida). */
export async function apiLogin(who: string): Promise<string> {
  const r = await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ login: who, password: PASSWORD }) });
  expect(r.status).toBe(200);
  return ((await r.json()) as { token: string }).token;
}

export async function api<T>(path: string, token: string, body?: unknown): Promise<{ status: number; data: T }> {
  const r = await fetch(`${API}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, data: (r.status === 204 ? null : await r.json().catch(() => null)) as T };
}
