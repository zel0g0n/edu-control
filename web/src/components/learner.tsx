"use client";

// Ota-ona va o'quvchi ko'radigan sahifalar (bitta o'quvchi haqida).
import { useMemo, useState } from "react";
import {
  BookOpen, CalendarCheck, CalendarDays, CalendarX2, Check, ChevronLeft, ChevronRight, MessageSquareText, NotebookPen,
  ScanFace, Star, Wallet,
} from "lucide-react";
import {
  addDays, addMonths, atTime, attendanceRate, invoiceRemaining, isOverdue, isoWeekday, monthKey, parseDay,
  suggestTermGrade, weightedAverage, type AttendanceRecord, type Grade, type Homework, type Lesson, type Student, type Term,
} from "@edunazorat/shared";

import { useApp, type AppStore } from "@/lib/data/store";
import { fmt, gradeComment, termLabel, weekdayName, weekdayShort } from "@/lib/format";
import { useT } from "@/lib/i18n/react";
import { Ring, StackBar } from "./charts";
import {
  ATT_TONE, AttendancePill, Avatar, avgTone, Card, Chip, ChipRow, cx, EmptyState, GradeBadge, ListCard, ListRow, Modal, Pill,
  Section, SectionLink, Segmented, StatCard, toneBg, toneSoft, toneText,
} from "./ui";

// ------------------------------------------------------------------ yordamchilar

/** O'quvchining joriy chorak bo'yicha ko'rsatkichlari. */
export function useLearnerStats(app: AppStore, s: Student) {
  const term = app.currentTerm(s.institutionId);
  const from = term?.startDay ?? addDays(app.today, -60);
  const grades = app.gradesOfStudent(s.id, { from, to: app.today });
  const att = app.attendanceOfStudentBetween(s.id, addDays(app.today, -30), app.today);
  const hws = app.homeworkOfClass(s.classId).filter((h) => h.dueDay <= app.today && h.dueDay >= from);
  const done = hws.filter((h) => app.submission(h.id, s.id)).length;
  return { term, avg: weightedAverage(grades), gradeCount: grades.length, rate: attendanceRate(att), hwTotal: hws.length, hwDone: done };
}

function lessonState(app: AppStore, l: Lesson, day: string): "past" | "now" | "next" {
  if (day !== app.today) return day < app.today ? "past" : "next";
  if (app.now >= atTime(day, l.end)) return "past";
  if (app.now >= atTime(day, l.start)) return "now";
  return "next";
}

// ------------------------------------------------------------------ bosh sahifa

