"use client";

import { useState } from "react";
import { BookOpen, Plus } from "lucide-react";
import { addDays, attendanceRate, invoiceRemaining, weightedAverage, type Lesson } from "@edunazorat/shared";

import { LessonForm, StudentForm } from "@/components/director/forms";
import { ScheduleGrid } from "@/components/director/schedule-grid";
import { useRouteParam } from "@/components/route-param";
import { PageBody, PageHeader } from "@/components/shell";
import { Journal } from "@/components/teacher/journal";
import { Avatar, avgTone, btn, Card, Chip, ChipRow, DataTable, EmptyState, Segmented, Select, toneText } from "@/components/ui";
import { useApp } from "@/lib/data/store";
import { fmt, termLabel } from "@/lib/format";
import { useT } from "@/lib/i18n/react";

export function ClassClient() {
  const app = useApp();
  const t = useT();
  const id = useRouteParam("id");
  const cls = app.schoolClass(id);
  const [tab, setTab] = useState<"students" | "schedule" | "journal">("students");
  const [lessonForm, setLessonForm] = useState<{ lesson?: Lesson; weekday?: number; slot?: [string, string] } | null>(null);
  const [addStudent, setAddStudent] = useState(false);
  const subjects = cls ? app.subjectsOfClass(cls.id) : [];
  const [subject, setSubject] = useState(subjects[0] ?? "");
  const terms = cls ? app.termsOf(cls.institutionId) : [];
  const [termId, setTermId] = useState(() => (cls ? app.currentTerm(cls.institutionId)?.id ?? "" : ""));
  const term = terms.find((x) => x.id === termId);

  if (!cls) return (<><PageHeader back="/director/classes" title={t("Sinf")} /><PageBody><Card><EmptyState icon={BookOpen} title={t("Sinf topilmadi")} /></Card></PageBody></>);
  const students = app.studentsOfClass(cls.id);
  const t0 = app.currentTerm(cls.institutionId)?.startDay;

  return (
    <>
      <PageHeader back="/director/classes" title={cls.name}
        subtitle={`${t("{n} o'quvchi", { n: students.length })} · ${t("Sinf rahbari")}: ${cls.homeroomTeacherId ? app.userById(cls.homeroomTeacherId)?.name : "—"}`}
        actions={tab === "students" ? <button type="button" className={btn.smPrimary} onClick={() => setAddStudent(true)}><Plus size={16} aria-hidden /> {t("O'quvchi qo'shish")}</button>
          : tab === "schedule" ? <button type="button" className={btn.smPrimary} onClick={() => setLessonForm({})}><Plus size={16} aria-hidden /> {t("Dars qo'shish")}</button> : undefined}
        below={<Segmented value={tab} onChange={setTab} options={[
          { value: "students", label: t("O'quvchilar") }, { value: "schedule", label: t("Dars jadvali") }, { value: "journal", label: t("Jurnal") },
        ]} />} />
      <PageBody>
        {tab === "students" && (
          <DataTable rows={students} rowKey={(s) => s.id} rowHref={(s) => `/director/students/${s.id}`} initialSort={{ key: "name", dir: 1 }}
            empty={<Card><EmptyState icon={BookOpen} title={t("Sinfda o'quvchi yo'q")} /></Card>}
            columns={[
              { key: "name", header: t("O'quvchi"), sort: (s) => s.name, cell: (s) => <span className="flex items-center gap-2.5"><Avatar name={s.name} image={s.facePhoto} size={32} /><span className="font-medium">{s.name}</span></span> },
              { key: "att", header: t("Davomat"), align: "right", cell: (s) => fmt.percent(attendanceRate(app.attendanceOfStudentBetween(s.id, addDays(app.today, -30), app.today))) },
              { key: "avg", header: t("O'rtacha"), align: "right", cell: (s) => { const v = weightedAverage(app.gradesOfStudent(s.id, { from: t0 })); return <b className={toneText(avgTone(v))}>{v === null ? "—" : fmt.number(v, 2)}</b>; } },
              { key: "debt", header: t("Qarz"), align: "right", cell: (s) => { const d = app.invoicesOfStudent(s.id).reduce((x, i) => x + invoiceRemaining(i), 0); return d ? <span className="text-bad">{fmt.moneyShort(d)}</span> : "—"; } },
            ]} />
        )}
        {tab === "schedule" && (
          <>
            <ScheduleGrid lessons={app.lessonsOfClass(cls.id)} mode="class" onEdit={(l) => setLessonForm({ lesson: l })} onAdd={(weekday, slot) => setLessonForm({ weekday, slot })} />
            <p className="mt-2 px-1 text-xs text-muted">{t("Bo'sh katakni bosib dars qo'shing, darsni bosib tahrirlang. To'qnashuvlar avtomatik tekshiriladi.")}</p>
          </>
        )}
        {tab === "journal" && (subjects.length === 0 || !term ? <Card><EmptyState icon={BookOpen} title={t("Jadvalda dars yo'q")} /></Card> : (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <ChipRow>{subjects.map((s) => <Chip key={s} selected={subject === s} onClick={() => setSubject(s)}>{s}</Chip>)}</ChipRow>
              <span className="flex-1" />
              <Select value={termId} onChange={setTermId} className="h-10 !w-auto" aria-label={t("Chorak")}>{terms.map((x) => <option key={x.id} value={x.id}>{termLabel(x.name)}</option>)}</Select>
            </div>
            <Journal classId={cls.id} subject={subject} term={term} editable={false} />
          </>
        ))}
      </PageBody>
      {lessonForm && <LessonForm classId={cls.id} lesson={lessonForm.lesson} weekday={lessonForm.weekday} slot={lessonForm.slot} onClose={() => setLessonForm(null)} />}
      {addStudent && <StudentForm defaultClassId={cls.id} onClose={() => setAddStudent(false)} />}
    </>
  );
}
