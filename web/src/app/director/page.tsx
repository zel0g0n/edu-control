"use client";

import { AlertTriangle, CalendarCheck, GraduationCap, Wallet } from "lucide-react";
import {
  addDays, atTime, attendanceByClass, attendanceByDay, billingTotals, invoiceRemaining, isOverdue, isPresent, isoWeekday,
} from "@edunazorat/shared";

import { BarChart, LineChart } from "@/components/charts";
import { PageBody, PageHeader } from "@/components/shell";
import { Avatar, Card, EmptyState, ListCard, ListRow, Pill, ProgressBar, Section, SectionLink, StatCard } from "@/components/ui";
import { useApp } from "@/lib/data/store";
import { fmt } from "@/lib/format";
import { useT } from "@/lib/i18n/react";

export default function DirectorHome() {
  const app = useApp();
  const t = useT();
  const inst = app.myInstitution!;
  const students = app.studentsOfInstitution(inst.id);
  const classes = app.classesOfInstitution(inst.id);
  const teachers = app.teachersOfInstitution(inst.id);
  const today = app.today;
  const wd = isoWeekday(today);
  const late = inst.settings.lateAfterMinutes;

  // Bugun: kamida bitta darsda belgilangan o'quvchilar.
  const todayRecs = app.db.attendance.filter((a) => a.day === today);
  const seen = new Map<string, boolean>();
  for (const r of todayRecs) seen.set(r.studentId, (seen.get(r.studentId) ?? false) || isPresent(r.status));
  const presentToday = [...seen.values()].filter(Boolean).length;

  // Boshlanganiga ancha bo'lgan, lekin davomat olinmagan darslar.
  const missing = wd === 7 ? [] : classes.flatMap((c) => app.lessonsOfClassOn(c.id, wd)
    .filter((l) => app.now > atTime(today, l.start) + late * 60000)
    .filter((l) => app.attendanceOfLesson(l.id, today).length < app.studentsOfClass(c.id).length)
    .map((l) => ({ l, c }))).sort((a, b) => a.l.start.localeCompare(b.l.start));

  const month = app.currentMonth();
  const monthInv = app.invoicesOfInstitution(inst.id).filter((i) => i.month === month);
  const bill = billingTotals(monthInv);
  const debtors = students
    .map((s) => ({ s, debt: app.invoicesOfStudent(s.id).reduce((x, i) => x + invoiceRemaining(i), 0), overdue: app.invoicesOfStudent(s.id).some((i) => isOverdue(i, today)) }))
    .filter((x) => x.debt > 0)
    .sort((a, b) => Number(b.overdue) - Number(a.overdue) || b.debt - a.debt);

  const days: string[] = [];
  for (let d = today; days.length < 14; d = addDays(d, -1)) if (isoWeekday(d) !== 7) days.unshift(d);
  const trend = attendanceByDay(days, app.db.attendance);
  const byClass = attendanceByClass(classes, students, app.db.attendance.filter((a) => a.day >= addDays(today, -30)));

  return (
    <>
      <PageHeader title={inst.name} subtitle={`${fmt.weekday(today)}, ${fmt.dateFull(today)}`} />
      <PageBody>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label={t("O'quvchilar")} value={String(students.length)} icon={GraduationCap} caption={t("{c} sinf, {t} o'qituvchi", { c: classes.length, t: teachers.length })} href="/director/students" />
          <StatCard label={t("Bugun kelgan")} value={seen.size ? `${presentToday}/${seen.size}` : "—"} icon={CalendarCheck}
            tone={seen.size && presentToday / seen.size < 0.85 ? "warn" : "ok"} caption={seen.size ? fmt.percent(presentToday / seen.size) : t("Hali davomat yo'q")} />
          <StatCard label={t("{m}: yig'ildi", { m: fmt.month(month) })} value={fmt.moneyShort(bill.paid)} icon={Wallet} tone="ok"
            caption={t("Reja: {v}", { v: fmt.moneyShort(bill.total) })} href="/director/payments" />
          <StatCard label={t("Qarzdorlar")} value={String(debtors.length)} icon={AlertTriangle} tone={debtors.some((d) => d.overdue) ? "bad" : debtors.length ? "warn" : "ok"}
            caption={t("Jami: {v}", { v: fmt.moneyShort(debtors.reduce((s, d) => s + d.debt, 0)) })} href="/director/payments" />
        </div>
        {bill.total > 0 && (
          <div className="mt-3 px-1">
            <ProgressBar value={bill.paid / bill.total} tone="ok" />
            <div className="tabular mt-1 text-xs text-muted">{t("Oylik to'lovlar: {p} yig'ildi", { p: fmt.percent(bill.paid / bill.total) })}</div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-x-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div>
            <Section title={t("Davomat, oxirgi 14 o'quv kuni")} action={<SectionLink href="/director/reports">{t("Hisobotlar")}</SectionLink>}>
              <Card className="p-4">
                <LineChart labels={days.map((d) => fmt.dateShort(d))} labelEvery={2} min={0.5} max={1}
                  series={[{ name: t("Davomat"), tone: "primary", values: trend.map((x) => x.rate) }]} format={(v) => `${Math.round(v * 100)}%`} />
              </Card>
            </Section>
            <Section title={t("Sinflar bo'yicha (30 kun)")}>
              <Card className="p-4">
                <BarChart data={byClass.map((c) => ({ label: c.className, value: (c.rate ?? 0) * 100, display: fmt.percent(c.rate), tone: (c.rate ?? 0) >= 0.9 ? "ok" : (c.rate ?? 0) >= 0.8 ? "warn" : "bad" }))}
                  max={100} format={(v) => `${Math.round(v)}%`} target={{ value: 90, label: "90%" }} height={200} />
              </Card>
            </Section>
          </div>
          <div>
            <Section title={t("Davomat olinmagan darslar")}>
              {missing.length === 0 ? (
                <Card><EmptyState compact icon={CalendarCheck} title={t("Hammasi joyida")} text={t("Boshlangan barcha darslarda davomat olingan")} /></Card>
              ) : (
                <ListCard>
                  {missing.map(({ l, c }) => (
                    <ListRow key={l.id} href={`/director/classes/${c.id}`}
                      leading={<span className="tabular flex size-11 shrink-0 items-center justify-center rounded-xl bg-warn/12 text-[13px] font-bold text-warn">{l.start}</span>}
                      title={`${c.name} · ${l.subject}`}
                      subtitle={app.userById(l.teacherId)?.name}
                      trailing={<Pill tone="warn">{app.attendanceOfLesson(l.id, today).length}/{app.studentsOfClass(c.id).length}</Pill>} />
                  ))}
                </ListCard>
              )}
            </Section>
            <Section title={t("Qarzdorlar")} action={<SectionLink href="/director/payments">{t("Barchasi")}</SectionLink>}>
              {debtors.length === 0 ? (
                <Card><EmptyState compact icon={Wallet} title={t("Qarzdor yo'q")} /></Card>
              ) : (
                <ListCard>
                  {debtors.slice(0, 6).map(({ s, debt, overdue }) => (
                    <ListRow key={s.id} href={`/director/students/${s.id}`}
                      leading={<Avatar name={s.name} size={36} />}
                      title={s.name} subtitle={app.schoolClass(s.classId)?.name}
                      trailing={<span className="flex shrink-0 flex-col items-end"><span className="tabular text-sm font-semibold">{fmt.moneyShort(debt)}</span>{overdue && <span className="text-xs text-bad">{t("muddati o'tgan")}</span>}</span>} />
                  ))}
                </ListCard>
              )}
            </Section>
          </div>
        </div>
      </PageBody>
    </>
  );
}
