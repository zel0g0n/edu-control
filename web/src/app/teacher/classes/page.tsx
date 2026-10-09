"use client";

import Link from "next/link";
import { BookOpen, ScanFace, Users } from "lucide-react";

import { PageBody, PageHeader } from "@/components/shell";
import { Card, EmptyState, Pill, ProgressBar } from "@/components/ui";
import { useApp } from "@/lib/data/store";
import { usableTemplates } from "@/lib/face/matcher";
import { useT } from "@/lib/i18n/react";

export default function TeacherClasses() {
  const app = useApp();
  const t = useT();
  const me = app.currentUser!;
  const classes = app.classesOfTeacher(me.id);
  return (
    <>
      <PageHeader title={t("Sinflar va jurnal")} />
      <PageBody>
        {classes.length === 0 ? (
          <Card><EmptyState icon={BookOpen} title={t("Sizga hali sinf biriktirilmagan")} text={t("Direktor dars jadvaliga qo'shgach, sinflar shu yerda chiqadi")} /></Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {classes.map((c) => {
              const students = app.studentsOfClass(c.id);
              const consent = students.filter((s) => s.parentConsent).length;
              const enrolled = students.filter((s) => s.parentConsent && usableTemplates(s).length > 0).length;
              const subjects = app.subjectsOfTeacherInClass(me.id, c.id);
              return (
                <Link key={c.id} href={`/teacher/classes/${c.id}`} className="group rounded-2xl border border-line bg-surface p-4 transition hover:border-primary/50">
                  <div className="flex items-start gap-2">
                    <span className="font-display flex-1 text-xl font-bold group-hover:underline">{c.name}</span>
                    {c.homeroomTeacherId === me.id && <Pill tone="primary">{t("sinf rahbari")}</Pill>}
                  </div>
                  <div className="mt-1 text-sm text-muted">{subjects.join(", ") || t("Dars yo'q")}</div>
                  <div className="mt-3 flex items-center gap-4 text-sm">
                    <span className="flex items-center gap-1.5"><Users size={15} aria-hidden className="text-muted" />{t("{n} o'quvchi", { n: students.length })}</span>
                    <span className="flex items-center gap-1.5"><ScanFace size={15} aria-hidden className="text-muted" />{enrolled}/{consent}</span>
                  </div>
                  <ProgressBar className="mt-2" value={consent ? enrolled / consent : 0} tone={enrolled === consent ? "ok" : "warn"} />
                  <div className="mt-1 text-xs text-muted">{t("Yuz namunasi olinganlar (rozilik berganlardan)")}</div>
                </Link>
              );
            })}
          </div>
        )}
      </PageBody>
    </>
  );
}
