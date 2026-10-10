import { existsSync, readFileSync } from "node:fs";
import type { NextConfig } from "next";

// Yuz tanish Worker'i versiyasi (scripts/build-worker.mjs yozadi): eski nusxa keshdan olinmasin
const workerVersion = existsSync("public/face/version.json")
  ? (JSON.parse(readFileSync("public/face/version.json", "utf8")) as { hash: string }).hash
  : "dev";

const nextConfig: NextConfig = {
  cacheComponents: true,
  env: { NEXT_PUBLIC_FACE_WORKER_VERSION: workerVersion },
  // Dev rejimidagi "N" belgisi (Cache disabled) tugmalarni to'sib qo'ymasin
  devIndicators: false,
  // Dev rejimida telefondan (lokal tarmoq IP) yoki tunnel orqali ochishga ruxsat
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*", "*.trycloudflare.com", "*.ngrok-free.app"],
  partialPrefetching: true,
  // Cross-origin isolation: yuz tanish WebAssembly'si bir nechta protsessor yadrosida ishlaydi
  // (SharedArrayBuffer). "credentialless": tashqi rasm/shriftlar ishlashda davom etadi.
  async headers() {
    return [{
      // SIMULATE_CDN=1: Vercel kabi, statik fayllarga sarlavha qo'yilmaydi (sinov uchun)
      source: process.env.SIMULATE_CDN ? "/((?!_next/|ort/|face/|models/|demo/).*)" : "/:path*",
      headers: [
        { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
      ],
    }];
  },
  experimental: {
    // Mock bosqichda ilova to'liq brauzerda chiziladi (ma'lumotlar localStorage'da),
    // shuning uchun avtomatik "instant navigation" tekshiruvi o'chirilgan.
    // NestJS backend ulanganda serverda chiziladigan sahifalar uchun qayta yoqiladi.
    instantInsights: { validationLevel: "manual-warning" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
