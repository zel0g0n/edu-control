"use client";

import { useEffect } from "react";

import { useApp } from "./store";

/**
 * Sahifaga `from` kunidan boshlab davomat kerak: boshlang'ich yuklashda yo'q bo'lsa serverdan olinadi.
 * true — ma'lumot to'liq (hisoblash mumkin), false — yuklanmoqda.
 */
export function useAttendanceFrom(from: string | undefined): boolean {
  const app = useApp();
  const have = app.db.attendanceFrom;
  const need = !!from && !!have && from < have;
  useEffect(() => {
    if (need && from) void app.ensureAttendance(from).catch(() => undefined);
  }, [app, need, from]);
  return !need;
}
