import { invertAffine, sampleBilinear, type Affine, type Point, type RgbaImage } from "./image";

/** ArcFace 112×112 standart nuqtalari (ArcFace oilasidagi modellar shunga o'rgatilgan). */
export const ARCFACE_TEMPLATE: Point[] = [
  [38.2946, 51.6963],
  [73.5318, 51.5014],
  [56.0252, 71.7366],
  [41.5493, 92.3655],
  [70.7299, 92.2041],
];

/** Nuqtalarni nuqtalarga o'tkazuvchi o'xshashlik (aylantirish+masshtab+siljish). */
export function similarityTransform(src: Point[], dst: Point[]): Affine {
  const n = src.length;
  let msx = 0, msy = 0, mdx = 0, mdy = 0;
  for (let i = 0; i < n; i++) {
    msx += src[i][0]; msy += src[i][1]; mdx += dst[i][0]; mdy += dst[i][1];
  }
  msx /= n; msy /= n; mdx /= n; mdy /= n;
  let a = 0, b = 0, norm = 0;
  for (let i = 0; i < n; i++) {
    const sx = src[i][0] - msx, sy = src[i][1] - msy;
    const dx = dst[i][0] - mdx, dy = dst[i][1] - mdy;
    a += sx * dx + sy * dy;
    b += sx * dy - sy * dx;
    norm += sx * sx + sy * sy;
  }
  const ca = a / norm;
  const sa = b / norm;
  return [ca, -sa, mdx - (ca * msx - sa * msy), sa, ca, mdy - (sa * msx + ca * msy)];
}

/**
 * Yuzni 5 nuqta bo'yicha tekislab, yuz modeli kirishini yasaydi:
 * [1, size, size, 3], RGB, (x − mean) / std. Ixtiyoriy: ko'zgu nusxasi
 * (flip) va keskinlik (sifat) bahosi.
 */
export function alignedFaceTensor(img: RgbaImage, kps: Point[], size = 112, mean = 128, std = 128): Float32Array {
  return alignFace(img, kps, size, mean, std).tensor;
}

export interface AlignedFace {
  tensor: Float32Array;
  /** Gorizontal ko'zgu nusxasi (flip): ikki namunaning yig'indisi barqarorroq. */
  flipped: Float32Array;
  /** Keskinlik: Laplas dispersiyasi (yulduzcha 0..~2000). Xira/uzoq yuzda past. */
  sharpness: number;
}

export function alignFace(img: RgbaImage, kps: Point[], size = 112, mean = 128, std = 128): AlignedFace {
  const inv = invertAffine(similarityTransform(kps, ARCFACE_TEMPLATE.map(([x, y]) => [x * size / 112, y * size / 112] as Point)));
  const tensor = new Float32Array(size * size * 3);
  const flipped = new Float32Array(size * size * 3);
  const gray = new Float32Array(size * size);
  const px = [0, 0, 0];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sx = inv[0] * x + inv[1] * y + inv[2];
      const sy = inv[3] * x + inv[4] * y + inv[5];
      sampleBilinear(img, sx, sy, px);
      const o = (y * size + x) * 3;
      const f = (y * size + (size - 1 - x)) * 3;
      for (let c = 0; c < 3; c++) {
        const v = (px[c] - mean) / std;
        tensor[o + c] = v;
        flipped[f + c] = v;
      }
      gray[y * size + x] = 0.299 * px[0] + 0.587 * px[1] + 0.114 * px[2];
    }
  }
  return { tensor, flipped, sharpness: laplacianVariance(gray, size) };
}

/** Yuzning markaziy qismida (ko'z-burun-og'iz) Laplas dispersiyasi. */
export function laplacianVariance(gray: Float32Array, size: number): number {
  const m = Math.round(size * 0.18);
  let sum = 0, sum2 = 0, n = 0;
  for (let y = m; y < size - m; y++) {
    for (let x = m; x < size - m; x++) {
      const i = y * size + x;
      const l = gray[i - 1] + gray[i + 1] + gray[i - size] + gray[i + size] - 4 * gray[i];
      sum += l; sum2 += l * l; n++;
    }
  }
  const mu = sum / n;
  return sum2 / n - mu * mu;
}

export function l2normalize(v: Float32Array | number[]): Float32Array {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  const inv = s > 0 ? 1 / Math.sqrt(s) : 0;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] * inv;
  return out;
}
