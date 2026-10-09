/// <reference lib="webworker" />
// Yuz tanish alohida oqimda (Web Worker): sahifa qotmaydi.
import * as ort from "onnxruntime-web/wasm";

import { FaceEngine } from "./engine";
import type { RgbaImage } from "./image";
import type { WorkerRequest, WorkerResponse } from "./protocol";

declare const self: DedicatedWorkerGlobalScope;

let engine: FaceEngine | null = null;
let frame: RgbaImage | null = null;

const post = (msg: WorkerResponse, transfer: Transferable[] = []) => self.postMessage(msg, transfer);

async function fetchModel(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Model yuklanmadi: ${url} (${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const m = e.data;
  try {
    if (m.type === "init") {
      if (!engine) {
        ort.env.wasm.wasmPaths = m.wasmPath;
        ort.env.wasm.numThreads = 1;
        const [det, emb] = await Promise.all([fetchModel(m.detectorUrl), fetchModel(m.embedderUrl)]);
        engine = await FaceEngine.create(ort, det, emb);
      }
      post({ type: "ready" });
    } else if (m.type === "detect") {
      if (!engine) throw new Error("Model hali yuklanmagan");
      frame = { width: m.width, height: m.height, data: new Uint8ClampedArray(m.buffer) };
      const t0 = performance.now();
      if (m.regions?.length) {
        const r = await engine.detectEach(frame, m.regions, m.full !== false);
        post({ type: "detected", id: m.id, detections: r.full, perRegion: r.perRegion, ms: performance.now() - t0 });
      } else {
        const detections = await engine.detect(frame);
        post({ type: "detected", id: m.id, detections, ms: performance.now() - t0 });
      }
    } else if (m.type === "embed") {
      if (!engine || !frame) throw new Error("Kadr yo'q");
      const embeddings: Float32Array[] = [];
      for (const kps of m.kps) embeddings.push(await engine.embed(frame, kps));
      post({ type: "embedded", id: m.id, embeddings }, embeddings.map((x) => x.buffer));
    }
  } catch (err) {
    post({ type: "error", id: "id" in m ? m.id : undefined, message: err instanceof Error ? err.message : String(err) });
  }
};
