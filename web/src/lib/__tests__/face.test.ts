import { describe, expect, it } from "vitest";

import { ARCFACE_TEMPLATE, alignedFaceTensor, similarityTransform } from "../face/align";
import { FACE } from "../face/config";
import { invertAffine, type Point } from "../face/image";
import { faceDiagnostics } from "../face/diagnostics";
import { LivenessMeter, noseAffine } from "../face/liveness";
import { cosine, FaceGallery, Track, Tracker } from "../face/matcher";
import { SceneScanner } from "../face/scanner";
import { mergeDetections, tileGrid } from "../face/tiles";
import { decodeYunet, letterboxBGR, yawRatio, type Detection } from "../face/yunet";

const unit = (v: number[]) => {
  const n = Math.hypot(...v);
  return v.map((x) => x / n);
};
const withSim = (sim: number) => unit([sim, Math.sqrt(1 - sim * sim), 0, 0]);

describe("o'xshashlik transformatsiyasi", () => {
  it("Python (OpenCV) natijasi bilan mos", () => {
    const src: Point[] = [[100, 120], [150, 118], [126, 150], [105, 175], [148, 174]];
    const M = similarityTransform(src, ARCFACE_TEMPLATE);
    const ref = [0.714970466886041, -0.017067344856696674, -31.40139843441812, 0.017067344856696674, 0.714970466886041, -35.63293755197489];
    M.forEach((v, i) => expect(v).toBeCloseTo(ref[i], 4));
  });

  it("teskari matritsa", () => {
    const M = similarityTransform([[0, 0], [10, 0], [5, 5], [2, 9], [8, 9]], ARCFACE_TEMPLATE);
    const I = invertAffine(M);
    const [x, y] = [3, 4];
    const fx = M[0] * x + M[1] * y + M[2];
    const fy = M[3] * x + M[4] * y + M[5];
    expect(I[0] * fx + I[1] * fy + I[2]).toBeCloseTo(x, 6);
    expect(I[3] * fx + I[4] * fy + I[5]).toBeCloseTo(y, 6);
  });

  it("tekislangan kesim normallashtirilgan", () => {
    const img = { width: 4, height: 4, data: new Uint8ClampedArray(64).fill(128) };
    const t = alignedFaceTensor(img, ARCFACE_TEMPLATE.map(([x, y]) => [x / 30, y / 30] as Point));
    expect(t.length).toBe(112 * 112 * 3);
    expect(Math.max(...t.map(Math.abs))).toBe(0);
  });
});

describe("YuNet", () => {
  it("letterbox BGR tartibi va to'ldirish", () => {
    const img = { width: 2, height: 1, data: new Uint8ClampedArray([10, 20, 30, 255, 10, 20, 30, 255]) };
    const { tensor, scale } = letterboxBGR(img, 4);
    expect(scale).toBe(2);
    expect([tensor[0], tensor[16], tensor[32]]).toEqual([30, 20, 10]);
    expect(tensor[3 * 4]).toBe(0); // pastki qism qora
  });

  it("chiqishlarni yuzga aylantiradi", () => {
    const size = 64;
    const out: Record<string, Float32Array> = {};
    for (const s of [8, 16, 32]) {
      const n = (size / s) ** 2;
      out[`cls_${s}`] = new Float32Array(n);
      out[`obj_${s}`] = new Float32Array(n);
      out[`bbox_${s}`] = new Float32Array(n * 4);
      out[`kps_${s}`] = new Float32Array(n * 10);
    }
    // stride 8, katak (r=2, c=3) -> indeks 2*8+3 = 19
    out.cls_8[19] = 0.9;
    out.obj_8[19] = 0.9;
    out.bbox_8.set([0.5, 0.5, Math.log(2), Math.log(3)], 19 * 4);
    out.kps_8.set([0, 0, 1, 0, 0.5, 0.5, 0, 1, 1, 1], 19 * 10);
    const d = decodeYunet(out, size, 2, 0.6, 0.3);
    expect(d.length).toBe(1);
    expect(d[0].score).toBeCloseTo(0.9, 5);
    // cx = (3+0.5)*8 = 28, cy = 20, w = 16, h = 24, masshtab 2 ga bo'linadi
    expect(d[0].box.map((v) => +v.toFixed(3))).toEqual([10, 4, 8, 12]);
    expect(d[0].kps[0]).toEqual([12, 8]);
  });

  it("bosh burilishi", () => {
    const d = (nx: number): Detection => ({ score: 1, box: [0, 0, 1, 1], kps: [[0, 0], [10, 0], [nx, 5], [0, 0], [0, 0]] });
    expect(yawRatio(d(5))).toBeCloseTo(0, 6);
    expect(yawRatio(d(8))).toBeCloseTo(0.3, 6);
    expect(yawRatio(d(2))).toBeCloseTo(-0.3, 6);
  });
});

