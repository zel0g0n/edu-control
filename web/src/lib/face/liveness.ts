import type { Point } from "./image";
import type { Detection } from "./yunet";

/**
 * Jonlilik (liveness) tekshiruvi, 5 nuqta bo'yicha.
 *
 * G'oya: tekis narsa (qog'ozdagi rasm, telefon ekrani) qanday aylantirilmasin,
 * uning nuqtalari orasidagi affin munosabat o'zgarmaydi. Burunning ko'zlar va
 * og'iz asosidagi (a, b) affin koordinatalari rasm uchun doimiy qoladi.
 * Haqiqiy boshda esa burun oldinga chiqqan: bosh ozgina burilsa yoki egilsa
 * (bolalar doim qimirlaydi), bu koordinatalar sezilarli o'zgaradi.
 *
 * Cheklov: ekrandagi videoni bu usul ajrata olmaydi. Maqsad: sinfdoshining
 * rasmini ko'rsatib "keldi" qildirishning oldini olish. O'qituvchi baribir
 * xonada, shubhali holatda tasdiqni o'zi beradi.
 */

export type LivenessState = "pending" | "live" | "static";

export interface LivenessConfig {
  /** Shuncha kuzatuvdan keyin qimirlamasa: "static". */
  minSamples: number;
  /** Burun xatosi tekis-model shovqinidan necha baravar katta bo'lishi kerak. */
  ratio: number;
  /** Burun xatosi kamida shuncha piksel (o'rtacha kvadratik). */
  minErrorPx: number;
  window: number;
}

export const LIVENESS: LivenessConfig = { minSamples: 15, ratio: 14, minErrorPx: 1.5, window: 24 };

type Kps = Detection["kps"];

/** 4 nuqta (ko'zlar, og'iz burchaklari) bo'yicha eng kichik kvadratlar affin moslash. */
function fitAffine(src: Point[], dst: Point[]): number[] | null {
  // [x' y'] = [a b c; d e f] [x y 1]
  let sxx = 0, sxy = 0, syy = 0, sx = 0, sy = 0;
  const n = src.length;
  for (const [x, y] of src) {
    sxx += x * x; sxy += x * y; syy += y * y; sx += x; sy += y;
  }
  const M = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, n]];
  const inv = invert3(M);
  if (!inv) return null;
  const out: number[] = [];
  for (const k of [0, 1]) {
    let bx = 0, by = 0, b1 = 0;
    src.forEach(([x, y], i) => {
      bx += x * dst[i][k]; by += y * dst[i][k]; b1 += dst[i][k];
    });
    for (const row of inv) out.push(row[0] * bx + row[1] * by + row[2] * b1);
  }
  return out;
}

function invert3(m: number[][]): number[][] | null {
  const [[a, b, c], [d, e, f], [g, h, i]] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-9) return null;
  return [
    [A / det, -(b * i - c * h) / det, (b * f - c * e) / det],
    [B / det, (a * i - c * g) / det, -(a * f - c * d) / det],
    [C / det, -(a * h - b * g) / det, (a * e - b * d) / det],
  ];
}

const apply = (t: number[], [x, y]: Point): Point => [t[0] * x + t[1] * y + t[2], t[3] * x + t[4] * y + t[5]];

/**
 * Bitta kadr juftligi: birinchi kadrdan keyingisiga tekis (affin) moslash.
 * res: 4 tayanch nuqta qoldig'i (shovqin bahosi, 2 erkinlik darajasi),
 * nose: burun bashorati xatosi. Tekis rasmda ikkalasi ham faqat shovqin.
 */
export function planarResidual(ref: Kps, cur: Kps): { res: number; nose: number } | null {
  const idx = [0, 1, 3, 4];
  const src = idx.map((i) => ref[i]);
  const dst = idx.map((i) => cur[i]);
  const t = fitAffine(src, dst);
  if (!t) return null;
  let res = 0;
  src.forEach((p, k) => {
    const q = apply(t, p);
    res += (q[0] - dst[k][0]) ** 2 + (q[1] - dst[k][1]) ** 2;
  });
  const q = apply(t, ref[2]);
  return { res, nose: (q[0] - cur[2][0]) ** 2 + (q[1] - cur[2][1]) ** 2 };
}

/** Burunning (o'ng ko'z, chap ko'z, og'iz o'rtasi) asosidagi affin koordinatalari. */
export function noseAffine(kps: Kps): [number, number] | null {
  const [p0, p1, n, m1, m2] = kps;
  const m: Point = [(m1[0] + m2[0]) / 2, (m1[1] + m2[1]) / 2];
  const ux = p1[0] - p0[0], uy = p1[1] - p0[1];
  const vx = m[0] - p0[0], vy = m[1] - p0[1];
  const det = ux * vy - uy * vx;
  if (Math.abs(det) < 1e-6) return null;
  const rx = n[0] - p0[0], ry = n[1] - p0[1];
  return [(rx * vy - ry * vx) / det, (ux * ry - uy * rx) / det];
}

/** Bitta kuzatilayotgan yuz uchun jonlilik hisoblagichi. */
export class LivenessMeter {
  private frames: Kps[] = [];
  state: LivenessState = "pending";
  /** Burun xatosi / shovqin nisbati (diagnostika uchun). */
  score = 0;

  constructor(private readonly cfg: LivenessConfig = LIVENESS) {}

  observe(det: Detection): LivenessState {
    if (this.state === "live") return this.state;
    this.frames.push(det.kps);
    if (this.frames.length > this.cfg.window) this.frames.shift();
    if (this.frames.length < 10) return this.state;
    // Har bir kadr juftligi (i < j): ko'p juftlik shovqinni yaxshiroq baholaydi.
    let res = 0, nose = 0, pairs = 0;
    const f = this.frames;
    for (let i = 0; i < f.length; i += 2) {
      for (let j = i + 1; j < f.length; j++) {
        const r = planarResidual(f[i], f[j]);
        if (!r) continue;
        res += r.res / 2; // 8 tenglama - 6 noma'lum = 2 erkinlik darajasi
        nose += r.nose;
        pairs++;
      }
    }
    if (!pairs) return this.state;
    const noise = res / pairs;
    const err = nose / pairs;
    this.score = err / Math.max(noise, 1e-3);
    if (err >= this.cfg.minErrorPx ** 2 && this.score >= this.cfg.ratio) this.state = "live";
    else if (this.frames.length >= this.cfg.minSamples) this.state = "static";
    return this.state;
  }

  reset() {
    this.frames = [];
    this.state = "pending";
    this.score = 0;
  }
}
