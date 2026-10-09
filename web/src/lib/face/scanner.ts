import { mergeDetections, tileGrid, type Region } from "./tiles";
import type { Detection } from "./yunet";

/**
 * Butun sinfni kuzatish rejasi. Har siklda: butun kadr (yaqin, katta yuzlar)
 * + navbatdagi bir nechta bo'lak (uzoq, kichik yuzlar). Bo'laklar soni
 * qurilma tezligiga moslashadi; ko'rib chiqilmagan bo'laklarning yaqindagi
 * natijasi qisqa muddat saqlanadi (ekranda doira yo'qolib qolmasligi uchun).
 */
export class SceneScanner {
  private cache = new Map<number, { dets: Detection[]; cycle: number }>();
  private cursor = 0;
  private cycle = 0;
  private dims = "";
  private grid: Region[] = [];
  tilesPerCycle = 2;

  constructor(
    readonly tile = 640,
    readonly overlap = 0.2,
    /** Eski bo'lak natijasi necha sikl ko'rsatiladi. */
    readonly maxAge = 3,
    /** Bitta sikl uchun mo'ljallangan vaqt (ms). */
    readonly targetMs = 450,
  ) {}

  get tiles(): number {
    return this.grid.length;
  }

  /** Shu sikl uchun qaysi bo'laklar tekshiriladi. */
  plan(width: number, height: number): { regions: Region[]; indices: number[] } {
    const key = `${width}x${height}`;
    if (key !== this.dims) {
      this.dims = key;
      this.grid = tileGrid(width, height, this.tile, this.overlap);
      this.reset();
    }
    if (this.grid.length === 0) return { regions: [], indices: [] };
    const n = Math.min(this.tilesPerCycle, this.grid.length);
    // Ustuvorlik: yuz topilgan bo'laklar tez-tez, bo'shlari (shift, doska) kamroq tekshiriladi.
    // Hech bir bo'lak unutilmaydi: kutish vaqti oshgani sari navbati keladi.
    const score = (i: number) => {
      const c = this.cache.get(i);
      const age = c ? this.cycle - c.cycle : this.grid.length + 1;
      const hasFaces = !c || c.dets.length > 0;
      return age * (hasFaces ? 2 : 1) + (i === this.cursor ? 0.5 : 0);
    };
    const indices = [...this.grid.keys()].sort((a, b) => score(b) - score(a)).slice(0, n);
    this.cursor = (this.cursor + 1) % this.grid.length;
    return { regions: indices.map((i) => this.grid[i]), indices };
  }

  /**
   * Natijalarni birlashtirish. fresh: shu kadrda topilganlar (ulardan namuna
   * olish mumkin); qolganlari eski bo'lak natijalari (faqat ko'rsatish uchun).
   */
  absorb(full: Detection[], perRegion: Detection[][], indices: number[], ms: number): { detections: Detection[]; fresh: Set<Detection> } {
    this.cycle++;
    indices.forEach((idx, k) => this.cache.set(idx, { dets: perRegion[k] ?? [], cycle: this.cycle }));
    if (ms > 0 && this.grid.length) {
      const perPass = ms / (1 + indices.length);
      this.tilesPerCycle = Math.max(1, Math.min(this.grid.length, Math.floor(this.targetMs / perPass) - 1));
    }
    const freshLists = [full, ...indices.map((_, k) => perRegion[k] ?? [])];
    const staleLists: Detection[][] = [];
    // Sekin qurilmada bo'laklar kamroq: aylanish to'liq tugaguncha eski natija saqlanadi.
    const maxAge = Math.max(this.maxAge, Math.ceil(this.grid.length / this.tilesPerCycle) + 1);
    for (const [idx, c] of this.cache) {
      if (indices.includes(idx)) continue;
      if (this.cycle - c.cycle > maxAge) {
        this.cache.delete(idx);
        continue;
      }
      // Yangilari ustun tursin.
      staleLists.push(c.dets.map((d) => ({ ...d, score: d.score * 0.8 })));
    }
    const fresh = new Set(mergeDetections(freshLists));
    const detections = mergeDetections([[...fresh], ...staleLists]);
    return { detections, fresh: new Set(detections.filter((d) => fresh.has(d))) };
  }

  /** Kamera keskin burilganda yoki zoom o'zgarganda. */
  reset() {
    this.cache.clear();
    this.cursor = 0;
  }
}
