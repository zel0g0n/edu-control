"use client";

import { useSearchParams } from "next/navigation";

/** So'rov qatoridagi parametr (sahifa Suspense ichida bo'lishi kerak). */
export function useQueryParam(name: string): string | null {
  return useSearchParams().get(name);
}