describe("tanish", () => {
  const base = unit([1, 0, 0, 0]);

  it("ishonchli moslik", () => {
    const g = new FaceGallery({ ali: [base], vali: [unit([0, 0, 1, 0])] });
    const r = g.match(withSim(0.8));
    expect(r.studentId).toBe("ali");
    expect(r.level).toBe("confident");
  });

  it("past moslik: tekshiring", () => {
    const g = new FaceGallery({ ali: [base] });
    expect(g.match(withSim((FACE.reviewThreshold + FACE.matchThreshold) / 2)).level).toBe("review");
    expect(g.match(withSim(FACE.reviewThreshold - 0.1)).level).toBe("unknown");
  });

  it("ikki nomzod juda yaqin bo'lsa avtomatik tasdiqlanmaydi", () => {
    const g = new FaceGallery({ ali: [base], egizak: [withSim(0.99)] });
    expect(g.match(withSim(0.85)).level).not.toBe("confident");
  });

  it("chiqarib tashlangan o'quvchi tanlanmaydi", () => {
    const g = new FaceGallery({ ali: [base], vali: [withSim(0.6)] });
    expect(g.match(base, new Set(["ali"])).studentId).toBe("vali");
  });

  it("tasdiqlash uchun bir necha kadr kerak", () => {
    const t = new Track(1, [0, 0, 1, 1]);
    const r = { studentId: "ali", score: 0.8, second: 0.1, level: "confident" as const };
    let got: string | null = null;
    for (let i = 0; i < FACE.votesToConfirm; i++) {
      expect(got).toBeNull();
      got = t.add(r);
    }
    expect(got).toBe("ali");
  });

  it("kuzatuvchi kadrlar orasida bir xil yuzni bog'laydi", () => {
    const det = (x: number): Detection => ({ score: 1, box: [x, 0, 50, 50], kps: [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0]] });
    const tr = new Tracker();
    const [a, b] = tr.update([det(0), det(200)]);
    const [a2, b2] = tr.update([det(5), det(205)]);
    expect(a2).toBe(a);
    expect(b2).toBe(b);
    const [c] = tr.update([det(500)]);
    expect(c).not.toBe(a);
  });
});

describe("jonlilik (liveness)", () => {
  // Bosh modeli: ko'zlar, burun (oldinga chiqqan), og'iz burchaklari. Birlik = ko'zlar orasi.
  const HEAD: [number, number, number][] = [[-0.5, 0, 0], [0.5, 0, 0], [0, 0.5, 0.55], [-0.4, 1, 0.1], [0.4, 1, 0.1]];
  let seed = 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());

  function project(pts: [number, number, number][], yaw: number, pitch: number, roll: number, scale: number, tx: number, ty: number, jitter: number): Detection {
    const kps = pts.map(([x, y, z]) => {
      // yaw (Y o'qi), pitch (X o'qi), roll (Z o'qi); ortografik proyeksiya
      let x1 = x * Math.cos(yaw) + z * Math.sin(yaw);
      const z1 = -x * Math.sin(yaw) + z * Math.cos(yaw);
      const y1 = y * Math.cos(pitch) - z1 * Math.sin(pitch);
      const x2 = x1 * Math.cos(roll) - y1 * Math.sin(roll);
      const y2 = x1 * Math.sin(roll) + y1 * Math.cos(roll);
      x1 = x2;
      return [tx + x1 * scale + gauss() * jitter, ty + y2 * scale + gauss() * jitter] as [number, number];
    }) as Detection["kps"];
    return { score: 0.9, box: [tx - scale, ty - scale, scale * 2, scale * 3], kps };
  }
  const deg = (d: number) => (d * Math.PI) / 180;

  it("haqiqiy bosh (kichik qimirlash) jonli deb topiladi", () => {
    seed = 3;
    const m = new LivenessMeter();
    for (let i = 0; i < 25 && m.state !== "live"; i++) m.observe(project(HEAD, deg(10 * Math.sin(i / 2)), deg(6 * Math.cos(i / 3)), deg(3 * gauss()), 80, 300 + i * 2, 200, 1));
    expect(m.state).toBe("live");
  });

  it("tekis rasm (har tomonga qiyshaytirilsa ham) jonli emas", () => {
    seed = 5;
    const flat = HEAD.map(([x, y]) => [x, y, 0] as [number, number, number]);
    const m = new LivenessMeter();
    for (let i = 0; i < 25; i++) m.observe(project(flat, deg(25 * Math.sin(i / 2)), deg(20 * Math.cos(i / 3)), deg(10 * gauss()), 80 + i, 300 + i * 5, 200 - i * 3, 1));
    expect(m.state).toBe("static");
  });

  it("burun affin koordinatalari tekis o'zgarishda o'zgarmaydi", () => {
    seed = 9;
    const flat = HEAD.map(([x, y]) => [x, y, 0] as [number, number, number]);
    const a = noseAffine(project(flat, 0, 0, 0, 40, 100, 100, 0).kps)!;
    const b = noseAffine(project(flat, deg(30), deg(-20), deg(15), 70, 300, 50, 0).kps)!;
    expect(Math.abs(a[0] - b[0])).toBeLessThan(1e-6);
    expect(Math.abs(a[1] - b[1])).toBeLessThan(1e-6);
  });
});

