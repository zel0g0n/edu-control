import { FACE } from "./config";
import { LivenessMeter } from "./liveness";
import { iou, type Detection } from "./yunet";

export interface Thresholds {
  match: number;
  review: number;
  margin: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = { match: FACE.matchThreshold, review: FACE.reviewThreshold, margin: FACE.minMargin };

export type MatchLevel = "confident" | "review" | "unknown";

export interface MatchResult {
  studentId: string | null;
  score: number;
  second: number;
  level: MatchLevel;
}

export const NO_MATCH: MatchResult = { studentId: null, score: 0, second: 0, level: "unknown" };

export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

/** Joriy model bilan olingan namunalar (boshqa model namunalari solishtirib bo'lmaydi). */
export function usableTemplates(s: { faceTemplates: number[][]; faceModel?: string }): number[][] {
  const model = s.faceModel ?? (s.faceTemplates[0]?.length === 192 ? "mobilefacenet-v1" : "?");
  if (model !== FACE.modelId) return [];
  return s.faceTemplates.filter((t) => t.length === FACE.embeddingLength);
}

/** Namunasi bor, lekin eski model bilan: qayta ro'yxatga olish kerak. */
export function needsReenroll(s: { faceTemplates: number[][]; faceModel?: string }): boolean {
  return s.faceTemplates.length > 0 && usableTemplates(s).length === 0;
}

/** Keskinlikdan o'rtacha uchun og'irlik (0.25..1). */
export function qualityWeight(sharpness: number): number {
  return Math.max(0.25, Math.min(1, sharpness / FACE.sharpRef));
}

/** Sinf o'quvchilarining yuz namunalari. */
export class FaceGallery {
  constructor(readonly templates: Record<string, ArrayLike<number>[]>, readonly thresholds: Thresholds = DEFAULT_THRESHOLDS) {}

  get isEmpty(): boolean {
    return Object.values(this.templates).every((t) => t.length === 0);
  }

  /**
   * relaxed: uzoqdagi kichik yuz, bir necha kadr o'rtachasi bilan. Kichik
   * yuzda o'xshashlik tabiiy pastroq (simulyatsiya: 11-13 px da 0.46-0.82),
   * shuning uchun chegara biroz past, lekin ikkinchi nomzoddan farq kattaroq talab qilinadi.
   */
  match(embedding: ArrayLike<number>, exclude: Set<string> = new Set(), relaxed = false): MatchResult {
    let best: string | null = null;
    let bestScore = -1;
    let second = -1;
    for (const [id, list] of Object.entries(this.templates)) {
      if (exclude.has(id) || list.length === 0) continue;
      let s = -1;
      for (const t of list) s = Math.max(s, cosine(embedding, t));
      if (s > bestScore) {
        second = bestScore;
        bestScore = s;
        best = id;
      } else if (s > second) {
        second = s;
      }
    }
    if (!best) return NO_MATCH;
    const margin = bestScore - Math.max(0, second);
    const matchT = relaxed ? this.thresholds.match - FACE.smallFaceRelax : this.thresholds.match;
    const marginT = relaxed ? Math.max(this.thresholds.margin, FACE.smallFaceMargin) : this.thresholds.margin;
    const level: MatchLevel =
      bestScore >= matchT && margin >= marginT ? "confident"
        : bestScore >= this.thresholds.review ? "review" : "unknown";
    return { studentId: best, score: bestScore, second, level };
  }
}

/** Bitta kuzatilayotgan yuz: bir necha kadr bo'yicha ovoz berish. */
export class Track {
  readonly votes = new Map<string, number>();
  confirmedId: string | null = null;
  byTeacher = false;
  last: MatchResult = NO_MATCH;
  missed = 0;
  readonly liveness = new LivenessMeter();
  /** Oxirgi marta namuna olingan sikl (navbat uchun). */
  lastEmbed = -1;
  private embSum: Float32Array | null = null;
  private embCount = 0;

