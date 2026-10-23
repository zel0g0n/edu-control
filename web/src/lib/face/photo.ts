"use client";

// Tayyor rasmdan (galereya, administrator yuklagan rasm) yuz namunasi: tekshiruv va raqamli namuna.
// Hammasi brauzerda: rasmning o'zi serverga yuborilmaydi.
import type { Student } from "@edunazorat/shared";

import { faceSnapshot } from "@/components/camera-stage";
import type { AppStore } from "@/lib/data/store";
import { faceWorker } from "@/lib/face/client";
import { FACE } from "@/lib/face/config";
import { usableTemplates } from "@/lib/face/matcher";
import { eyeDistance, yawRatio, type Detection } from "@/lib/face/yunet";
import { t as tr } from "@/lib/i18n";

export interface PhotoAnalysis {
  state: "ok" | "bad";
  reason?: string;
  embedding?: Float32Array;
  /** Kichik yuz kesimi (o'qituvchi ro'yxati va ota-ona uchun). */
  crop?: string;
  /** To'g'ridan qaragan (asosiy surat uchun afzal). */
  frontal?: boolean;
}

/** Tahlil uchun rasm o'lchami (kamera kadri bilan bir xil chegara). */
const MAX_SIDE = FACE.frameMaxSide;


/** Bir nechta yuz bo'lsa: eng kattasi boshqalardan aniq katta bo'lsagina o'sha (o'quvchi oldinda). */
function pickFace(dets: Detection[]): Detection | null {
  if (dets.length === 1) return dets[0];
  const byArea = [...dets].sort((a, b) => b.box[2] * b.box[3] - a.box[2] * a.box[3]);
  const [a, b] = byArea;
  return a.box[2] * a.box[3] >= 2.2 * (b.box[2] * b.box[3]) ? a : null;
}

/** Fayldan: yo'nalishi to'g'rilangan (EXIF), kichraytirilgan canvas. */
async function loadCanvas(file: Blob): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(bmp.width * k));
  c.height = Math.max(1, Math.round(bmp.height * k));
  c.getContext("2d", { willReadFrequently: true })!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return c;
}

/** Bitta rasmni tekshirish: bitta yuz, yetarli kattalik, keskinlik, bosh burilishi. */
export async function analysePhoto(file: Blob): Promise<PhotoAnalysis> {
  if (!file.type.startsWith("image/")) return { state: "bad", reason: tr("Bu rasm fayli emas") };
  let canvas: HTMLCanvasElement;
  try {
    canvas = await loadCanvas(file);
  } catch {
    return { state: "bad", reason: tr("Rasmni ochib bo'lmadi (boshqa formatda saqlang: JPG yoki PNG)") };
  }
  const image = canvas.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, canvas.width, canvas.height);
  const dets = await faceWorker.detect(image);
  if (dets.length === 0) return { state: "bad", reason: tr("Rasmda yuz topilmadi") };
  const d = pickFace(dets);
  if (!d) return { state: "bad", reason: tr("Rasmda bir nechta yuz bor: faqat shu o'quvchi ko'ringan rasmni tanlang") };
  if (eyeDistance(d) < 40) return { state: "bad", reason: tr("Yuz juda kichik: yaqinroqdan olingan rasm tanlang") };
  const yaw = yawRatio(d);
  if (Math.abs(yaw) > 0.4) return { state: "bad", reason: tr("Yuz juda yon tomonga burilgan") };
  const [r] = await faceWorker.embedWithQuality([d.kps]);
  if (!r) return { state: "bad", reason: tr("Yuzni o'qib bo'lmadi") };
  if (r.quality < FACE.enrollMinSharpness) return { state: "bad", reason: tr("Rasm xira: aniqroq rasm tanlang") };
  return { state: "ok", embedding: r.embedding, crop: faceSnapshot(canvas, d), frontal: Math.abs(yaw) < 0.12 };
}


/**
 * Ota-ona rozilik bergach: administrator oldindan yuklagan rasmdan yuz namunasi (kamera ochilganda,
 * model allaqachon yuklangan paytda). Namuna rozilikdan oldin hech qachon yaratilmaydi.
 */
export async function enrollFromStoredPhotos(app: AppStore, students: Student[]): Promise<string[]> {
  const done: string[] = [];
  for (const s of students) {
    if (!s.parentConsent || !s.photo || usableTemplates(s).length) continue;
    try {
      const url = s.photo.startsWith("data:") ? s.photo : (await app.signFileUrls([s.photo]))[s.photo];
      if (!url) continue;
      const r = await analysePhoto(await (await fetch(url)).blob());
      if (r.state !== "ok" || !r.embedding) continue;
      await app.run("face.enroll", { studentId: s.id, templates: [Array.from(r.embedding, (v) => Math.round(v * 1e5) / 1e5)], photo: r.crop, model: FACE.modelId });
      done.push(s.id);
    } catch {
      // Keyingi safar qayta urinadi (tarmoq yoki rasm muammosi)
    }
  }
  return done;
}
