import { invertAffine, sampleBilinear, type Affine, type Point, type RgbaImage } from "./image";

/** ArcFace 112×112 standart nuqtalari (MobileFaceNet shunga o'rgatilgan). */
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
 * Yuzni 5 nuqta bo'yicha tekislab, MobileFaceNet kirishini yasaydi:
 * [1, 112, 112, 3], RGB, (x − 128) / 128.
 */
export function alignedFaceTensor(img: RgbaImage, kps: Point[], size = 112): Float32Array {
  const inv = invertAffine(similarityTransform(kps, ARCFACE_TEMPLATE));
  const out = new Float32Array(size * size * 3);
  const px = [0, 0, 0];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sx = inv[0] * x + inv[1] * y + inv[2];
      const sy = inv[3] * x + inv[4] * y + inv[5];
      sampleBilinear(img, sx, sy, px);
      const o = (y * size + x) * 3;
      out[o] = (px[0] - 128) / 128;
      out[o + 1] = (px[1] - 128) / 128;
      out[o + 2] = (px[2] - 128) / 128;
    }
  }
  return out;
}

export function l2normalize(v: Float32Array | number[]): Float32Array {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  const inv = s > 0 ? 1 / Math.sqrt(s) : 0;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] * inv;
  return out;
}