  /**
   * Bir necha kadrdagi namunalarning o'rtachasi: uzoqdagi kichik yuzlarda
   * bitta kadr shovqinli, o'rtacha esa barqaror (tanish tezlashadi va aniqlashadi).
   */
  addEmbedding(e: Float32Array, maxCount = 8, weight = 1): Float32Array {
    if (!this.embSum || this.embSum.length !== e.length) {
      this.embSum = new Float32Array(e.length);
      this.embCount = 0;
    }
    // Eski namunalar ta'siri asta kamayadi (yuz burilsa, yorug'lik o'zgarsa).
    const keep = this.embCount >= maxCount ? (maxCount - 1) / maxCount : 1;
    let n = 0;
    for (let i = 0; i < e.length; i++) {
      this.embSum[i] = this.embSum[i] * keep + e[i] * weight;
      n += this.embSum[i] * this.embSum[i];
    }
    this.embCount = Math.min(maxCount, this.embCount + 1);
    n = Math.sqrt(n) || 1;
    const mean = new Float32Array(e.length);
    for (let i = 0; i < e.length; i++) mean[i] = this.embSum[i] / n;
    return mean;
  }

  /** Nechta kadr namunasi o'rtachaga kirgan. */
  get samples(): number {
    return this.embCount;
  }

  constructor(readonly id: number, public box: Detection["box"]) {}

  /** Ovoz yetarli, lekin jonlilik hali isbotlanmagan nomzod. */
  get candidate(): string | null {
    for (const [id, v] of this.votes) if (v >= FACE.votesToConfirm) return id;
    return null;
  }

  votesFor(id: string): number {
    return this.votes.get(id) ?? 0;
  }

  /**
   * Natijani qo'shadi; yangi tasdiqlansa o'quvchi id'sini qaytaradi.
   * requireLive: yuz jonli ekani ko'rinmaguncha avtomatik tasdiqlanmaydi.
   */
  add(r: MatchResult, requireLive = false, votesNeeded: number = FACE.votesToConfirm): string | null {
    this.last = r;
    if (this.confirmedId || r.level !== "confident" || !r.studentId) return null;
    const v = (this.votes.get(r.studentId) ?? 0) + 1;
    this.votes.set(r.studentId, v);
    if (v >= votesNeeded && (!requireLive || this.liveness.state === "live")) {
      this.confirmedId = r.studentId;
      return r.studentId;
    }
    return null;
  }
}

/** Kadrlar orasida yuzlarni IoU bo'yicha bog'lash. */
export class Tracker {
  private next = 1;
  tracks: Track[] = [];

  constructor(private readonly iouThreshold = 0.3, private readonly maxMissed = 6) {}

  /** Har bir aniqlangan yuzga track beradi (indekslar bo'yicha). */
  update(dets: Detection[]): Track[] {
    const assigned: (Track | null)[] = dets.map(() => null);
    const used = new Set<Track>();
    const pairs: { d: number; t: Track; v: number }[] = [];
    dets.forEach((d, i) => {
      for (const t of this.tracks) {
        const v = iou(d.box, t.box);
        if (v >= this.iouThreshold) {
          pairs.push({ d: i, t, v });
          continue;
        }
        // Kichik (uzoqdagi) yuzlarda IoU titrashga sezgir: markazlar yaqinligi ham hisobga olinadi.
        const size = Math.max(d.box[2], t.box[2]);
        const dist = Math.hypot(d.box[0] + d.box[2] / 2 - (t.box[0] + t.box[2] / 2), d.box[1] + d.box[3] / 2 - (t.box[1] + t.box[3] / 2));
        const ratio = Math.min(d.box[2], t.box[2]) / size;
        if (dist < 0.6 * size && ratio > 0.6) pairs.push({ d: i, t, v: 0.29 * (1 - dist / (0.6 * size)) });
      }
    });
    pairs.sort((a, b) => b.v - a.v);
    for (const p of pairs) {
      if (assigned[p.d] || used.has(p.t)) continue;
      assigned[p.d] = p.t;
      used.add(p.t);
    }
    for (const t of this.tracks) if (!used.has(t)) t.missed++;
    const result = dets.map((d, i) => {
      let t = assigned[i];
      if (!t) {
        t = new Track(this.next++, d.box);
        this.tracks.push(t);
      }
      t.box = d.box;
      t.missed = 0;
      t.liveness.observe(d);
      return t;
    });
    this.tracks = this.tracks.filter((t) => t.missed <= this.maxMissed);
    return result;
  }

  forget(studentId: string) {
    for (const t of this.tracks) {
      if (t.confirmedId === studentId) {
        t.confirmedId = null;
        t.byTeacher = false;
        t.votes.clear();
      }
    }
  }
}
