"use client";

import { useParams } from "next/navigation";

/** Dinamik sahifa parametri (sahifa Suspense ichida chiziladi). */
export function useRouteParam(name: string): string {
  const p = useParams<Record<string, string>>();
  return decodeURIComponent(p[name] ?? "");
}
