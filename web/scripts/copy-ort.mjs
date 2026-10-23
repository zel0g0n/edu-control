// onnxruntime-web WebAssembly fayllarini public/ort ga ko'chiradi
// (npm install / dev / build oldidan avtomatik ishlaydi).
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const dist = dirname(require.resolve("onnxruntime-web/ort-wasm-simd-threaded.wasm"));
const out = join(root, "public", "ort");
mkdirSync(out, { recursive: true });
for (const f of ["ort-wasm-simd-threaded.wasm", "ort-wasm-simd-threaded.mjs"]) {
  const src = join(dist, f);
  if (!existsSync(src)) throw new Error(`Topilmadi: ${src}`);
  copyFileSync(src, join(out, f));
}
console.log("onnxruntime-web fayllari public/ort ga ko'chirildi");

// PDF o'qish (o'quvchilarni fayldan qo'shish): pdf.js Worker'i public/pdf ga
const pdfDir = dirname(require.resolve("pdfjs-dist/build/pdf.worker.min.mjs"));
const pdfOut = join(root, "public", "pdf");
mkdirSync(pdfOut, { recursive: true });
copyFileSync(join(pdfDir, "pdf.worker.min.mjs"), join(pdfOut, "pdf.worker.min.mjs"));
