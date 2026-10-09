import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // Dev rejimidagi "N" belgisi (Cache disabled) tugmalarni to'sib qo'ymasin
  devIndicators: false,
  // Dev rejimida telefondan (lokal tarmoq IP) yoki tunnel orqali ochishga ruxsat
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*", "*.trycloudflare.com", "*.ngrok-free.app"],
  partialPrefetching: true,
  // Cross-origin isolation: yuz tanish WebAssembly'si bir nechta protsessor yadrosida ishlaydi
  // (SharedArrayBuffer). "credentialless": tashqi rasm/shriftlar ishlashda davom etadi.
  async headers() {
    return [{
      source: "/:path*",
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
