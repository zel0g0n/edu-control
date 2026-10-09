"use client";

import { UserRound } from "lucide-react";
import type { Student } from "@edunazorat/shared";

import { useApp } from "@/lib/data/store";
import { useT } from "@/lib/i18n/react";
import { PageBody, PageHeader } from "./shell";
import { Card, EmptyState } from "./ui";

/** O'quvchi kabineti sahifasi. */
export function StudentFrame({ title, back, children }: { title: string; back?: string; children: (s: Student) => React.ReactNode }) {
  const app = useApp();
  const t = useT();
  const s = app.currentUser?.studentId ? app.student(app.currentUser.studentId) : undefined;
  return (
    <>
      <PageHeader title={t(title)} back={back} subtitle={s ? `${s.name} · ${app.schoolClass(s.classId)?.name}` : undefined} />
      <PageBody>{s ? children(s) : <Card><EmptyState icon={UserRound} title={t("O'quvchi ma'lumoti topilmadi")} /></Card>}</PageBody>
    </>
  );
}
