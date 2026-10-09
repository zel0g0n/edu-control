import type { Point } from "./image";
import type { Region } from "./tiles";
import type { Detection } from "./yunet";

export type WorkerRequest =
  | { type: "init"; wasmPath: string; detectorUrl: string; embedderUrl: string }
  | { type: "detect"; id: number; width: number; height: number; buffer: ArrayBuffer; regions?: Region[]; full?: boolean }
  | { type: "embed"; id: number; kps: Point[][] };

export type WorkerResponse =
  | { type: "ready" }
  | { type: "detected"; id: number; detections: Detection[]; perRegion?: Detection[][]; ms: number }
  | { type: "embedded"; id: number; embeddings: Float32Array[] }
  | { type: "error"; id?: number; message: string };
