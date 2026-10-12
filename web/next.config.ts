import { existsSync, readFileSync } from "node:fs";
import type { NextConfig } from "next";

// Yuz tanish Worker'i versiyasi (scripts/build-worker.mjs yozadi): eski nusxa keshdan olinmasin
const workerVersion = existsSync("public/face/version.json")
  ? (JSON.parse(readFileSync("public/face/version.json", "utf8")) as { hash: string }).hash
  : "dev";

// Xavfsizlik sarlavhalari. Sahifalarning CSP'si (nonce bilan) src/proxy.ts da har so'rovga yangi.
// Bu yerdagi CSP faqat statik fayllar uchun (Worker skriptlari o'z CSP'si bilan ishlaydi):
// yuz tanish Worker'i onnxruntime modulini blob: orqali yuklaydi va WebAssembly ishlatadi.
const dev = process.env.NODE_ENV !== "production";
const ASSET_CSP = [
  "default-src 'self'",
  `script-src 'self' blob: 'wasm-unsafe-eval'${dev ? " 'unsafe-eval'" : ""}`,
  "connect-src 'self' blob: data:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join("; ");
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  ...(dev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Har so'rovda yangi CSP nonce: sahifalar dinamik chiziladi (cacheComponents/PPR nonce bilan mos emas)
  env: { NEXT_PUBLIC_FACE_WORKER_VERSION: workerVersion },
  // Dev rejimidagi "N" belgisi (Cache disabled) tugmalarni to'sib qo'ymasin
  devIndicators: false,
  // Dev rejimida telefondan (lokal tarmoq IP) yoki tunnel orqali ochishga ruxsat
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*", "*.trycloudflare.com", "*.ngrok-free.app"],
  // Cross-origin isolation: yuz tanish WebAssembly'si bir nechta protsessor yadrosida ishlaydi
  // (SharedArrayBuffer). "credentialless": tashqi rasm/shriftlar ishlashda davom etadi.
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      { source: "/:dir(face|ort|models|demo|_next)/:path*", headers: [{ key: "Content-Security-Policy", value: ASSET_CSP }] },
      { source: "/sw.js", headers: [{ key: "Content-Security-Policy", value: ASSET_CSP }] },
      {
      // SIMULATE_CDN=1: Vercel kabi, statik fayllarga sarlavha qo'yilmaydi (sinov uchun)
      source: process.env.SIMULATE_CDN ? "/((?!_next/|ort/|face/|models/|demo/).*)" : "/:path*",
      headers: [
        { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
      ],
    }];
  },
  experimental: {
    // Sahifalar dinamik (har so'rovga CSP nonce), lekin ichidagi ma'lumot brauzerdagi store'dan:
    // server javobi (RSC) faqat sahifa "qobig'i". Shuni 5 daqiqa brauzerda saqlash — qayta o'tish darhol.
    staleTimes: { dynamic: 300, static: 300 },
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
