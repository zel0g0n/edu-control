"use client";

import { useState } from "react";
import Link from "next/link";
import { BookOpen, ListChecks, NotebookPen, Plus, ScanFace, Star, Users } from "lucide-react";
import { isPresent, type Student } from "@edunazorat/shared";

import { useQueryParam } from "@/components/query";
import { useRouteParam } from "@/components/route-param";
import { PageBody, PageHeader } from "@/components/shell";
import { GradeModal } from "@/components/teacher/grade-modal";
import { HomeworkEditor } from "@/components/teacher/homework-editor";
import {
  ATT_TONE, AttendancePill, Avatar, btn, Card, cx, EmptyState, GradeBadge, ListCard, Pill, Segmented, toneBg,
} from "@/components/ui";
import { useApp } from "@/lib/data/store";
import { fmt } from "@/lib/format";
import { useT } from "@/lib/i18n/react";

export function LessonClient() {
  const app = useApp();
  const t = useT();
  const id = useRouteParam("id");
  const day = useQueryParam("day") ?? app.today;
  const lesson = app.lesson(id);
  const [tab, setTab] = useState<"attendance" | "grades" | "homework">("attendance");
  const [grading, setGrading] = useState<Student | null>(null);
  const [hwOpen, setHwOpen] = useState(false);

  if (!lesson) return (<><PageHeader back="/teacher" title={t("Dars")} /><PageBody><Card><EmptyState icon={BookOpen} title={t("Dars topilmadi")} /></Card></PageBody></>);

  const cls = app.schoolClass(lesson.classId);
  const students = app.studentsOfClass(lesson.classId);
  const recs = app.attendanceOfLesson(lesson.id, day);
  const present = recs.filter((r) => isPresent(r.status)).length;
  const isToday = day === app.today;
  const q = isToday ? "" : `?day=${day}`;
  const homeworks = app.homeworkOfClass(lesson.classId).filter((h) => h.subject === lesson.subject).slice(0, 6);

  return (
    <>
      <PageHeader back="/teacher" title={`${cls?.name} · ${lesson.subject}`}
        subtitle={`${fmt.weekday(day)}, ${fmt.date(day)} · ${lesson.start}–${lesson.end} · ${t("{room}-xona", { room: lesson.room })}`}
        below={<Segmented value={tab} onChange={setTab} options={[
          { value: "attendance", label: t("Davomat") },
          { value: "grades", label: t("Baholar") },
          { value: "homework", label: t("Vazifa") },
        ]} />} />
      <PageBody>
        {tab === "attendance" && (
          <>
            <Card className="flex flex-wrap items-center gap-4 p-4">
              <div className="min-w-0 flex-1">
                <div className="text-sm text-muted">{t("Belgilangan")}</div>
                <div className="tabular text-[26px] font-bold tracking-tight">{recs.length}<span className="text-base text-muted">/{students.length}</span></div>
                <div className="text-sm text-muted">{t("Kelgan")}: {present} · {t("Yo'q")}: {recs.length - present}</div>
              </div>
              <div className="flex w-full gap-2 sm:w-auto">
                {isToday && <Link href={`/teacher/lesson/${lesson.id}/camera`} className={cx(btn.primary, "flex-1")}><ScanFace size={18} aria-hidden /> {t("Kamera orqali")}</Link>}
                <Link href={`/teacher/lesson/${lesson.id}/rollcall${q}`} className={cx(btn.tonal, "flex-1")}><ListChecks size={18} aria-hidden /> {t("Yo'qlama")}</Link>
              </div>
            </Card>
            <ListCard className="mt-3">
              {students.map((s) => {
                const r = app.attendanceRecord(s.id, lesson.id, day);
                return (
                  <div key={s.id} className="flex items-center gap-3 px-4 py-2.5">
                    <Avatar name={s.name} image={r?.snapshot ?? s.facePhoto} size={38} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{s.name}</span>
                      {r && <span className="tabular block text-xs text-muted">{fmt.time(r.markedAt)}{r.source === "face" ? ` · ${t("kamera")}${r.matchScore ? ` ${Math.round(r.matchScore * 100)}%` : ""}` : ""}</span>}
                    </span>
                    {r ? <AttendancePill status={r.status} /> : <span className="text-xs text-muted">{t("belgilanmagan")}</span>}
                  </div>
                );
              })}
            </ListCard>
            {students.length === 0 && <Card><EmptyState icon={Users} title={t("Sinfda o'quvchi yo'q")} /></Card>}
          </>
        )}

        {tab === "grades" && (
          <>
            <p className="mb-3 px-1 text-sm text-muted">{t("O'quvchini bosib baho qo'ying. Nazorat ishi o'rtachaga ikki baravar ta'sir qiladi.")}</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {students.map((s) => {
                const r = app.attendanceRecord(s.id, lesson.id, day);
                const gs = app.gradesOfStudent(s.id, { subject: lesson.subject, from: day, to: day });
                const absent = r && !isPresent(r.status);
                return (
                  <button key={s.id} type="button" onClick={() => setGrading(s)}
                    className={cx("flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 text-left transition hover:border-primary/50", absent && "opacity-60")}>
                    <span className="relative">
                      <Avatar name={s.name} image={s.facePhoto} size={38} />
                      {r && <span className={cx("absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-surface", toneBg(ATT_TONE[r.status]))} />}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">{s.name}</span>
                    <span className="flex gap-1">
                      {gs.map((g) => <GradeBadge key={g.id} value={g.value} type={g.type} comment={g.comment} size={28} />)}
                      {gs.length === 0 && <span className="flex size-7 items-center justify-center rounded-lg border border-dashed border-line text-muted"><Plus size={15} /></span>}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="mt-4 flex justify-end">
              <Link href={`/teacher/classes/${lesson.classId}?subject=${encodeURIComponent(lesson.subject)}`} className={btn.sm}><Star size={16} aria-hidden /> {t("Jurnalni ochish")}</Link>
            </div>
          </>
        )}

        {tab === "homework" && (
          <>
            <div className="flex justify-end">
              <button type="button" className={btn.smPrimary} onClick={() => setHwOpen(true)}><Plus size={16} aria-hidden /> {t("Vazifa berish")}</button>
            </div>
            {homeworks.length === 0 ? (
              <Card className="mt-3"><EmptyState icon={NotebookPen} title={t("Bu fan bo'yicha vazifa yo'q")} /></Card>
            ) : (
              <div className="mt-3 flex flex-col gap-2">
                {homeworks.map((h) => {
                  const subs = app.submissionsOf(h.id);
                  const waiting = subs.filter((x) => x.status === "submitted").length;
                  return (
                    <Link key={h.id} href={`/teacher/homework/${h.id}`} className="rounded-2xl border border-line bg-surface p-4 transition hover:border-primary/50">
                      <div className="flex items-start gap-2">
                        <span className="min-w-0 flex-1 font-semibold">{h.title}</span>
                        {waiting > 0 && <Pill tone="warn">{t("{n} ta tekshirilmagan", { n: waiting })}</Pill>}
                      </div>
                      <div className="mt-0.5 text-sm text-muted">{t("Muddat")}: {fmt.date(h.dueDay)} · {t("Topshirdi")}: {subs.length}/{students.length}{h.attachments.length > 0 && ` · 📎 ${h.attachments.length}`}</div>
                    </Link>
                  );
                })}
              </div>
            )}
            <HomeworkEditor open={hwOpen} onClose={() => setHwOpen(false)} classId={lesson.classId} subject={lesson.subject} />
          </>
        )}
      </PageBody>
      <GradeModal student={grading} subject={lesson.subject} day={day} lessonId={lesson.id} onClose={() => setGrading(null)} />
    </>
  );
}
