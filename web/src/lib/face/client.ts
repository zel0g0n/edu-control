"use client";

import { FACE } from "./config";
import type { Point } from "./image";
import type { WorkerRequest, WorkerResponse } from "./protocol";
import type { Region } from "./tiles";
import type { Detection } from "./yunet";

const SINGLE_KEY = "edunazorat-face-single-thread";

/**
 * Worker blob: manzildan ochiladi va ichida public/face/face-worker.mjs import qilinadi.
 * blob: Worker sahifaning cross-origin siyosatini meros oladi, shuning uchun Vercel CDN
 * statik fayllarga COEP sarlavhasini qo'ymasa ham bloklanmaydi.
 */
function createFaceWorker(): Worker {
  const src = new URL(`/face/face-worker.mjs?v=${process.env.NEXT_PUBLIC_FACE_WORKER_VERSION ?? "dev"}`, location.origin).href;
  const blob = new Blob([`import ${JSON.stringify(src)};`], { type: "text/javascript" });
  const url = URL.createObjectURL(blob);
  const w = new Worker(url, { type: "module", name: "edunazorat-face" });
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return w;
}

type Pending = { resolve: (v: WorkerResponse) => void; reject: (e: Error) => void };

/** Yuz tanish Worker'i bilan ishlash (bitta nusxa, sahifalar orasida qayta ishlatiladi). */
class FaceWorkerClient {
  private worker: Worker | null = null;
  private ready: Promise<void> | null = null;
  private seq = 1;
  private pending = new Map<number, Pending>();
  private progressListeners = new Set<(p: number) => void>();

  /** Model yuklanishi 0..1 (keshda bo'lsa darhol 1). */
  onProgress(fn: (p: number) => void): () => void {
    this.progressListeners.add(fn);
    return () => this.progressListeners.delete(fn);
  }

  /** Ishga tushirish: avval ko'p oqimli (tez), ishlamasa bir oqimli zaxira rejim. */
  init(): Promise<void> {
    if (this.ready) return this.ready;
    // Avval ko'p oqim ishlamagan qurilmada vaqt yo'qotilmasin
    let single = false;
    try {
      single = localStorage.getItem(SINGLE_KEY) === "1";
    } catch {
      /* saqlash yo'q */
    }
    this.ready = this.start(!single).catch((first: Error) => {
      if (single) throw first;
      console.warn("Yuz tanish: ko'p oqimli rejim ishlamadi, bir oqimga o'tilmoqda", first);
      return this.start(false).then(() => {
        try {
          localStorage.setItem(SINGLE_KEY, "1");
        } catch {
          /* saqlash yo'q */
        }
      }).catch((second: Error) => {
        this.ready = null;
        throw new Error(second.message === first.message ? second.message : `${second.message}; ${first.message}`);
      });
    });
    return this.ready;
  }

  private start(threads: boolean): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const fail = (message: string) => {
        if (settled) return;
        settled = true;
        this.worker = null;
        w.terminate();
        reject(new Error(message));
      };
      const w = createFaceWorker();
      this.worker = w;
      w.onmessage = (e: MessageEvent<WorkerResponse>) => {
        const m = e.data;
        if (m.type === "ready") {
          console.info(`Yuz tanish tayyor: ${m.threads ?? 1} oqim${self.crossOriginIsolated ? "" : " (cross-origin isolation yo'q)"}`);
          settled = true;
          return resolve();
        }
        if (m.type === "progress") {
          const p = m.total ? m.loaded / m.total : 0;
          this.progressListeners.forEach((f) => f(p));
          return;
        }
        if (m.type === "error" && m.id === undefined) {
          if (!settled) return fail(m.message);
          console.warn("Yuz tanish:", m.message);
          return;
        }
        if ("id" in m && m.id !== undefined) {
          const p = this.pending.get(m.id);
          this.pending.delete(m.id);
          if (!p) return;
          if (m.type === "error") p.reject(new Error(m.message));
          else p.resolve(m);
        }
      };
      w.onerror = (e) => {
        e.preventDefault();
        const msg = `${e.message || "Worker xatosi"}${e.filename ? ` (${e.filename.split("/").pop()}:${e.lineno})` : ""}`;
        if (!settled) return fail(msg);
        console.warn("Yuz tanish:", msg);
      };
      // Model yuklanishi sekin internetda uzoq: 3 daqiqadan keyin to'xtatiladi
      setTimeout(() => fail("Yuz tanish modeli 3 daqiqada yuklanmadi"), 180_000);
      // blob: Worker ichida nisbiy manzil ishlamaydi: hammasi to'liq manzil bilan
      const abs = (p: string) => new URL(p, location.origin).href;
      const msg: WorkerRequest = {
        type: "init",
        wasmPath: abs(FACE.ortWasmPath),
        detectorUrl: abs(FACE.detectorUrl),
        embedderUrl: abs(FACE.embedderUrl),
        threads,
      };
      w.postMessage(msg);
    });
  }

  private call(msg: WorkerRequest & { id: number }, transfer: Transferable[] = []): Promise<WorkerResponse> {
    return new Promise((resolve, reject) => {
      if (!this.worker) return reject(new Error("Yuz tanish ishga tushmagan"));
      this.pending.set(msg.id, { resolve, reject });
      this.worker.postMessage(msg, transfer);
    });
  }

  /** Kadrdagi yuzlar. Kadr Worker'ga o'tkaziladi (nusxa ko'chirilmaydi). */
  async detect(image: ImageData): Promise<Detection[]> {
    const buffer = image.data.buffer as ArrayBuffer;
    const r = await this.call({ type: "detect", id: this.seq++, width: image.width, height: image.height, buffer }, [buffer]);
    return r.type === "detected" ? r.detections : [];
  }

  /** Butun kadr + tanlangan bo'laklar: har biri alohida natija. */
  async detectRegions(image: ImageData, regions: Region[], full = true): Promise<{ full: Detection[]; perRegion: Detection[][]; ms: number }> {
    const buffer = image.data.buffer as ArrayBuffer;
    const r = await this.call({ type: "detect", id: this.seq++, width: image.width, height: image.height, buffer, regions, full }, [buffer]);
    return r.type === "detected" ? { full: r.detections, perRegion: r.perRegion ?? [], ms: r.ms } : { full: [], perRegion: [], ms: 0 };
  }

  /** Oxirgi kadrdagi yuzlar uchun raqamli namunalar. */
  async embed(kps: Point[][]): Promise<Float32Array[]> {
    return (await this.embedWithQuality(kps)).map((x) => x.embedding);
  }

  /** Namuna va sifat (keskinlik): xira kadrlar o'rtachaga kamroq ta'sir qiladi. */
  async embedWithQuality(kps: Point[][]): Promise<{ embedding: Float32Array; quality: number }[]> {
    if (kps.length === 0) return [];
    const r = await this.call({ type: "embed", id: this.seq++, kps });
    return r.type === "embedded" ? r.embeddings.map((embedding, i) => ({ embedding, quality: r.qualities[i] ?? 0 })) : [];
  }
}

export const faceWorker = new FaceWorkerClient();
