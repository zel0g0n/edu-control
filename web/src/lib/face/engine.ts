import type * as Ort from "onnxruntime-web";

import { alignedFaceTensor, l2normalize } from "./align";
import { FACE } from "./config";
import type { Point, RgbaImage } from "./image";
import { cropRgba, mergeDetections, offsetDetection, type Region } from "./tiles";
import { decodeYunet, letterboxBGR, type Detection, type YunetOutputs } from "./yunet";

type OrtModule = typeof Ort;

/**
 * YuNet (yuz topish) + MobileFaceNet (raqamli namuna). Brauzerda Web
 * Worker ichida, testlarda Node'da ishlaydi. Hech narsa tarmoqqa
 * yuborilmaydi.
 */
export class FaceEngine {
  private constructor(
    private readonly ort: OrtModule,
    private readonly detector: Ort.InferenceSession,
    private readonly embedder: Ort.InferenceSession,
  ) {}

  static async create(ort: OrtModule, detectorModel: Uint8Array, embedderModel: Uint8Array): Promise<FaceEngine> {
    const opts: Ort.InferenceSession.SessionOptions = { executionProviders: ["wasm"], graphOptimizationLevel: "all" };
    const detector = await ort.InferenceSession.create(detectorModel, opts);
    const embedder = await ort.InferenceSession.create(embedderModel, opts);
    return new FaceEngine(ort, detector, embedder);
  }

  async detect(img: RgbaImage): Promise<Detection[]> {
    const size = FACE.detectSize;
    const { tensor, scale } = letterboxBGR(img, size);
    const input = new this.ort.Tensor("float32", tensor, [1, 3, size, size]);
    const res = await this.detector.run({ [this.detector.inputNames[0]]: input });
    const out: YunetOutputs = {};
    for (const [k, v] of Object.entries(res)) out[k] = v.data as Float32Array;
    return decodeYunet(out, size, scale, FACE.detectThreshold, FACE.nmsThreshold);
  }

  /**
   * Butun kadr (ixtiyoriy) + berilgan bo'laklar: uzoqdagi kichik yuzlar
   * bo'laklarda, yaqindagi kattalari butun kadrda topiladi.
   */
  async detectRegions(img: RgbaImage, regions: Region[], full = true): Promise<Detection[]> {
    const { full: f, perRegion } = await this.detectEach(img, regions, full);
    return mergeDetections([f, ...perRegion]);
  }

  /** Har bir bo'lak natijasi alohida (mijoz eski bo'laklar natijasini saqlab turadi). */
  async detectEach(img: RgbaImage, regions: Region[], full = true): Promise<{ full: Detection[]; perRegion: Detection[][] }> {
    const f = full ? await this.detect(img) : [];
    const perRegion: Detection[][] = [];
    for (const r of regions) {
      const part = await this.detect(cropRgba(img, r));
      perRegion.push(part.map((d) => offsetDetection(d, Math.max(0, Math.floor(r[0])), Math.max(0, Math.floor(r[1])))));
    }
    return { full: f, perRegion };
  }

  async embed(img: RgbaImage, kps: Point[]): Promise<Float32Array> {
    const size = FACE.embedSize;
    const data = alignedFaceTensor(img, kps, size);
    const input = new this.ort.Tensor("float32", data, [1, size, size, 3]);
    const res = await this.embedder.run({ [this.embedder.inputNames[0]]: input });
    return l2normalize(res[this.embedder.outputNames[0]].data as Float32Array);
  }
}
