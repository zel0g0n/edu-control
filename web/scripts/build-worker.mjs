// Yuz tanish Worker'ini alohida fayl qilib yig'adi: public/face/face-worker.mjs
// Sahifa uni blob: orqali ochadi, shuning uchun hosting statik fayllarga maxsus
// sarlavha (COEP) qo'ymasa ham ko'p oqimli rejim ishlaydi (Vercel CDN).
import { build } from "esbuild";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public", "face", "face-worker.mjs");
mkdirSync(dirname(out), { recursive: true });
await build({
  entryPoints: [join(root, "src", "lib", "face", "face.worker.ts")],
  outfile: out,
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: true,
  // onnxruntime-web: tashqi .mjs/.wasm (public/ort) bilan, ichiga joylanmagan variant
  conditions: ["onnxruntime-web-use-extern-wasm"],
  alias: { "@": join(root, "src") },
  logLevel: "warning",
});
const hash = createHash("sha256").update(readFileSync(out)).digest("hex").slice(0, 12);
writeFileSync(join(root, "public", "face", "version.json"), JSON.stringify({ hash }));
console.log(`face-worker.mjs yig'ildi (${hash})`);
