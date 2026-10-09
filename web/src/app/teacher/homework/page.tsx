"use client";

import { useState } from "react";
import Link from "next/link";
import { NotebookPen, Plus } from "lucide-react";

import { PageBody, PageHeader } from "@/components/shell";
import { HomeworkEditor } from "@/components/teacher/homework-editor";
import { btn, Card, Chip, ChipRow, cx, EmptyState, Pill, ProgressBar, Segmented } from "@/components/ui";
import { useApp } from "@/lib/data/store";
import { fmt } from "@/lib/format";
import { useT } from "@/lib/i18n/react";

export default function TeacherHomework() {
  const app = useApp();
  const t = useT();
  const me = app.currentUser!;
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"review" | "current" | "past">("review");
  const [classId, setClassId] = useState<string | null>(null);
  const all = app.homeworkOfTeacher(me.id).filter((h) => !classId || h.classId === classId);
  const waiting = (id: string) => app.submissionsOf(id).filter((s) => s.status === "submitted").length;
  const list = tab === "review" ? all.filter((h) => waiting(h.id) > 0)
    : tab === "current" ? all.filter((h) => h.dueDay >= app.today).reverse()
      : all.filter((h) => h.dueDay < app.today);
  const classes = app.classesOfTeacher(me.id);

  return (
    <>
      <PageHeader title={t("Vazifalar")} actions={<button type="button" className={btn.smPrimary} onClick={() => setOpen(true)}><Plus size={16} aria-hidden /> {t("Yangi vazifa")}</button>}
        below={<Segmented value={tab} onChange={setTab} options={[
          { value: "review", label: `${t("Tekshirish")}${all.some((h) => waiting(h.id)) ? ` (${all.reduce((s, h) => s + waiting(h.id), 0)})` : ""}` },
          { value: "current", label: t("Joriy") },
          { value: "past", label: t("O'tgan") },
        ]} />} />
      <PageBody>
        {classes.length > 1 && (
          <div className="mb-3">
            <ChipRow>
              <Chip selected={!classId} onClick={() => setClassId(null)}>{t("Barcha sinflar")}</Chip>
              {classes.map((c) => <Chip key={c.id} selected={classId === c.id} onClick={() => setClassId(c.id)}>{c.name}</Chip>)}
            </ChipRow>
          </div>
        )}
        {list.length === 0 ? (
          <Card><EmptyState icon={NotebookPen} title={tab === "review" ? t("Tekshiriladigan javob yo'q") : t("Vazifa yo'q")} /></Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {list.map((h) => {
              const total = app.studentsOfClass(h.classId).length;
              const subs = app.submissionsOf(h.id);
              const w = waiting(h.id);
              return (
                <Link key={h.id} href={`/teacher/homework/${h.id}`} className="rounded-2xl border border-line bg-surface p-4 transition hover:border-primary/50">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{h.title}</div>
                      <div className="text-sm text-muted">{app.schoolClass(h.classId)?.name} · {h.subject}</div>
                    </div>
                    {w > 0 && <Pill tone="warn">{t("{n} ta yangi", { n: w })}</Pill>}
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-muted">
                    <span className={cx(h.dueDay === app.today && "font-semibold text-margin")}>{t("Muddat")}: {fmt.date(h.dueDay)}</span>
                    <span className="tabular">{t("Topshirdi")}: {subs.length}/{total}</span>
                  </div>
                  <ProgressBar className="mt-1.5" value={total ? subs.length / total : 0} tone={subs.length === total ? "ok" : "primary"} />
                </Link>
              );
            })}
          </div>
        )}
      </PageBody>
      <HomeworkEditor open={open} onClose={() => setOpen(false)} />
    </>
  );
}
