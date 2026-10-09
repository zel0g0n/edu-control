"use client";

import { useState } from "react";
import Link from "next/link";
import { BookOpen, Pencil, Plus, Trash2 } from "lucide-react";
import { addDays, attendanceRate, type SchoolClass } from "@edunazorat/shared";

import { ClassForm } from "@/components/director/forms";
import { useRun } from "@/components/providers";
import { PageBody, PageHeader } from "@/components/shell";
import { btn, Card, EmptyState, useConfirm } from "@/components/ui";
import { useApp } from "@/lib/data/store";
import { fmt } from "@/lib/format";
import { useT } from "@/lib/i18n/react";

export default function DirectorClasses() {
  const app = useApp();
  const t = useT();
  const run = useRun();
  const { ask, dialog } = useConfirm();
  const inst = app.myInstitution!;
  const [form, setForm] = useState<SchoolClass | "new" | null>(null);
  const classes = app.classesOfInstitution(inst.id);

  const remove = async (c: SchoolClass) => {
    if (!(await ask(t("«{name}» sinfi va uning dars jadvali o'chiriladi.", { name: c.name }), { danger: true, ok: t("O'chirish") }))) return;
    await run(() => app.run("class.delete", { id: c.id }), t("Sinf o'chirildi"));
  };

  return (
    <>
      <PageHeader title={t("Sinflar")} subtitle={t("{n} ta", { n: classes.length })}
        actions={<button type="button" className={btn.smPrimary} onClick={() => setForm("new")}><Plus size={16} aria-hidden /> {t("Sinf qo'shish")}</button>} />
      <PageBody>
        {classes.length === 0 ? (
          <Card><EmptyState icon={BookOpen} title={t("Hali sinf yo'q")} text={t("Avval sinf yoki guruh yarating, keyin o'quvchilar va dars jadvalini qo'shing")}
            action={<button type="button" className={btn.smPrimary} onClick={() => setForm("new")}><Plus size={16} aria-hidden /> {t("Sinf qo'shish")}</button>} /></Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {classes.map((c) => {
              const students = app.studentsOfClass(c.id);
              const ids = new Set(students.map((s) => s.id));
              const rate = attendanceRate(app.db.attendance.filter((a) => ids.has(a.studentId) && a.day >= addDays(app.today, -30)));
              const homeroom = c.homeroomTeacherId ? app.userById(c.homeroomTeacherId) : undefined;
              return (
                <Card key={c.id} className="flex flex-col p-4">
                  <div className="flex items-start gap-2">
                    <Link href={`/director/classes/${c.id}`} className="font-display flex-1 text-xl font-bold hover:underline">{c.name}</Link>
                    <button type="button" className={btn.icon} aria-label={t("Tahrirlash")} onClick={() => setForm(c)}><Pencil size={16} /></button>
                    <button type="button" className={btn.icon} aria-label={t("O'chirish")} onClick={() => remove(c)}><Trash2 size={16} className="text-bad" /></button>
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-y-2 text-sm">
                    <dt className="text-muted">{t("O'quvchilar")}</dt><dd className="tabular text-right font-medium">{students.length}</dd>
                    <dt className="text-muted">{t("Sinf rahbari")}</dt><dd className="truncate text-right font-medium">{homeroom?.name ?? "—"}</dd>
                    <dt className="text-muted">{t("Oylik to'lov")}</dt><dd className="tabular text-right font-medium">{fmt.moneyShort(c.monthlyFee)}</dd>
                    <dt className="text-muted">{t("Davomat (30 kun)")}</dt><dd className="tabular text-right font-medium">{fmt.percent(rate)}</dd>
                    <dt className="text-muted">{t("Haftalik dars")}</dt><dd className="tabular text-right font-medium">{app.lessonsOfClass(c.id).length}</dd>
                  </dl>
                  <Link href={`/director/classes/${c.id}`} className={`${btn.sm} mt-4`}>{t("O'quvchilar va jadval")}</Link>
                </Card>
              );
            })}
          </div>
        )}
      </PageBody>
      {form && <ClassForm cls={form === "new" ? undefined : form} onClose={() => setForm(null)} />}
      {dialog}
    </>
  );
}
