import { NextResponse, type NextRequest } from "next/server";

// Har bir sahifa so'rovi uchun yangi nonce: faqat shu nonce'li skriptlar ishlaydi ('unsafe-inline' yo'q).
// Next.js nonce'ni so'rovdagi CSP sarlavhasidan o'qib, o'z skriptlariga avtomatik qo'yadi.
const apiOrigin = (() => {
  try {
    return process.env.NEXT_PUBLIC_API_URL ? new URL(process.env.NEXT_PUBLIC_API_URL).origin : "";
  } catch {
    return "";
  }
})();

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const dev = process.env.NODE_ENV === "development";
  const csp = [
    "default-src 'self'",
    // 'strict-dynamic': nonce'li skript yuklagan bo'laklar ishonchli; begona va inline skriptlar taqiqlangan
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${dev ? " 'unsafe-eval'" : ""}`,
    // style atributlari (style={{...}}) uchun; skript emas, xavfi past
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    `img-src 'self' data: blob: ${apiOrigin}`.trim(),
    `connect-src 'self' ${apiOrigin}${dev ? " ws: wss:" : ""}`.trim(),
    "media-src 'self' blob: data:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Statik fayllar (yuz modeli, onnx, rasmlar) proksidan o'tmaydi: ularning CSP'si next.config.ts da
      source: "/((?!_next/static|_next/image|face/|ort/|models/|demo/|sw\\.js|manifest\\.webmanifest|favicon|icon-|apple-touch|badge-).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
