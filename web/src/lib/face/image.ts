/** RGBA piksellar (ImageData bilan bir xil shakl). */
export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

export type Point = [number, number];

/** 2×3 affin matritsa: [a, b, c, d, e, f] → x' = a·x + b·y + c, y' = d·x + e·y + f */
export type Affine = [number, number, number, number, number, number];

export function invertAffine([a, b, c, d, e, f]: Affine): Affine {
  const det = a * e - b * d;
  if (Math.abs(det) < 1e-12) throw new Error("Matritsa teskarilanmaydi");
  const ia = e / det;
  const ib = -b / det;
  const id = -d / det;
  const ie = a / det;
  return [ia, ib, -(ia * c + ib * f), id, ie, -(id * c + ie * f)];
}

/**
 * Bilinear namuna olish (chegarada eng yaqin piksel). OpenCV'ning
 * INTER_LINEAR + BORDER_REPLICATE bilan mos.
 */
export function sampleBilinear(img: RgbaImage, x: number, y: number, out: number[]): void {
  const w = img.width;
  const h = img.height;
  const d = img.data;
  if (x < 0) x = 0;
  if (y < 0) y = 0;
  if (x > w - 1) x = w - 1;
  if (y > h - 1) y = h - 1;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = x0 + 1 < w ? x0 + 1 : x0;
  const y1 = y0 + 1 < h ? y0 + 1 : y0;
  const fx = x - x0;
  const fy = y - y0;
  const i00 = (y0 * w + x0) * 4;
  const i10 = (y0 * w + x1) * 4;
  const i01 = (y1 * w + x0) * 4;
  const i11 = (y1 * w + x1) * 4;
  for (let c = 0; c < 3; c++) {
    const top = d[i00 + c] + (d[i10 + c] - d[i00 + c]) * fx;
    const bot = d[i01 + c] + (d[i11 + c] - d[i01 + c]) * fx;
    out[c] = top + (bot - top) * fy;
  }
}
