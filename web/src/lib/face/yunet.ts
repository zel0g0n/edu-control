import type { Point, RgbaImage } from "./image";

export interface Detection {
  score: number;
  /** [x, y, w, h] asl kadr koordinatalarida */
  box: [number, number, number, number];
  /** 5 nuqta: o'ng ko'z (rasmda chap), chap ko'z, burun, og'iz o'ng, og'iz chap */
  kps: [Point, Point, Point, Point, Point];
}

/**
 * Kadrni S×S kvadratga sig'diradi (nisbat saqlanadi, qolgani qora) va
 * YuNet kirishiga aylantiradi: [1, 3, S, S], BGR, 0..255.
 *
 * Tezlik: bo'laklar (640×640, masshtab 1) to'g'ridan-to'g'ri ko'chiriladi;
 * kichraytirishda ustun koeffitsiyentlari bir marta hisoblanadi.
 * Natija sampleBilinear bilan bir xil (testda tekshirilgan).
 */
export function letterboxBGR(img: RgbaImage, size: number): { tensor: Float32Array; scale: number } {
  const scale = Math.min(size / img.width, size / img.height);
  const nw = Math.round(img.width * scale);
  const nh = Math.round(img.height * scale);
  const plane = size * size;
  const tensor = new Float32Array(3 * plane);
  const d = img.data;
  const W = img.width, H = img.height;
  if (nw === W && nh === H) {
    for (let y = 0; y < nh; y++) {
      let i = y * W * 4;
      let o = y * size;
      for (let x = 0; x < nw; x++, i += 4, o++) {
        tensor[o] = d[i + 2];
        tensor[plane + o] = d[i + 1];
        tensor[2 * plane + o] = d[i];
      }
    }
    return { tensor, scale };
  }
  const sx = W / nw;
  const sy = H / nh;
  // Ustunlar: chap/o'ng piksel indekslari va og'irlik (sampleBilinear bilan bir xil chegaralash)
  const cx0 = new Int32Array(nw), cx1 = new Int32Array(nw), cfx = new Float32Array(nw);
  for (let x = 0; x < nw; x++) {
    let fx = (x + 0.5) * sx - 0.5;
    if (fx < 0) fx = 0;
    if (fx > W - 1) fx = W - 1;
    const x0 = Math.floor(fx);
    cx0[x] = x0 * 4;
    cx1[x] = (x0 + 1 < W ? x0 + 1 : x0) * 4;
    cfx[x] = fx - x0;
  }
  for (let y = 0; y < nh; y++) {
    let fy = (y + 0.5) * sy - 0.5;
    if (fy < 0) fy = 0;
    if (fy > H - 1) fy = H - 1;
    const y0 = Math.floor(fy);
    const y1 = y0 + 1 < H ? y0 + 1 : y0;
    const wy = fy - y0;
    const r0 = y0 * W * 4, r1 = y1 * W * 4;
    let o = y * size;
    for (let x = 0; x < nw; x++, o++) {
      const a0 = r0 + cx0[x], a1 = r0 + cx1[x], b0 = r1 + cx0[x], b1 = r1 + cx1[x];
      const wx = cfx[x];
      for (let c = 0; c < 3; c++) {
        const top = d[a0 + c] + (d[a1 + c] - d[a0 + c]) * wx;
        const bot = d[b0 + c] + (d[b1 + c] - d[b0 + c]) * wx;
        const v = top + (bot - top) * wy;
        // RGB -> BGR tekisliklar
        tensor[(2 - c) * plane + o] = v;
      }
    }
  }
  return { tensor, scale };
}

export type YunetOutputs = Record<string, Float32Array | ArrayLike<number>>;

/** YuNet (2023mar) chiqishlarini yuzlarga aylantiradi (OpenCV FaceDetectorYN bilan bir xil). */
export function decodeYunet(
  out: YunetOutputs,
  size: number,
  scale: number,
  scoreThreshold: number,
  nmsThreshold: number,
): Detection[] {
  const found: Detection[] = [];
  for (const stride of [8, 16, 32]) {
    const cls = out[`cls_${stride}`];
    const obj = out[`obj_${stride}`];
    const bbox = out[`bbox_${stride}`];
    const kps = out[`kps_${stride}`];
    const cols = size / stride;
    const n = cls.length;
    for (let i = 0; i < n; i++) {
      const c = Math.min(1, Math.max(0, cls[i]));
      const o = Math.min(1, Math.max(0, obj[i]));
      const score = Math.sqrt(c * o);
      if (score < scoreThreshold) continue;
      const r = Math.floor(i / cols);
      const col = i % cols;
      const cx = (col + bbox[i * 4]) * stride;
      const cy = (r + bbox[i * 4 + 1]) * stride;
      const w = Math.exp(bbox[i * 4 + 2]) * stride;
      const h = Math.exp(bbox[i * 4 + 3]) * stride;
      const pts: Point[] = [];
      for (let k = 0; k < 5; k++) {
        pts.push([((kps[i * 10 + 2 * k] + col) * stride) / scale, ((kps[i * 10 + 2 * k + 1] + r) * stride) / scale]);
      }
      found.push({
        score,
        box: [(cx - w / 2) / scale, (cy - h / 2) / scale, w / scale, h / scale],
        kps: pts as Detection["kps"],
      });
    }
  }
  return nms(found, nmsThreshold);
}

export function iou(a: Detection["box"], b: Detection["box"]): number {
  const iw = Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]));
  const ih = Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]));
  const inter = iw * ih;
  return inter / (a[2] * a[3] + b[2] * b[3] - inter + 1e-9);
}

export function nms(list: Detection[], threshold: number): Detection[] {
  const sorted = [...list].sort((a, b) => b.score - a.score);
  const keep: Detection[] = [];
  for (const d of sorted) if (keep.every((k) => iou(k.box, d.box) < threshold)) keep.push(d);
  return keep;
}

/** Ko'zlar orasidagi masofa (piksel). */
export function eyeDistance(d: Detection): number {
  const [[x1, y1], [x2, y2]] = d.kps;
  return Math.hypot(x2 - x1, y2 - y1);
}

/**
 * Bosh burilishi taxmini: burunning ko'zlar o'rtasidan siljishi, ko'zlar
 * orasidagi masofaga nisbatan. 0 = to'g'ri, ±0.3 atrofi = sezilarli burilgan.
 */
export function yawRatio(d: Detection): number {
  const [[x1, y1], [x2, y2], [nx, ny]] = d.kps;
  const ex = x2 - x1;
  const ey = y2 - y1;
  const len = Math.hypot(ex, ey) || 1;
  // Burunni ko'zlar chizig'iga proyeksiyalaymiz.
  const t = ((nx - x1) * ex + (ny - y1) * ey) / (len * len);
  return t - 0.5;
}

/** Boshning qiyshayishi (gradus), ko'zlar chizig'i bo'yicha. */
export function rollDegrees(d: Detection): number {
  const [[x1, y1], [x2, y2]] = d.kps;
  return (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
}