describe("chegaralar diagnostikasi", () => {
  it("eng o'xshash ikki o'quvchidan yuqori chegara tavsiya qiladi", () => {
    const people = Array.from({ length: 6 }, (_, i) => {
      const base = Array.from({ length: 8 }, (_, k) => (k === i ? 1 : 0.05));
      const v = (j: number) => unit(base.map((x, k) => x + (k === 7 ? j * 0.1 : 0)));
      return { id: `s${i}`, templates: [v(0), v(1)] };
    });
    // Ikki "aka-uka": juda o'xshash
    people[1].templates = [unit([0.8, 0.6, 0, 0, 0, 0, 0, 0.05])];
    const d = faceDiagnostics(people);
    expect(d.students).toBe(6);
    expect(d.maxImpostor).toBeGreaterThan(0.75);
    expect(d.suggested!.match).toBe(0.7);
    expect(d.suggested!.review).toBeLessThan(d.suggested!.match);
  });
});

describe("butun sinf: bo'laklab qidirish", () => {
  const det = (x: number, y: number, s = 20, score = 0.9): Detection => ({
    score, box: [x, y, s, s * 1.3], kps: [[x + s * 0.3, y + s * 0.4], [x + s * 0.7, y + s * 0.4], [x + s / 2, y + s * 0.6], [x + s * 0.35, y + s * 0.9], [x + s * 0.65, y + s * 0.9]],
  });

  it("1920×1080 kadr bir-birini qoplaydigan 640 bo'laklarga bo'linadi", () => {
    const g = tileGrid(1920, 1080, 640, 0.2);
    expect(g.length).toBeGreaterThanOrEqual(6);
    // Har bir nuqta kamida bitta bo'lakda
    for (const [x, y] of [[0, 0], [1919, 1079], [960, 540], [1500, 100]]) {
      expect(g.some(([gx, gy, w, h]) => x >= gx && x < gx + w && y >= gy && y < gy + h)).toBe(true);
    }
    expect(tileGrid(640, 480, 640)).toEqual([]);
  });

  it("bo'lak chetida qirqilgan yuz to'liq nusxasi bilan birlashadi", () => {
    const whole = det(100, 100, 30, 0.9);
    const cut = { ...det(100, 100, 30, 0.6), box: [100, 100, 18, 39] as Detection["box"] };
    expect(mergeDetections([[whole], [cut]])).toEqual([whole]);
  });

  it("navbat bilan bo'laklar, eski natija vaqtincha saqlanadi, tezlikka moslashadi", () => {
    const sc = new SceneScanner(640, 0.2, 2, 450);
    const p1 = sc.plan(1920, 1080);
    expect(p1.indices).toEqual([0, 1]);
    const r1 = sc.absorb([], [[det(50, 50)], [det(900, 60)]], p1.indices, 600);
    expect(r1.detections).toHaveLength(2);
    expect(r1.fresh.size).toBe(2);
    // Sekin qurilma: 600 ms / 3 o'tish = 200 ms, 450/200 - 1 = 1 bo'lak
    expect(sc.tilesPerCycle).toBe(1);
    const p2 = sc.plan(1920, 1080);
    expect(p2.indices).toEqual([2]);
    const r2 = sc.absorb([], p2.indices.map(() => []), p2.indices, 900);
    // Eski ikkita yuz ko'rsatiladi, lekin "yangi" emas (ulardan namuna olinmaydi)
    expect(r2.detections).toHaveLength(2);
    expect(r2.fresh.size).toBe(0);
    expect(sc.tilesPerCycle).toBeGreaterThanOrEqual(1);
    // Tez qurilma: ko'proq bo'lak
    sc.absorb([], [[]], [3], 60);
    expect(sc.tilesPerCycle).toBe(Math.min(sc.tiles, 14));
  });
});

describe("kadrlar bo'yicha o'rtacha namuna", () => {
  it("shovqinli namunalarning o'rtachasi haqiqiy yuzga yaqinroq", () => {
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
    const truth = unit(Array.from({ length: 192 }, () => rnd()));
    const noisy = () => new Float32Array(unit(truth.map((v) => v + rnd() * 0.12)));
    const tr = new Track(1, [0, 0, 10, 10]);
    const single = cosine(noisy(), truth);
    let mean: Float32Array = new Float32Array(192);
    for (let i = 0; i < 6; i++) mean = tr.addEmbedding(noisy());
    expect(cosine(mean, truth)).toBeGreaterThan(single + 0.1);
    expect(tr.samples).toBe(6);
  });
});

describe("kichik yuz uchun yumshoq chegara", () => {
  it("past o'xshashlik faqat katta farq bilan qabul qilinadi", () => {
    const g = new FaceGallery({ a: [withSim(1)], b: [unit([0, 0, 1, 0])] });
    // a bilan 0.38, b bilan 0: oddiy rejimda "tekshiring", yumshoqda "tanildi"
    expect(g.match(withSim(0.38)).level).toBe("review");
    expect(g.match(withSim(0.38), new Set(), true).level).toBe("confident");
    // ikkinchi nomzod yaqin bo'lsa: yumshoq rejimda ham yo'q
    const close = unit([0.5, 0.2, 0.45, 0]);
    const r = g.match(close, new Set(), true);
    expect(r.level).not.toBe("confident");
  });
});
