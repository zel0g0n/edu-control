import { Inject, Injectable } from "@nestjs/common";
import { randomBytes } from "node:crypto";

import { CONFIG, type Config } from "./config";
import { SQL, type Sql } from "./db/sql";

const DATA_URL = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/;
/** Sxema chegarasi (300 KB) bilan bir xil: kattasini buyruq tekshiruvi rad etadi. */
const MAX_BYTES = 300_000;

/**
 * Davomatdagi yuz kesimi (data URL, ~15 KB) yozuv ichida saqlanmaydi: fayllar jadvaliga yoziladi, yozuvda
 * faqat havola. Aks holda har bir dars x o'quvchi yozuvi bazada, server xotirasida va har yuklashda
 * brauzerga ketardi (800 o'quvchili maktabda oyiga gigabaytlab). Ko'rish huquqi — o'sha o'quvchini
 * ko'ra oladiganlarga (o'qituvchi, ota-onasi, rahbariyat): /files/sign.
 */
@Injectable()
export class SnapshotsService {
  constructor(@Inject(SQL) private readonly sql: Sql, @Inject(CONFIG) private readonly config: Config) {}

  /** Yuz namunasi rasmi (face.enroll photo): xuddi shunday fayl sifatida. */
  async extractPhoto(ownerId: string, input: { studentId?: unknown; photo?: unknown }): Promise<number> {
    if (typeof input?.photo !== "string" || typeof input.studentId !== "string") return 0;
    const m = { studentId: input.studentId, snapshot: input.photo as unknown };
    const bytes = await this.extract(ownerId, [m]);
    if (bytes) input.photo = m.snapshot;
    return bytes;
  }

  /** marks[].snapshot (data URL) → fayl havolasi (joyida almashtiriladi). Qaytadi: yozilgan baytlar. */
  async extract(ownerId: string, marks: unknown): Promise<number> {
    if (!Array.isArray(marks)) return 0;
    const seen = new Map<string, string>();
    let bytes = 0;
    for (const m of marks as { studentId?: unknown; snapshot?: unknown }[]) {
      const snap = m?.snapshot;
      if (typeof snap !== "string" || typeof m.studentId !== "string") continue;
      const hit = DATA_URL.exec(snap);
      if (!hit) continue;
      const data = Buffer.from(hit[2], "base64");
      if (!data.length || data.length > MAX_BYTES) continue;
      // Bir so'rovda bir o'quvchiga bir xil rasm (bir necha dars) — bitta fayl
      const key = `${m.studentId}|${snap.length}|${snap.slice(-64)}`;
      let url = seen.get(key);
      if (!url) {
        const id = randomBytes(16).toString("hex");
        await this.sql.query("INSERT INTO files (id, owner_id, name, type, size, data, student_id) VALUES ($1, $2, $3, $4, $5, $6, $7)",
          [id, ownerId, "yuz.jpg", `image/${hit[1]}`, data.length, data, m.studentId.slice(0, 100)]);
        url = `${this.config.publicUrl}/files/${id}`;
        seen.set(key, url);
        bytes += data.length;
      }
      m.snapshot = url;
    }
    return bytes;
  }
}
