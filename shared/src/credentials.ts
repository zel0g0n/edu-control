// Kirish ma'lumotlari: login yaratish, kim kimga parol bera oladi.
// Parol xeshi bu yerda emas: u mijozga hech qachon yuborilmaydi (API: credentials jadvali).
import { branchLimit } from "./branches";
import { newId } from "./ids";
import { normalizePhone } from "./permissions";
import { CommandError } from "./patch";
import type { AppUser, Database, Student } from "./types";

const CYR: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "j", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m",
  н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "x", ц: "ts", ч: "ch", ш: "sh", щ: "sh", ъ: "",
  ы: "i", ь: "", э: "e", ю: "yu", я: "ya", ў: "o", қ: "q", ғ: "g", ҳ: "h",
};

/** "Oʻg'iloy Xo'jayeva" → "ogiloy", "xojayeva"; kirill ham lotinga o'tadi. */
function slugWord(w: string): string {
  return [...w.toLowerCase()].map((ch) => CYR[ch] ?? ch).join("")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/** O'quvchi logini: ism.familiya (birinchi ikki so'z). Band bo'lsa ism.familiya2, 3... */
export function makeStudentLogin(name: string, used: Set<string>): string {
  const words = name.trim().split(/\s+/).map(slugWord).filter(Boolean);
  const base = (words.slice(0, 2).join(".") || "oquvchi").slice(0, 40);
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) if (!used.has(`${base}${n}`)) return `${base}${n}`;
}

export function usedLogins(db: Pick<Database, "users">): Set<string> {
  return new Set(db.users.map((u) => u.login).filter((x): x is string => !!x));
}

/** Kirish uchun login: o'quvchida ism.familiya, kattalarda telefon raqami. */
export function loginOf(u: AppUser): string {
  return u.login || (u.phone ? `+${u.phone}` : "");
}

/** Kiritilgan login bo'yicha foydalanuvchi: harf bo'lsa login, raqam bo'lsa telefon. */
export function findUserByLogin(db: Pick<Database, "users" | "institutions">, raw: string): AppUser {
  const s = String(raw ?? "").trim().toLowerCase();
  let u: AppUser | undefined;
  if (/[a-z]/.test(s)) u = db.users.find((x) => x.active && x.login === s);
  else {
    const phone = normalizePhone(s);
    u = phone ? db.users.find((x) => x.active && x.phone === phone) : undefined;
  }
  if (!u) throw new CommandError("err.badLogin", {}, 401);
  const inst = u.institutionId ? db.institutions.find((i) => i.id === u.institutionId) : undefined;
  if (inst && !inst.active) throw new CommandError("err.institutionBlocked", {}, 403);
  return u;
}

/** Tasodifiy 6 xonali parol (111111, 123456 kabi oson ketma-ketliklarsiz). */
/** Butun muassasa ma'lumotiga kira oladigan rollar: kuchliroq parol. */
export function needsStrongPassword(role?: AppUser["role"]): boolean {
  return role === "superAdmin" || role === "director" || role === "admin";
}

/** Rahbariyat paroli: 10 belgi (chalkash belgilarsiz: 0/O, 1/l/I yo'q). */
const STAFF_ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const STAFF_PASSWORD_MIN = 10;

export function generatePassword(role?: AppUser["role"]): string {
  if (needsStrongPassword(role)) {
    const buf = new Uint32Array(STAFF_PASSWORD_MIN);
    for (;;) {
      globalThis.crypto.getRandomValues(buf);
      const p = [...buf].map((x) => STAFF_ALPHABET[x % STAFF_ALPHABET.length]).join("");
      if (/\d/.test(p) && /[a-zA-Z]/.test(p)) return p;
    }
  }
  const buf = new Uint32Array(1);
  for (;;) {
    globalThis.crypto.getRandomValues(buf);
    const p = String(buf[0] % 1_000_000).padStart(6, "0");
    if (!isWeakPin(p)) return p;
  }
}

