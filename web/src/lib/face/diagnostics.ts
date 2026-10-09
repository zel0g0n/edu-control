import { cosine } from "./matcher";

export interface FaceDiagnostics {
  students: number;
  /** Bir o'quvchining turli namunalari o'xshashligi. */
  genuine: number[];
  /** Har ikki o'quvchi juftligi uchun eng katta o'xshashlik. */
  impostor: number[];
  maxImpostor: number | null;
  minGenuine: number | null;
  /** Tavsiya: o'z o'quvchilaringiz namunalari asosida. */
  suggested: { match: number; review: number } | null;
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Muassasadagi haqiqiy yuz namunalari bo'yicha chegaralarni tekshirish.
 * Bolalar (ayniqsa aka-uka, egizaklar) bir-biriga kattalardan ko'ra
 * o'xshashroq bo'lishi mumkin: eng o'xshash ikki xil o'quvchidan yuqoriroq
 * chegara tanlanadi.
 */
export function faceDiagnostics(list: { id: string; templates: ArrayLike<number>[] }[]): FaceDiagnostics {
  const enrolled = list.filter((s) => s.templates.length > 0);
  const genuine: number[] = [];
  const impostor: number[] = [];
  for (const s of enrolled) {
    for (let i = 0; i < s.templates.length; i++) for (let j = i + 1; j < s.templates.length; j++) genuine.push(cosine(s.templates[i], s.templates[j]));
  }
  for (let a = 0; a < enrolled.length; a++) {
    for (let b = a + 1; b < enrolled.length; b++) {
      let m = -1;
      for (const x of enrolled[a].templates) for (const y of enrolled[b].templates) m = Math.max(m, cosine(x, y));
      impostor.push(m);
    }
  }
  const maxImpostor = impostor.length ? Math.max(...impostor) : null;
  const minGenuine = genuine.length ? Math.min(...genuine) : null;
  let suggested: FaceDiagnostics["suggested"] = null;
  if (maxImpostor !== null && enrolled.length >= 5) {
    const match = round2(clamp(maxImpostor + 0.1, 0.36, 0.7));
    const sorted = [...impostor].sort((x, y) => x - y);
    const p95 = sorted[Math.floor((sorted.length - 1) * 0.95)];
    const review = round2(clamp(p95 + 0.05, 0.22, match - 0.08));
    suggested = { match, review };
  }
  return { students: enrolled.length, genuine, impostor, maxImpostor, minGenuine, suggested };
}