export function LearnerHome({ student: s, base, showPayments }: { student: Student; base: string; showPayments: boolean }) {
  const app = useApp();
  const t = useT();
  const stats = useLearnerStats(app, s);
  const cls = app.schoolClass(s.classId);
  const summary = app.daySummary(s.id, app.today);
  const wd = isoWeekday(app.today);
  const lessons = wd === 7 ? [] : app.lessonsOfClassOn(s.classId, wd);
  const recent = app.gradesOfStudent(s.id).slice(0, 6);
  const upcoming = app.homeworkOfClass(s.classId).filter((h) => h.dueDay >= app.today).sort((a, b) => a.dueDay.localeCompare(b.dueDay)).slice(0, 4);
  const debt = showPayments ? app.invoicesOfStudent(s.id).reduce((sum, i) => sum + invoiceRemaining(i), 0) : 0;
  const overdue = showPayments && app.invoicesOfStudent(s.id).some((i) => isOverdue(i, app.today));

  return (
    <>
      {/* Bugungi holat */}
      <Card className="overflow-hidden">
        <div className="flex items-center gap-4 p-4 md:p-5">
          <Avatar name={s.name} image={summary.snapshot ?? s.facePhoto} size={64} ring={summary.status ? ATT_TONE[summary.status] === "ok" ? "ok" : ATT_TONE[summary.status] === "warn" ? "warn" : "bad" : undefined} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-lg font-bold">{s.name}</div>
            <div className="text-sm text-muted">{cls?.name} · {app.institution(s.institutionId)?.name}</div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {summary.status ? (
                <>
                  <AttendancePill status={summary.status} />
                  {summary.arrivedAt && <span className="tabular text-sm text-muted">{t("Kelgan vaqti")}: <b className="text-ink">{fmt.time(summary.arrivedAt)}</b></span>}
                  {summary.viaFace && <Pill tone="primary" icon={ScanFace}>{t("Yuz orqali")}</Pill>}
                </>
              ) : (
                <span className="text-sm text-muted">{lessons.length ? t("Bugun hali davomat olinmagan") : t("Bugun dars yo'q")}</span>
              )}
            </div>
          </div>
        </div>
        {summary.snapshot && (
          <p className="border-t border-line bg-surface-2/50 px-4 py-2 text-xs text-muted md:px-5">
            {t("Rasm o'qituvchi kamerasidagi jonli kuzatuvdan olingan, faqat farzandingiz yuzi. Video yozilmaydi.")}
          </p>
        )}
      </Card>

      <div className={cx("mt-3 grid grid-cols-2 gap-3", showPayments ? "md:grid-cols-4" : "md:grid-cols-3")}>
        <StatCard label={t("O'rtacha baho")} value={stats.avg === null ? "—" : fmt.number(stats.avg)} icon={Star} tone={avgTone(stats.avg)}
          caption={stats.term ? t("{term}, {n} ta baho", { term: termLabel(stats.term.name), n: stats.gradeCount }) : undefined} href={`${base}/grades`} />
        <StatCard label={t("Davomat")} value={fmt.percent(stats.rate)} icon={CalendarCheck} tone={stats.rate === null ? "slate" : stats.rate >= 0.9 ? "ok" : stats.rate >= 0.75 ? "warn" : "bad"}
          caption={t("Oxirgi 30 kun, darslar bo'yicha")} href={`${base}/attendance`} />
        <StatCard label={t("Vazifalar")} value={`${stats.hwDone}/${stats.hwTotal}`} icon={NotebookPen} tone={stats.hwTotal && stats.hwDone / stats.hwTotal < 0.7 ? "warn" : "primary"}
          caption={t("Muddati o'tganlardan topshirilgan")} href={`${base}/homework`} />
        {showPayments && (
          <StatCard label={t("Qarzdorlik")} value={debt ? fmt.moneyShort(debt) : t("Yo'q")} icon={Wallet} tone={overdue ? "bad" : debt ? "warn" : "ok"}
            caption={overdue ? t("Muddati o'tgan") : debt ? t("Joriy oy") : t("Hammasi to'langan")} href={`${base}/payments`} />
        )}
      </div>

      <div className="grid grid-cols-1 gap-x-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <Section title={t("Bugungi darslar")} action={<SectionLink href={`${base}/schedule`}>{t("Jadval")}</SectionLink>}>
          {lessons.length === 0 ? (
            <Card><EmptyState compact icon={CalendarDays} title={t("Bugun dars yo'q")} /></Card>
          ) : (
            <LessonTimeline student={s} day={app.today} lessons={lessons} />
          )}
        </Section>

        <div>
          <Section title={t("Yaqin vazifalar")} action={<SectionLink href={`${base}/homework`}>{t("Barchasi")}</SectionLink>}>
            {upcoming.length === 0 ? (
              <Card><EmptyState compact icon={NotebookPen} title={t("Yaqin kunlarga vazifa yo'q")} /></Card>
            ) : (
              <ListCard>
                {upcoming.map((h) => <HomeworkRow key={h.id} hw={h} student={s} href={`${base}/homework${base === "/student" ? `/${h.id}` : `?hw=${h.id}`}`} />)}
              </ListCard>
            )}
          </Section>
          <Section title={t("So'nggi baholar")} action={<SectionLink href={`${base}/grades`}>{t("Barchasi")}</SectionLink>}>
            {recent.length === 0 ? (
              <Card><EmptyState compact icon={Star} title={t("Hali baho yo'q")} /></Card>
            ) : (
              <ListCard>{recent.map((g) => <GradeRow key={g.id} grade={g} />)}</ListCard>
            )}
          </Section>
        </div>
      </div>
    </>
  );
}