/** Bir xil raqamlar yoki ketma-ket (o'suvchi/kamayuvchi) parollar. */
export function isWeakPin(p: string): boolean {
  if (/^(\d)\1+$/.test(p)) return true;
  const d = [...p].map(Number);
  const step = d[1] - d[0];
  return Math.abs(step) === 1 && d.every((x, i) => i === 0 || x - d[i - 1] === step);
}

/** Yangi parol talabi (foydalanuvchi o'zi o'zgartirganda). */
export function checkNewPassword(p: string, role?: AppUser["role"]): void {
  if (needsStrongPassword(role)) {
    if (typeof p !== "string" || p.length < STAFF_PASSWORD_MIN || p.length > 64) throw new CommandError("err.passwordShort", { n: STAFF_PASSWORD_MIN }, 400);
    if (!/\d/.test(p) || !/\p{L}/u.test(p)) throw new CommandError("err.passwordStaff", { n: STAFF_PASSWORD_MIN }, 400);
    return;
  }
  if (typeof p !== "string" || p.length < 6 || p.length > 64) throw new CommandError("err.passwordShort", { n: 6 }, 400);
  if (/^\d+$/.test(p) && isWeakPin(p)) throw new CommandError("err.passwordWeak", {}, 400);
}

/**
 * Kim kimga parol bera (tiklay) oladi:
 * super admin: hammaga; direktor: o'z muassasasi administratorlariga;
 * administrator: o'z muassasasidagi o'qituvchi, o'quvchi va ota-onalarga.
 */
export function canManageCredentials(actor: AppUser, target: AppUser, db: Pick<Database, "students" | "classes" | "institutions">): boolean {
  if (actor.id === target.id) return false;
  // Filial administratori: faqat o'z filiali o'quvchilari va ularning ota-onalari (o'qituvchilar umumiy)
  const limit = branchLimit(db, actor);
  if (limit && (target.role === "student" || target.role === "parent")) {
    const mine = db.students.some((s) => s.institutionId === actor.institutionId && limit.studentOk(s)
      && (s.userId === target.id || s.parentIds.includes(target.id)));
    if (!mine) return false;
  }
  if (actor.role === "superAdmin") return true;
  if (!actor.institutionId) return false;
  if (actor.role === "director") return target.role === "admin" && target.institutionId === actor.institutionId;
  if (actor.role !== "admin") return false;
  if (target.role === "teacher" || target.role === "student") return target.institutionId === actor.institutionId;
  if (target.role === "parent") {
    return target.institutionId === actor.institutionId
      || db.students.some((s) => s.institutionId === actor.institutionId && s.parentIds.includes(target.id));
  }
  return false;
}

/**
 * Har bir o'quvchining o'z akkaunti bo'lsin (login ism.familiya). Eski ma'lumotlar
 * uchun: akkaunti yo'q o'quvchilarga yaratadi, logini yo'q o'quvchi akkauntlariga login beradi.
 */
export function ensureStudentAccounts(db: Pick<Database, "students" | "users">, makeId: (prefix: string) => string = newId): { students: Student[]; users: AppUser[] } {
  const used = usedLogins(db);
  const students: Student[] = [];
  const users: AppUser[] = [];
  for (const s of db.students) {
    const acc = s.userId ? db.users.find((u) => u.id === s.userId) : undefined;
    if (acc) {
      if (acc.login) continue;
      const login = makeStudentLogin(s.name, used);
      used.add(login);
      users.push({ ...acc, login });
      continue;
    }
    const login = makeStudentLogin(s.name, used);
    used.add(login);
    const u: AppUser = { id: makeId("u"), name: s.name, phone: "", role: "student", institutionId: s.institutionId, subjects: [], childIds: [], studentId: s.id, login, active: !s.archived };
    users.push(u);
    students.push({ ...s, userId: u.id });
  }
  return { students, users };
}
