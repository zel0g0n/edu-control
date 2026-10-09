import { sampleBilinear, type Point, type RgbaImage } from "./image";

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
 */
export function letterboxBGR(img: RgbaImage, size: number): { tensor: Float32Array; scale: number } {
  const scale = Math.min(size / img.width, size / img.height);
  const nw = Math.round(img.width * scale);
  const nh = Math.round(img.height * scale);
  const plane = size * size;
  const tensor = new Float32Array(3 * plane);
  const px = [0, 0, 0];
  const sx = img.width / nw;
  const sy = img.height / nh;
  for (let y = 0; y < nh; y++) {
    const srcY = (y + 0.5) * sy - 0.5;
    for (let x = 0; x < nw; x++) {
      sampleBilinear(img, (x + 0.5) * sx - 0.5, srcY, px);
      const o = y * size + x;
      tensor[o] = px[2]; // B
      tensor[plane + o] = px[1]; // G
      tensor[2 * plane + o] = px[0]; // R
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