/** Kun darslari: vaqt chizig'i, har bir dars uchun davomat va baho. */
export function LessonTimeline({ student: s, day, lessons }: { student: Student; day: string; lessons: Lesson[] }) {
  const app = useApp();
  const t = useT();
  const grades = app.gradesOfStudent(s.id, { from: day, to: day });
  return (
    <ol className="relative flex flex-col gap-2">
      {lessons.map((l) => {
        const rec = app.attendanceRecord(s.id, l.id, day);
        const st = lessonState(app, l, day);
        const lg = grades.filter((g) => g.lessonId === l.id || (!g.lessonId && g.subject === l.subject));
        const teacher = app.userById(l.teacherId);
        return (
          <li key={l.id}>
            <Card className={cx("flex items-center gap-3 p-3 pr-4", st === "now" && "border-primary ring-2 ring-primary/15")}>
              <div className={cx("tabular flex w-14 shrink-0 flex-col items-center rounded-xl py-1.5 text-center", st === "now" ? "bg-primary text-white dark:text-nav" : "bg-surface-2")}>
                <span className="text-[13px] font-bold">{l.start}</span>
                <span className={cx("text-[11px]", st === "now" ? "opacity-80" : "text-muted")}>{l.end}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-semibold">{l.subject}</span>
                  {st === "now" && <Pill tone="primary">{t("Hozir")}</Pill>}
                </div>
                <div className="truncate text-[13px] text-muted">{teacher?.name} · {t("{room}-xona", { room: l.room })}</div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {lg.map((g) => <GradeBadge key={g.id} value={g.value} type={g.type} comment={g.comment} size={30} />)}
                {rec ? (
                  <>
                    {rec.snapshot && <Avatar name={s.name} image={rec.snapshot} size={30} />}
                    <AttendancePill status={rec.status} />
                  </>
                ) : (
                  st !== "next" && <span className="text-xs text-muted">{t("belgilanmagan")}</span>
                )}
              </div>
            </Card>
          </li>
        );
      })}
    </ol>
  );
}

export function GradeRow({ grade: g, onClick }: { grade: Grade; onClick?: () => void }) {
  const app = useApp();
  const t = useT();
  return (
    <ListRow
      onClick={onClick}
      leading={<GradeBadge value={g.value} type={g.type} />}
      title={<span className="flex items-center gap-2">{g.subject}<span className={cx("text-xs font-medium", g.type === "control" ? "text-margin" : "text-muted")}>{t(`grade.type.${g.type}`)}</span></span>}
      subtitle={g.comment ? <span className="flex items-center gap-1"><MessageSquareText size={13} aria-hidden className="shrink-0" />{gradeComment(g.comment)}</span> : app.userById(g.teacherId)?.name}
      trailing={<span className="tabular shrink-0 text-xs text-muted">{fmt.date(g.day)}</span>}
    />
  );
}

// ------------------------------------------------------------------ baholar

