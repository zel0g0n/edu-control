"use client";

import { useState } from "react";
import { CalendarDays, Plus } from "lucide-react";
import type { Lesson } from "@edunazorat/shared";

import { LessonForm } from "@/components/director/forms";
import { ScheduleGrid } from "@/components/director/schedule-grid";
import { PageBody, PageHeader } from "@/components/shell";
import { btn, Card, EmptyState, Segmented, Select } from "@/components/ui";
import { useApp } from "@/lib/data/store";
import { useT } from "@/lib/i18n/react";

export default function DirectorSchedule() {
  const app = useApp();
  const t = useT();
  const inst = app.myInstitution!;
  const classes = app.classesOfInstitution(inst.id);
  const teachers = app.teachersOfInstitution(inst.id);
  const [mode, setMode] = useState<"class" | "teacher">("class");
  const [classId, setClassId] = useState(classes[0]?.id ?? "");
  const [teacherId, setTeacherId] = useState(teachers[0]?.id ?? "");
  const [form, setForm] = useState<{ lesson?: Lesson; weekday?: number; slot?: [string, string] } | null>(null);
  const lessons = mode === "class" ? app.lessonsOfClass(classId) : app.db.lessons.filter((l) => l.teacherId === teacherId);

  return (
    <>
      <PageHeader title={t("Dars jadvali")}
        actions={<button type="button" className={btn.smPrimary} onClick={() => setForm({})}><Plus size={16} aria-hidden /> {t("Dars qo'shish")}</button>}
        below={
          <div className="flex flex-wrap items-center gap-2">
            <Segmented value={mode} onChange={setMode} options={[{ value: "class", label: t("Sinf bo'yicha") }, { value: "teacher", label: t("O'qituvchi bo'yicha") }]} />
            {mode === "class" ? (
              <Select value={classId} onChange={setClassId} className="h-10 !w-auto min-w-40" aria-label={t("Sinf")}>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
            ) : (
              <Select value={teacherId} onChange={setTeacherId} className="h-10 !w-auto min-w-52" aria-label={t("O'qituvchi")}>{teachers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select>
            )}
            <span className="text-sm text-muted">{t("{n} ta dars haftasiga", { n: lessons.length })}</span>
          </div>
        } />
      <PageBody>
        {classes.length === 0 ? <Card><EmptyState icon={CalendarDays} title={t("Avval sinf yarating")} /></Card> : (
          <ScheduleGrid lessons={lessons} mode={mode} onEdit={(l) => setForm({ lesson: l })}
            onAdd={mode === "class" ? (weekday, slot) => setForm({ weekday, slot }) : undefined} />
        )}
      </PageBody>
      {form && <LessonForm classId={mode === "class" ? classId : undefined} lesson={form.lesson} weekday={form.weekday} slot={form.slot} onClose={() => setForm(null)} />}
    </>
  );
}
