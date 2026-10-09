"use client";

import { FACE } from "./config";
import type { Point } from "./image";
import type { WorkerRequest, WorkerResponse } from "./protocol";
import type { Region } from "./tiles";
import type { Detection } from "./yunet";

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

  init(): Promise<void> {
    if (this.ready) return this.ready;
    this.ready = new Promise<void>((resolve, reject) => {
      const w = new Worker(new URL("./face.worker.ts", import.meta.url), { type: "module" });
      this.worker = w;
      w.onmessage = (e: MessageEvent<WorkerResponse>) => {
        const m = e.data;
        if (m.type === "ready") return resolve();
        if (m.type === "progress") {
          const p = m.total ? m.loaded / m.total : 0;
          this.progressListeners.forEach((f) => f(p));
          return;
        }
        if (m.type === "error" && m.id === undefined) {
          this.ready = null;
          this.worker = null;
          w.terminate();
          return reject(new Error(m.message));
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
        this.ready = null;
        this.worker = null;
        reject(new Error(e.message || "Worker xatosi"));
      };
      const msg: WorkerRequest = {
        type: "init",
        wasmPath: FACE.ortWasmPath,
        detectorUrl: FACE.detectorUrl,
        embedderUrl: FACE.embedderUrl,
      };
      w.postMessage(msg);
    });
    return this.ready;
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
