"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarX2, ChevronLeft, ChevronRight, ClipboardCheck, ListChecks, MessagesSquare, NotebookPen, ScanFace, Users } from "lucide-react";
import { addDays, atTime, isPresent, isoWeekday } from "@edunazorat/shared";

import { PageBody, PageHeader } from "@/components/shell";
import { btn, Card, cx, EmptyState, Pill, ProgressBar, Section, StatCard } from "@/components/ui";
import { useApp } from "@/lib/data/store";
import { fmt } from "@/lib/format";
import { useT } from "@/lib/i18n/react";

export default function TeacherToday() {
  const app = useApp();
  const t = useT();
  const me = app.currentUser!;
  const [day, setDay] = useState(app.today);
  const wd = isoWeekday(day);
  const lessons = wd === 7 ? [] : app.lessonsOfTeacherOn(me.id, wd);
  const pending = app.homeworkOfTeacher(me.id).reduce((s, h) => s + app.submissionsOf(h.id).filter((x) => x.status === "submitted").length, 0);
  const unread = app.unreadMessages(me.id);
  const studentsTotal = app.classesOfTeacher(me.id).reduce((s, c) => s + app.studentsOfClass(c.id).length, 0);
  const isToday = day === app.today;

  return (
    <>
      <PageHeader title={t("Salom, {name}", { name: me.name.split(" ")[0] })} subtitle={`${fmt.weekday(app.today)}, ${fmt.dateFull(app.today)} · ${me.subjects.join(", ")}`} />
      <PageBody>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <StatCard label={t("Bugungi darslar")} value={String(wd === 7 || !isToday ? app.lessonsOfTeacherOn(me.id, isoWeekday(app.today)).length : lessons.length)} icon={ClipboardCheck} caption={t("{n} nafar o'quvchi", { n: studentsTotal })} />
          <StatCard label={t("Tekshirilmagan vazifalar")} value={String(pending)} icon={NotebookPen} tone={pending ? "warn" : "ok"} href="/teacher/homework" />
          <div className="col-span-2 md:col-span-1">
            <StatCard label={t("O'qilmagan xabarlar")} value={String(unread)} icon={MessagesSquare} tone={unread ? "bad" : "slate"} href="/teacher/messages" />
          </div>
        </div>

        <Section
          title={isToday ? t("Bugungi darslar") : `${fmt.weekday(day)}, ${fmt.date(day)}`}
          action={
            <div className="flex items-center gap-1">
              <button type="button" className={btn.icon} onClick={() => setDay(addDays(day, -1))} aria-label={t("Oldingi kun")}><ChevronLeft size={20} /></button>
              {!isToday && <button type="button" className={btn.ghost} onClick={() => setDay(app.today)}>{t("Bugun")}</button>}
              <button type="button" className={btn.icon} onClick={() => setDay(addDays(day, 1))} disabled={day >= app.today} aria-label={t("Keyingi kun")}><ChevronRight size={20} /></button>
            </div>
          }
        >
          {lessons.length === 0 ? (
            <Card><EmptyState icon={CalendarX2} title={t("Bu kunda darsingiz yo'q")} /></Card>
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              {lessons.map((l) => {
                const cls = app.schoolClass(l.classId);
                const students = app.studentsOfClass(l.classId);
                const recs = app.attendanceOfLesson(l.id, day);
                const present = recs.filter((r) => isPresent(r.status)).length;
                const now = isToday && app.now >= atTime(day, l.start) && app.now < atTime(day, l.end);
                const done = recs.length >= students.length && students.length > 0;
                const grades = app.gradesOfLesson(l.id, day).length;
                const q = isToday ? "" : `?day=${day}`;
                return (
                  <Card key={l.id} className={cx("flex flex-col p-4", now && "border-primary ring-2 ring-primary/15")}>
                    <Link href={`/teacher/lesson/${l.id}${q}`} className="group flex items-start gap-3">
                      <div className={cx("tabular flex w-14 shrink-0 flex-col items-center rounded-xl py-1.5", now ? "bg-primary text-white dark:text-nav" : "bg-surface-2")}>
                        <span className="text-[13px] font-bold">{l.start}</span>
                        <span className={cx("text-[11px]", now ? "opacity-80" : "text-muted")}>{l.end}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-bold group-hover:underline">{cls?.name}</span>
                          {now && <Pill tone="primary">{t("Hozir")}</Pill>}
                        </div>
                        <div className="text-sm text-muted">{l.subject} · {t("{room}-xona", { room: l.room })}</div>
                      </div>
                      {done ? <Pill tone="ok">{present}/{students.length}</Pill> : recs.length ? <Pill tone="warn">{recs.length}/{students.length}</Pill> : <Pill tone="slate">{t("olinmagan")}</Pill>}
                    </Link>
                    <ProgressBar className="mt-3" value={students.length ? recs.length / students.length : 0} tone={done ? "ok" : "warn"} />
                    <div className="mt-1.5 flex items-center gap-3 text-xs text-muted">
                      <span className="flex items-center gap-1"><Users size={13} aria-hidden />{t("Davomat")}: {recs.length}/{students.length}</span>
                      <span>{t("Baholar")}: {grades}</span>
                    </div>
                    <div className={cx("mt-3 grid gap-2", isToday ? "grid-cols-2" : "grid-cols-1")}>
                      {isToday && <Link href={`/teacher/lesson/${l.id}/camera`} className={cx(btn.primary, "h-10 text-sm")}><ScanFace size={17} aria-hidden /> {t("Kamera")}</Link>}
                      <Link href={`/teacher/lesson/${l.id}/rollcall${q}`} className={cx(btn.tonal, "h-10 text-sm")}><ListChecks size={17} aria-hidden /> {t("Yo'qlama")}</Link>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </Section>
      </PageBody>
    </>
  );
}
