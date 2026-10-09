"use client";

import { NotebookPen } from "lucide-react";

import { HomeworkDetail } from "@/components/homework-detail";
import { useRouteParam } from "@/components/route-param";
import { PageBody, PageHeader } from "@/components/shell";
import { Card, EmptyState } from "@/components/ui";
import { useApp } from "@/lib/data/store";
import { useT } from "@/lib/i18n/react";

export function HomeworkClient() {
  const app = useApp();
  const t = useT();
  const id = useRouteParam("id");
  const hw = app.homework(id);
  const s = app.currentUser?.studentId ? app.student(app.currentUser.studentId) : undefined;
  return (
    <>
      <PageHeader back="/student/homework" title={hw?.title ?? t("Vazifa")} subtitle={hw?.subject} />
      <PageBody className="max-w-3xl">
        {hw && s ? <HomeworkDetail hw={hw} student={s} canSubmit /> : <Card><EmptyState icon={NotebookPen} title={t("Vazifa topilmadi")} /></Card>}
      </PageBody>
    </>
  );
}
