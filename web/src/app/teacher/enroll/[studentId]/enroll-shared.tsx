"use client";

import { useRouter } from "next/navigation";
import type { Student } from "@edunazorat/shared";

import { useRun, useToast } from "@/components/providers";
import { useApp, type AppStore } from "@/lib/data/store";
import { FACE } from "@/lib/face/config";
import { cosine, FaceGallery, usableTemplates } from "@/lib/face/matcher";
import { useT } from "@/lib/i18n/react";

// Kamera va rasm orqali ro'yxatga olishning umumiy qismi.

/** Boshqa o'quvchiga juda o'xshash namuna (noto'g'ri o'quvchi tanlangan bo'lishi mumkin). */
export function findDuplicate(app: AppStore, s: Student, list: Float32Array[]): { name: string; score: number } | null {
  const others = app.studentsOfInstitution(s.institutionId).filter((x) => x.id !== s.id);
  const gallery = new FaceGallery(Object.fromEntries(others.map((x) => [x.id, usableTemplates(x)])));
  let worst = { id: "", score: 0 };
  for (const e of list) {
    const r = gallery.match(e);
    if (r.studentId && r.score > worst.score) worst = { id: r.studentId, score: r.score };
  }
  return worst.id && worst.score >= FACE.matchThreshold ? { name: app.student(worst.id)?.name ?? "", score: worst.score } : null;
}

/** Namunalar bir-biriga yetarlicha o'xshashmi (bitta odam, sifatli tasvir). */
export function samplesConsistent(list: Float32Array[]): boolean {
  let minSim = 1;
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) minSim = Math.min(minSim, cosine(list[i], list[j]));
  return minSim >= FACE.reviewThreshold;
}

/** Namunani saqlash (kamera yoki rasmdan) va guruh sahifasiga qaytish. */
export function useSaveEnrollment(s: Student | undefined, backHref: string) {
  const app = useApp();
  const t = useT();
  const run = useRun();
  const router = useRouter();
  const toast = useToast();
  return async (samples: Float32Array[], photo?: string) => {
    if (!s) return;
    const templates = samples.map((e) => Array.from(e, (v) => Math.round(v * 1e5) / 1e5));
    const ok = await run(() => app.run("face.enroll", { studentId: s.id, templates, photo, model: FACE.modelId }));
    if (!ok) return;
    toast(t("{name}: yuz namunasi saqlandi", { name: s.name }), "ok");
    router.replace(backHref);
  };
}
