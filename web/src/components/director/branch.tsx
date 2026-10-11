"use client";

import { useState } from "react";
import { classIdsOf, type SchoolClass, type Student } from "@edunazorat/shared";

import { useApp } from "@/lib/data/store";
import { useT } from "@/lib/i18n/react";
import { Select } from "../ui";

const KEY = "edunazorat-branch";

function load(): string {
  try { return localStorage.getItem(KEY) ?? ""; } catch { return ""; }
}

/**
 * Filial filtri (Guruhlar, O'quvchilar, To'lovlar). Tanlov sahifalar orasida eslab qolinadi.
 * Filial yo'q bo'lsa select chizilmaydi va hamma narsa ko'rinadi.
 */
export function useBranchFilter() {
  const app = useApp();
  const t = useT();
  // Filial administratori faqat o'z filiallarini tanlaydi (bitta bo'lsa filtr kerak emas)
  const own = app.currentUser?.role === "admin" ? app.currentUser.branchIds : undefined;
  const all = app.myInstitution?.settings.branches ?? [];
  const branches = own?.length ? all.filter((b) => own.includes(b.id)) : all;
  const [stored, setStored] = useState(load);
  const branchId = branches.some((b) => b.id === stored) ? stored : "";
  const set = (v: string) => {
    setStored(v);
    try { localStorage.setItem(KEY, v); } catch { /* saqlanmasa ham ishlaydi */ }
  };
  const classIds = new Set(app.db.classes.filter((c) => c.branchId === branchId).map((c) => c.id));
  const matchClass = (c: SchoolClass) => !branchId || c.branchId === branchId;
  const matchStudent = (s: Student) => !branchId || classIdsOf(s).some((id) => classIds.has(id));
  const select = branches.length < (own?.length ? 2 : 1) ? null : (
    <Select value={branchId} onChange={set} aria-label={t("Filial")} className="sm:w-44">
      <option value="">{t("Barcha filiallar")}</option>
      {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
    </Select>
  );
  return { branchId, matchClass, matchStudent, select, branches };
}
