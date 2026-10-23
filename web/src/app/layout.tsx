import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";

import { Providers } from "@/components/providers";
import { THEME_BOOT_SCRIPT } from "@/lib/theme-boot";

import "./globals.css";

export const metadata: Metadata = {
  title: "EduControl",
  description: "Xususiy maktab va o'quv markazlari uchun nazorat platformasi",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/favicon-32.png", apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "EduControl", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f4ef" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1221" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // src/proxy.ts bergan nonce: inline skript faqat shu bilan ishlaydi (CSP'da 'unsafe-inline' yo'q)
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="uz" className="h-full antialiased" suppressHydrationWarning>
      <head>
        {/* API bilan ulanishni (DNS + TLS) sahifa kodi yuklanayotganda oldindan ochish: birinchi so'rov ~0,3 s tezroq */}
        {/* Ikkalasi: oddiy so'rovlar cookie'siz, tokenni yangilash (cookie rejimi) cookie bilan — brauzer ularni alohida ulaydi */}
        {process.env.NEXT_PUBLIC_API_URL && <>
          <link rel="preconnect" href={new URL(process.env.NEXT_PUBLIC_API_URL).origin} crossOrigin="anonymous" />
          <link rel="preconnect" href={new URL(process.env.NEXT_PUBLIC_API_URL).origin} crossOrigin="use-credentials" />
        </>}
        {/* Mavzu sahifa chizilishidan oldin qo'yiladi (miltillash bo'lmasin) */}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600;700;800&family=Unbounded:wght@600;700&display=swap"
        />
      </head>
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