export function LearnerGrades({ student: s }: { student: Student }) {
  const app = useApp();
  const t = useT();
  const terms = app.termsOf(s.institutionId);
  const [termId, setTermId] = useState<string>(() => app.currentTerm(s.institutionId)?.id ?? "all");
  const [detail, setDetail] = useState<Grade | null>(null);
  const term = terms.find((x) => x.id === termId);
  const subjects = app.subjectsOfClass(s.classId);
  const range = term ? { from: term.startDay, to: term.endDay } : {};

  const rows = subjects.map((subject) => {
    const gs = app.gradesOfStudent(s.id, { subject, ...range }).reverse();
    const avg = weightedAverage(gs);
    const final = term ? app.finalGrade(s.id, subject, term.id) : undefined;
    return { subject, grades: gs, avg, final };
  });
  const yearGrades = terms.length ? subjects.map((subject) => ({ subject, g: app.finalGrade(s.id, subject, terms[terms.length - 1].id, "year") })).filter((x) => x.g) : [];
  const allAvg = weightedAverage(rows.flatMap((r) => r.grades));

  return (
    <>
      <ChipRow>
        {terms.map((x) => <Chip key={x.id} selected={termId === x.id} onClick={() => setTermId(x.id)}>{termLabel(x.name)}</Chip>)}
        <Chip selected={termId === "all"} onClick={() => setTermId("all")}>{t("Butun yil")}</Chip>
      </ChipRow>

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border border-line bg-surface px-4 py-3">
        <span className="text-sm text-muted">{t("Umumiy o'rtacha")}: <b className={cx("tabular text-base", toneText(avgTone(allAvg)))}>{allAvg === null ? "—" : fmt.number(allAvg, 2)}</b></span>
        {term && <span className="tabular text-sm text-muted">{fmt.date(term.startDay)} – {fmt.date(term.endDay)}</span>}
        <span className="flex items-center gap-3 text-xs text-muted">
          <span className="flex items-center gap-1"><span className="size-3 rounded bg-ok" />{t("nazorat ishi (×2)")}</span>
          <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-margin" />{t("izoh bor")}</span>
        </span>
      </div>

      {/* Kompyuter: jurnal ko'rinishi */}
      <div className="scroll-x mt-4 hidden rounded-2xl border border-line bg-surface md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="margin-rule border-b border-line text-left text-[12px] font-semibold tracking-wide text-muted uppercase">
              <th className="py-3 pr-4 pl-9">{t("Fan")}</th>
              <th className="px-4 py-3">{t("Baholar")}</th>
              <th className="px-4 py-3 text-right">{t("O'rtacha")}</th>
              {term && <th className="px-4 py-3 text-center">{t("Chorak")}</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.subject} className="margin-rule border-b border-line last:border-0">
                <td className="py-3 pr-4 pl-9 font-semibold whitespace-nowrap">{r.subject}</td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap gap-1.5">
                    {r.grades.length === 0 && <span className="text-muted">—</span>}
                    {r.grades.map((g) => (
                      <button key={g.id} type="button" onClick={() => setDetail(g)} aria-label={`${g.value}, ${t(`grade.type.${g.type}`)}, ${fmt.date(g.day)}`}>
                        <GradeBadge value={g.value} type={g.type} comment={g.comment} size={30} title={`${fmt.date(g.day)} · ${t(`grade.type.${g.type}`)}${g.comment ? ` · ${gradeComment(g.comment)}` : ""}`} />
                      </button>
                    ))}
                  </div>
                </td>
                <td className={cx("tabular px-4 py-3 text-right font-bold", toneText(avgTone(r.avg)))}>{r.avg === null ? "—" : fmt.number(r.avg, 2)}</td>
                {term && (
                  <td className="px-4 py-2 text-center">
                    {r.final ? <GradeBadge value={r.final.value} type="term" size={32} /> : <span className="text-xs text-muted">{suggestTermGrade(r.avg) ? t("≈{v}", { v: suggestTermGrade(r.avg)! }) : "—"}</span>}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Telefon: fanlar kartochkalari */}
      <div className="mt-4 flex flex-col gap-2.5 md:hidden">
        {rows.map((r) => (
          <Card key={r.subject} className="p-3.5">
            <div className="flex items-center gap-2">
              <span className="flex-1 font-semibold">{r.subject}</span>
              <span className={cx("tabular text-sm font-bold", toneText(avgTone(r.avg)))}>{r.avg === null ? "—" : fmt.number(r.avg, 2)}</span>
              {r.final && <GradeBadge value={r.final.value} type="term" size={28} title={t("Chorak bahosi")} />}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {r.grades.length === 0 && <span className="text-sm text-muted">{t("Baho yo'q")}</span>}
              {r.grades.map((g) => (
                <button key={g.id} type="button" onClick={() => setDetail(g)}>
                  <GradeBadge value={g.value} type={g.type} comment={g.comment} size={30} />
                </button>
              ))}
            </div>
          </Card>
        ))}
      </div>

      {yearGrades.length > 0 && (
        <Section title={t("Yillik baholar")}>
          <div className="flex flex-wrap gap-2">
            {yearGrades.map((x) => (
              <Card key={x.subject} className="flex items-center gap-2 px-3 py-2">
                <span className="text-sm font-medium">{x.subject}</span>
                <GradeBadge value={x.g!.value} type="year" size={28} />
              </Card>
            ))}
          </div>
        </Section>
      )}

      <GradeDetail grade={detail} onClose={() => setDetail(null)} />
    </>
  );
}

export function GradeDetail({ grade: g, onClose }: { grade: Grade | null; onClose: () => void }) {
  const app = useApp();
  const t = useT();
  return (
    <Modal open={!!g} onClose={onClose} title={g?.subject}>
      {g && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <GradeBadge value={g.value} type={g.type} size={56} />
            <div>
              <div className="font-semibold">{t(`grade.type.${g.type}`)}{g.type === "control" && <span className="ml-1.5 text-xs text-muted">{t("(ikki baravar hisoblanadi)")}</span>}</div>
              <div className="text-sm text-muted">{fmt.weekday(g.day)}, {fmt.dateFull(g.day)}</div>
              <div className="text-sm text-muted">{app.userById(g.teacherId)?.name}</div>
            </div>
          </div>
          {g.comment && (
            <div className="rounded-xl bg-surface-2 px-4 py-3 text-[15px]">
              <div className="mb-1 text-xs font-semibold text-muted">{t("O'qituvchi izohi")}</div>
              {gradeComment(g.comment)}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

// ------------------------------------------------------------------ davomat

export function LearnerAttendance({ student: s }: { student: Student }) {
  const app = useApp();
  const t = useT();
  const [month, setMonth] = useState(() => monthKey(app.now));
  const [day, setDay] = useState<string>(app.today);
  const first = parseDay(`${month}-01`);
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const offset = isoWeekday(`${month}-01`) - 1;
  const days = Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
  const records = app.attendanceOfStudentBetween(s.id, days[0], days[days.length - 1]);
  const count = (st: AttendanceRecord["status"]) => records.filter((r) => r.status === st).length;
  const rate = attendanceRate(records);
  const dayLessons = app.lessonsOfClassOn(s.classId, isoWeekday(day));

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <div>
        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <button type="button" className="inline-flex size-9 items-center justify-center rounded-full hover:bg-surface-2" onClick={() => setMonth(addMonths(month, -1))} aria-label={t("Oldingi oy")}><ChevronLeft size={20} /></button>
            <span className="flex-1 text-center font-semibold">{fmt.month(month)}</span>
            <button type="button" className="inline-flex size-9 items-center justify-center rounded-full hover:bg-surface-2 disabled:opacity-30" disabled={month >= monthKey(app.now)} onClick={() => setMonth(addMonths(month, 1))} aria-label={t("Keyingi oy")}><ChevronRight size={20} /></button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-muted">
            {[1, 2, 3, 4, 5, 6, 7].map((w) => <span key={w}>{weekdayShort(w)}</span>)}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {Array.from({ length: offset }, (_, i) => <span key={`e${i}`} />)}
            {days.map((d) => {
              const sum = app.daySummary(s.id, d);
              const future = d > app.today;
              const sunday = isoWeekday(d) === 7;
              const tone = sum.status ? (sum.absentLessons > 0 && sum.presentLessons > 0 ? "warn" : ATT_TONE[sum.status]) : null;
              return (
                <button key={d} type="button" disabled={future} onClick={() => setDay(d)} aria-pressed={day === d}
                  aria-label={`${fmt.date(d)}${sum.status ? `: ${t(`att.${sum.status}`)}` : ""}`}
                  className={cx(
                    "tabular relative flex aspect-square flex-col items-center justify-center rounded-lg text-[13px] transition",
                    day === d ? "ring-2 ring-primary" : "",
                    tone ? toneSoft(tone) : sunday ? "text-muted/50" : future ? "text-muted/40" : "hover:bg-surface-2",
                    d === app.today && "font-bold",
                  )}>
                  {Number(d.slice(8))}
                  {tone && <span className={cx("absolute bottom-1 size-1 rounded-full", toneBg(tone))} />}
                </button>
              );
            })}
          </div>
        </Card>
        <Card className="mt-3 p-4">
          <div className="flex items-center gap-4">
            <Ring value={rate} tone={rate === null ? "slate" : rate >= 0.9 ? "ok" : rate >= 0.75 ? "warn" : "bad"} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">{t("Oy bo'yicha, darslar soni")}</div>
              <StackBar className="mt-2" parts={[
                { value: count("present"), tone: "ok", label: t("att.present") },
                { value: count("late"), tone: "warn", label: t("att.late") },
                { value: count("excused"), tone: "slate", label: t("att.excused") },
                { value: count("absent"), tone: "bad", label: t("att.absent") },
              ]} />
            </div>
          </div>
          <dl className="mt-3 grid grid-cols-4 gap-2 text-center">
            {(["present", "late", "excused", "absent"] as const).map((st) => (
              <div key={st}>
                <dt className="text-[11px] text-muted">{t(`att.${st}`)}</dt>
                <dd className={cx("tabular text-lg font-bold", toneText(ATT_TONE[st]))}>{count(st)}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>

      <div>
        <h2 className="mb-2.5 px-1 text-[15px] font-bold">{fmt.weekday(day)}, {fmt.dateFull(day)}</h2>
        {dayLessons.length === 0 ? (
          <Card><EmptyState compact icon={CalendarX2} title={t("Bu kunda dars yo'q")} /></Card>
        ) : (
          <LessonTimeline student={s} day={day} lessons={dayLessons} />
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ jadval

export function WeekSchedule({ classId, highlightTeacherId }: { classId: string; highlightTeacherId?: string }) {
  const app = useApp();
  const t = useT();
  const today = isoWeekday(app.today);
  const [wd, setWd] = useState(today === 7 ? 1 : today);
  const lessons = app.lessonsOfClass(classId);
  const days = [1, 2, 3, 4, 5, 6].filter((d) => lessons.some((l) => l.weekday === d) || d <= 5);

  const cell = (l: Lesson) => {
    const now = l.weekday === today && lessonState(app, l, app.today) === "now";
    return (
      <div key={l.id} className={cx("rounded-xl border px-3 py-2", now ? "border-primary bg-primary-soft" : "border-line bg-surface",
        highlightTeacherId && l.teacherId === highlightTeacherId && "border-l-4 border-l-margin")}>
        <div className="tabular text-xs text-muted">{l.start}–{l.end} · {l.room}</div>
        <div className="truncate font-semibold">{l.subject}</div>
        <div className="truncate text-xs text-muted">{app.userById(l.teacherId)?.name}</div>
      </div>
    );
  };

  if (lessons.length === 0) return <Card><EmptyState icon={CalendarDays} title={t("Dars jadvali hali tuzilmagan")} /></Card>;

  return (
    <>
      <div className="md:hidden">
        <ChipRow>
          {days.map((d) => <Chip key={d} selected={wd === d} onClick={() => setWd(d)}>{weekdayShort(d)}{d === today ? " •" : ""}</Chip>)}
        </ChipRow>
        <h2 className="mt-4 mb-2 px-1 font-bold">{weekdayName(wd)}</h2>
        <div className="flex flex-col gap-2">
          {lessons.filter((l) => l.weekday === wd).map(cell)}
          {!lessons.some((l) => l.weekday === wd) && <Card><EmptyState compact icon={CalendarDays} title={t("Dars yo'q")} /></Card>}
        </div>
      </div>
      <div className="hidden gap-3 md:grid" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
        {days.map((d) => (
          <div key={d} className="min-w-0">
            <div className={cx("mb-2 rounded-lg px-2 py-1.5 text-center text-sm font-semibold", d === today ? "bg-ink text-bg" : "text-muted")}>{weekdayName(d)}</div>
            <div className="flex flex-col gap-2">{lessons.filter((l) => l.weekday === d).map(cell)}</div>
          </div>
        ))}
      </div>
    </>
  );
}

// ------------------------------------------------------------------ vazifalar

export function homeworkStatus(app: AppStore, h: Homework, studentId: string) {
  const sub = app.submission(h.id, studentId);
  if (sub) return { sub, tone: sub.status === "checked" ? "ok" as const : sub.status === "returned" ? "bad" as const : "info" as const, key: `sub.${sub.status}` };
  if (h.dueDay < app.today) return { sub, tone: "bad" as const, key: "Topshirilmagan" };
  return { sub, tone: "slate" as const, key: "Bajarilmagan" };
}

export function HomeworkRow({ hw: h, student: s, href, onClick }: { hw: Homework; student: Student; href?: string; onClick?: () => void }) {
  const app = useApp();
  const t = useT();
  const st = homeworkStatus(app, h, s.id);
  const dueTone = h.dueDay === app.today ? "text-margin font-semibold" : h.dueDay === addDays(app.today, 1) ? "text-warn" : "text-muted";
  return (
    <ListRow
      href={href}
      onClick={onClick}
      leading={<span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-ink"><BookOpen size={19} aria-hidden /></span>}
      title={h.title}
      subtitle={<span>{h.subject} · <span className={dueTone}>{h.dueDay === app.today ? t("bugun") : h.dueDay === addDays(app.today, 1) ? t("ertaga") : fmt.date(h.dueDay)}</span>{h.attachments.length > 0 && ` · 📎 ${h.attachments.length}`}</span>}
      trailing={
        <span className="flex shrink-0 items-center gap-1.5">
          {st.sub?.grade && <GradeBadge value={st.sub.grade} size={28} />}
          <Pill tone={st.tone}>{t(st.key)}</Pill>
        </span>
      }
    />
  );
}

export function LearnerHomeworkList({ student: s, hrefFor, onOpen }: { student: Student; hrefFor?: (h: Homework) => string; onOpen?: (h: Homework) => void }) {
  const app = useApp();
  const t = useT();
  const [tab, setTab] = useState<"current" | "past">("current");
  const [subject, setSubject] = useState<string | null>(null);
  const all = app.homeworkOfClass(s.classId).filter((h) => !subject || h.subject === subject);
  const list = tab === "current"
    ? all.filter((h) => h.dueDay >= app.today).sort((a, b) => a.dueDay.localeCompare(b.dueDay))
    : all.filter((h) => h.dueDay < app.today);
  const subjects = [...new Set(app.homeworkOfClass(s.classId).map((h) => h.subject))].sort();
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Segmented value={tab} onChange={setTab} options={[{ value: "current", label: t("Joriy") }, { value: "past", label: t("O'tgan") }]} />
      </div>
      <div className="mt-3">
        <ChipRow>
          <Chip selected={!subject} onClick={() => setSubject(null)}>{t("Barcha fanlar")}</Chip>
          {subjects.map((x) => <Chip key={x} selected={subject === x} onClick={() => setSubject(x)}>{x}</Chip>)}
        </ChipRow>
      </div>
      <div className="mt-3">
        {list.length === 0 ? (
          <Card><EmptyState icon={Check} title={tab === "current" ? t("Joriy vazifa yo'q") : t("O'tgan vazifalar yo'q")} /></Card>
        ) : (
          <ListCard>
            {list.map((h) => <HomeworkRow key={h.id} hw={h} student={s} href={hrefFor?.(h)} onClick={onOpen ? () => onOpen(h) : undefined} />)}
          </ListCard>
        )}
      </div>
    </>
  );
}

// ------------------------------------------------------------------ chorak tanlash

export function useTermRange(app: AppStore, institutionId: string) {
  const terms = app.termsOf(institutionId);
  const [termId, setTermId] = useState(() => app.currentTerm(institutionId)?.id ?? "");
  const term: Term | undefined = terms.find((x) => x.id === termId);
  return { terms, term, termId, setTermId };
}

export function useDaysBack(app: AppStore, n: number): string[] {
  const today = app.today;
  return useMemo(() => Array.from({ length: n }, (_, i) => addDays(today, i - n + 1)), [today, n]);
}

