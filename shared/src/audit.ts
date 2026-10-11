// Faoliyat jurnali: kim, qachon, nimani o'zgartirdi. Maxfiy va katta maydonlar
// (yuz namunasi, rasm, xabar matni, kalit xeshi) jurnalga yozilmaydi.
import type { CommandName } from "./commands";
import type { Patch } from "./patch";

export interface AuditEntry {
  id: string;
  /** ms */
  at: number;
  actorId?: string;
  actorRole?: string;
  institutionId?: string;
  /** Buyruq nomi yoki "auth.login", "auth.loginFailed", "auth.passwordReset"... */
  action: string;
  /** Asosiy yozuv (o'quvchi, hisob-varaq, foydalanuvchi id). */
  target?: string;
  details?: Record<string, string | number | boolean>;
  ip?: string;
}

/** Jurnalga yozilmaydigan (shovqin yoki shaxsiy yozishma) buyruqlar. */
export const AUDIT_SKIP: ReadonlySet<string> = new Set<CommandName>(["thread.read", "notification.read", "message.send"]);

const SECRET = new Set(["text", "body", "description", "feedback", "comment", "keyHash", "photo", "snapshot", "templates", "url", "password", "current", "next"]);

/** Buyruq kirishidan xavfsiz qisqa tafsilot va asosiy yozuv id'si. */
export function auditSummary(name: string, input: unknown, patch?: Patch): { target?: string; details: Record<string, string | number | boolean> } {
  const details: Record<string, string | number | boolean> = {};
  const src = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(src)) {
    if (SECRET.has(k) || v === undefined || v === null) continue;
    if (typeof v === "string") details[k] = v.length > 120 ? `${v.slice(0, 120)}…` : v;
    else if (typeof v === "number" || typeof v === "boolean") details[k] = v;
    else if (Array.isArray(v)) details[k] = v.length;
  }
  if (name === "attendance.mark" && Array.isArray(src.marks)) {
    const marks = src.marks as { status?: string }[];
    for (const s of ["present", "late", "absent", "excused"]) {
      const n = marks.filter((m) => m.status === s).length;
      if (n) details[s] = n;
    }
  }
  if (name === "settings.save") {
    delete details.settings;
    details.changed = "settings";
  }
  const ids = ["id", "studentId", "invoiceId", "lessonId", "homeworkId", "classId", "userId"];
  let target = ids.map((k) => src[k]).find((v): v is string => typeof v === "string");
  if (!target && patch?.upsert) {
    for (const [col, list] of Object.entries(patch.upsert)) {
      if (col === "notifications" || !Array.isArray(list) || !list.length) continue;
      target = (list[0] as { id?: string }).id;
      break;
    }
  }
  return { target, details };
}
