import type { RgbaImage } from "./image";
import type { Detection } from "./yunet";

/** Kadr ichidagi to'rtburchak: [x, y, w, h]. */
export type Region = [number, number, number, number];

/**
 * Butun sinf kadri uchun bo'laklar. YuNet kirishi 640×640: butun 1920×1080
 * kadr 3 baravar kichrayadi va orqa partalardagi yuzlar yo'qoladi. Kadrni
 * bir-birini qoplaydigan bo'laklarga bo'lib, har birini o'z o'lchamida
 * (yoki kattalashtirib) tekshiramiz.
 */
export function tileGrid(width: number, height: number, tile: number, overlap = 0.2): Region[] {
  if (width <= tile * 1.1 && height <= tile * 1.1) return [];
  const step = tile * (1 - overlap);
  const nx = Math.max(1, Math.ceil((width - tile) / step) + 1);
  const ny = Math.max(1, Math.ceil((height - tile) / step) + 1);
  const tw = Math.min(width, tile);
  const th = Math.min(height, tile);
  const out: Region[] = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const x = nx === 1 ? (width - tw) / 2 : Math.round(((width - tw) * i) / (nx - 1));
      const y = ny === 1 ? (height - th) / 2 : Math.round(((height - th) * j) / (ny - 1));
      out.push([Math.round(x), Math.round(y), tw, th]);
    }
  }
  return out;
}

/** Kadrdan bo'lak nusxasi (qatorlar bo'yicha tez nusxa). */
export function cropRgba(img: RgbaImage, [x, y, w, h]: Region): RgbaImage {
  const x0 = Math.max(0, Math.floor(x)), y0 = Math.max(0, Math.floor(y));
  const cw = Math.min(img.width - x0, Math.round(w)), ch = Math.min(img.height - y0, Math.round(h));
  const data = new Uint8ClampedArray(cw * ch * 4);
  for (let r = 0; r < ch; r++) {
    const src = ((y0 + r) * img.width + x0) * 4;
    data.set(img.data.subarray(src, src + cw * 4), r * cw * 4);
  }
  return { width: cw, height: ch, data };
}

/** Bo'lak koordinatasidan butun kadr koordinatasiga. */
export function offsetDetection(d: Detection, dx: number, dy: number): Detection {
  return {
    score: d.score,
    box: [d.box[0] + dx, d.box[1] + dy, d.box[2], d.box[3]],
    kps: d.kps.map(([x, y]) => [x + dx, y + dy]) as Detection["kps"],
  };
}

/** Kesishma / kichik maydon: bo'lak chetida qirqilgan yuzni to'liq nusxasi bilan birlashtirish uchun. */
function overlapMin(a: Detection["box"], b: Detection["box"]): number {
  const iw = Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]));
  const ih = Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]));
  return (iw * ih) / (Math.min(a[2] * a[3], b[2] * b[3]) + 1e-9);
}

/** Bir nechta bo'lak natijalarini birlashtirish: takrorlarni olib tashlash. */
export function mergeDetections(lists: Detection[][], threshold = 0.5): Detection[] {
  const all = lists.flat().sort((a, b) => b.score - a.score);
  const keep: Detection[] = [];
  for (const d of all) if (keep.every((k) => overlapMin(k.box, d.box) < threshold)) keep.push(d);
  return keep;
}
