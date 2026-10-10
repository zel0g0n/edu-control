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

/** Yuklanish foizi: barcha modellar bo'yicha umumiy. */
const progress = new Map<string, { loaded: number; total: number }>();
function reportProgress() {
  let loaded = 0, total = 0;
  for (const p of progress.values()) { loaded += p.loaded; total += p.total; }
  post({ type: "progress", loaded, total });
}

async function readWithProgress(res: Response, url: string): Promise<ArrayBuffer> {
  // Content-Length siqilgan hajm bo'lishi mumkin: foiz taxminiy, 99% dan oshmaydi
  const total = Number(res.headers.get("Content-Length")) || 0;
  if (!res.body || !total) return res.arrayBuffer();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    progress.set(url, { loaded: Math.min(loaded, total * 0.99), total });
    reportProgress();
  }
  const out = new Uint8Array(loaded);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  progress.set(url, { loaded: total, total });
  reportProgress();
  return out.buffer;
}

/** Modellar telefonda saqlanadi (Cache API): keyingi ochilishda internet sarflanmaydi. */
const MODEL_CACHE = "edunazorat-models-v2";

async function fetchModel(url: string): Promise<Uint8Array> {
  let cache: Cache | undefined;
  try {
    cache = await caches.open(MODEL_CACHE);
    const hit = await cache.match(url);
    if (hit) return new Uint8Array(await hit.arrayBuffer());
  } catch {
    cache = undefined; // xavfsiz kontekst emas yoki xotira yo'q
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Model yuklanmadi: ${url} (${res.status})`);
  const buf = await readWithProgress(res, url);
  try {
    await cache?.put(url, new Response(buf.slice(0), { headers: { "Content-Type": "application/octet-stream" } }));
    // Eski versiyalar keshini tozalash
    for (const k of await caches.keys()) if (k.startsWith("edunazorat-models-") && k !== MODEL_CACHE) await caches.delete(k);
  } catch {
    /* saqlab bo'lmadi: keyingi safar qayta yuklanadi */
  }
  return new Uint8Array(buf);
}

// Ichki (ORT) oqimlardagi kutilmagan xatolar ham sababi bilan sahifaga yetib borsin
self.addEventListener("error", (ev) => post({ type: "error", message: `${ev.message || "Worker xatosi"}${ev.filename ? ` (${ev.filename.split("/").pop()}:${ev.lineno})` : ""}` }));
self.addEventListener("unhandledrejection", (ev) => post({ type: "error", message: String((ev.reason as Error)?.message ?? ev.reason) }));

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const m = e.data;
  try {
    if (m.type === "init") {
      if (!engine) {
        // ORT glue (.mjs) blob: orqali: ichki oqimlar undan yaratiladi va sahifa siyosatini
        // (COEP) meros oladi — hosting statik faylga sarlavha qo'ymasa ham ishlaydi.
        const mjsRes = await fetch(`${m.wasmPath}ort-wasm-simd-threaded.mjs`);
        if (!mjsRes.ok) throw new Error(`ORT yuklanmadi (${mjsRes.status})`);
        const mjsUrl = URL.createObjectURL(new Blob([await mjsRes.text()], { type: "text/javascript" }));
        ort.env.wasm.wasmPaths = { mjs: mjsUrl, wasm: `${m.wasmPath}ort-wasm-simd-threaded.wasm` };
        // Ko'p yadroli ishlash faqat cross-origin isolation bo'lsa (next.config.ts headers)
        const cores = (self.navigator as Navigator | undefined)?.hardwareConcurrency ?? 2;
        ort.env.wasm.numThreads = m.threads && self.crossOriginIsolated ? Math.max(1, Math.min(4, cores)) : 1;
        const [det, emb] = await Promise.all([fetchModel(m.detectorUrl), fetchModel(m.embedderUrl)]);
        // Ko'p oqimli ishga tushish ba'zi qurilmalarda osilib qoladi: 25 soniyada tayyor bo'lmasa xato
        // (sahifa bir oqimli zaxira rejimga o'tadi)
        engine = await Promise.race([
          FaceEngine.create(ort, det, emb),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error("WebAssembly ishga tushmadi (vaqt tugadi)")), 25_000)),
        ]);
      }
      post({ type: "ready", threads: ort.env.wasm.numThreads ?? 1 });
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
      const qualities: number[] = [];
      for (const kps of m.kps) {
        const r = await engine.embed(frame, kps);
        embeddings.push(r.embedding);
        qualities.push(r.quality);
      }
      post({ type: "embedded", id: m.id, embeddings, qualities }, embeddings.map((x) => x.buffer as ArrayBuffer));
    }
  } catch (err) {
    post({ type: "error", id: "id" in m ? m.id : undefined, message: err instanceof Error ? err.message : String(err) });
  }
};
