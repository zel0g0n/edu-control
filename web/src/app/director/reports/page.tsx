"use client";

import { useMemo, useState } from "react";
import { Download, TriangleAlert } from "lucide-react";
import {
  addDays, addMonths, attendanceByClass, attendanceByDay, attendanceRate, billingTotals, daysBetween, gradeAverages, isoWeekday,
  weightedAverage,
} from "@edunazorat/shared";

import { BarChart, HBars, LineChart } from "@/components/charts";
import { PageBody, PageHeader } from "@/components/shell";
import { Avatar, avgTone, btn, Card, DataTable, EmptyState, gradeTone, Section, Select, toneText } from "@/components/ui";
import { useApp } from "@/lib/data/store";
import { exportXlsx } from "@/lib/export";
import { fmt, termLabel } from "@/lib/format";
import { useT } from "@/lib/i18n/react";

export default function DirectorReports() {
  const app = useApp();
  const t = useT();
  const inst = app.myInstitution!;
  const terms = app.termsOf(inst.id);
  const [period, setPeriod] = useState<string>("30");
  const classes = app.classesOfInstitution(inst.id);
  const students = app.studentsOfInstitution(inst.id);
  const teachers = app.teachersOfInstitution(inst.id);

  const range = useMemo(() => {
    const term = terms.find((x) => x.id === period);
    if (term) return { from: term.startDay, to: term.endDay < app.today ? term.endDay : app.today, label: termLabel(term.name) };
    const n = Number(period);
    return { from: addDays(app.today, -n + 1), to: app.today, label: t("Oxirgi {n} kun", { n }) };
  }, [period, terms, app.today, t]);

  const att = app.db.attendance.filter((a) => a.day >= range.from && a.day <= range.to);
  const grades = app.db.grades.filter((g) => g.day >= range.from && g.day <= range.to && g.type !== "term" && g.type !== "year");
  const days = range.from <= range.to ? daysBetween(range.from, range.to).filter((d) => isoWeekday(d) !== 7) : [];
  const trend = attendanceByDay(days, att);
  const byClass = attendanceByClass(classes, students, att);
  const bySubject = gradeAverages(grades, (g) => g.subject);
  const dist = [5, 4, 3, 2].map((v) => ({ v, n: grades.filter((g) => g.value === v).length }));
  const months = Array.from({ length: 6 }, (_, i) => addMonths(app.currentMonth(), i - 5));
  const allInv = app.invoicesOfInstitution(inst.id);
  const billing = months.map((m) => ({ m, ...billingTotals(allInv.filter((i) => i.month === m)) }));

  // O'qituvchilar faolligi: o'tgan darslardan nechtasida davomat olingan.
  const teacherRows = teachers.map((u) => {
    const ls = app.db.lessons.filter((l) => l.teacherId === u.id);
    let held = 0, marked = 0;
    for (const d of days) for (const l of ls.filter((x) => x.weekday === isoWeekday(d))) {
      held++;
      if (att.some((a) => a.lessonId === l.id && a.day === d)) marked++;
    }
    return { u, held, marked, grades: grades.filter((g) => g.teacherId === u.id).length };
  });

  // E'tibor talab qiladigan o'quvchilar.
  const risk = students.map((s) => {
    const a = attendanceRate(att.filter((r) => r.studentId === s.id));
    const g = weightedAverage(grades.filter((x) => x.studentId === s.id));
    return { s, a, g };
  }).filter((x) => (x.a !== null && x.a < 0.8) || (x.g !== null && x.g < 3.2))
    .sort((a, b) => (a.g ?? 5) - (b.g ?? 5));

  const download = () => {
    void exportXlsx(`${t("Hisobot")}_${range.from}_${range.to}.xlsx`, [
      { name: t("Davomat kunlar"), rows: [[t("Sana"), t("Belgilangan"), t("Davomat %")], ...trend.map((x) => [x.day, x.marked, x.rate === null ? "" : Math.round(x.rate * 1000) / 10])] },
      { name: t("Davomat sinflar"), rows: [[t("Sinf"), t("Belgilangan"), t("Kelgan"), t("Davomat %")], ...byClass.map((c) => [c.className, c.marked, c.present, c.rate === null ? "" : Math.round(c.rate * 1000) / 10])] },
      { name: t("Fanlar"), rows: [[t("Fan"), t("Baholar soni"), t("O'rtacha")], ...bySubject.map((x) => [x.key, x.count, x.avg === null ? "" : Number(x.avg.toFixed(2))])] },
      { name: t("O'qituvchilar"), rows: [[t("O'qituvchi"), t("O'tilgan darslar"), t("Davomat olingan"), t("Qo'yilgan baholar")], ...teacherRows.map((x) => [x.u.name, x.held, x.marked, x.grades])] },
      { name: t("To'lovlar"), rows: [[t("Oy"), t("Reja"), t("Yig'ildi"), t("Qoldiq"), t("Qarzdorlar")], ...billing.map((b) => [b.m, b.total, b.paid, b.remaining, b.debtors])] },
      { name: t("E'tibor"), rows: [[t("O'quvchi"), t("Sinf"), t("Davomat %"), t("O'rtacha")], ...risk.map((x) => [x.s.name, app.schoolClass(x.s.classId)?.name, x.a === null ? "" : Math.round(x.a * 100), x.g === null ? "" : Number(x.g.toFixed(2))])] },
    ]);
  };

  return (
    <>
      <PageHeader title={t("Hisobotlar")} subtitle={`${range.label}: ${fmt.date(range.from)} – ${fmt.date(range.to)}`}
        actions={<button type="button" className={btn.smPrimary} onClick={download}><Download size={15} aria-hidden /> {t("Excel'ga yuklash")}</button>}
        below={
          <Select value={period} onChange={setPeriod} className="h-10 !w-auto min-w-48" aria-label={t("Davr")}>
            <option value="7">{t("Oxirgi {n} kun", { n: 7 })}</option>
            <option value="30">{t("Oxirgi {n} kun", { n: 30 })}</option>
            {terms.filter((x) => x.startDay <= app.today).map((x) => <option key={x.id} value={x.id}>{termLabel(x.name)}</option>)}
          </Select>
        } />
      <PageBody>
        <div className="grid grid-cols-1 gap-x-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Section title={t("Davomat dinamikasi")}>
            <Card className="p-4">
              {trend.some((x) => x.rate !== null) ? (
                <LineChart labels={days.map((d) => fmt.dateShort(d))} labelEvery={Math.max(1, Math.ceil(days.length / 8))} min={0.5} max={1}
                  series={[{ name: t("Davomat"), tone: "primary", values: trend.map((x) => x.rate) }]} format={(v) => `${Math.round(v * 100)}%`} />
              ) : <EmptyState compact icon={TriangleAlert} title={t("Ma'lumot yo'q")} />}
            </Card>
          </Section>
          <Section title={t("Sinflar bo'yicha davomat")}>
            <Card className="p-4">
              <BarChart data={byClass.map((c) => ({ label: c.className, value: (c.rate ?? 0) * 100, display: fmt.percent(c.rate), tone: (c.rate ?? 0) >= 0.9 ? "ok" : (c.rate ?? 0) >= 0.8 ? "warn" : "bad" }))}
                max={100} format={(v) => `${Math.round(v)}%`} target={{ value: 90, label: "90%" }} />
            </Card>
          </Section>
          <Section title={t("Fanlar bo'yicha o'rtacha baho")}>
            <Card className="p-4">
              <HBars data={[...bySubject].sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0)).map((x) => ({ label: x.key, hint: `${x.key}: ${x.count}`, value: x.avg ?? 0, display: x.avg === null ? "—" : fmt.number(x.avg, 2), tone: avgTone(x.avg) }))} max={5} />
            </Card>
          </Section>
          <Section title={t("Baholar taqsimoti")}>
            <Card className="p-4">
              <BarChart data={dist.map((d) => ({ label: String(d.v), value: d.n, display: `${d.n} · ${grades.length ? Math.round((d.n / grades.length) * 100) : 0}%`, tone: gradeTone(d.v) }))} />
            </Card>
          </Section>
          <Section title={t("To'lovlar, 6 oy")}>
            <Card className="p-4">
              <LineChart labels={months.map((m) => fmt.month(m).split(" ")[0].slice(0, 3))} min={0}
                series={[{ name: t("Reja"), tone: "slate", values: billing.map((b) => b.total || null) }, { name: t("Yig'ildi"), tone: "ok", values: billing.map((b) => b.total ? b.paid : null) }]}
                format={(v) => `${fmt.number(v / 1e6, 0)}M`} />
            </Card>
          </Section>
          <Section title={t("O'qituvchilar faolligi")}>
            <DataTable rows={teacherRows} rowKey={(x) => x.u.id} initialSort={{ key: "rate", dir: 1 }}
              columns={[
                { key: "name", header: t("O'qituvchi"), sort: (x) => x.u.name, cell: (x) => <span className="font-medium">{x.u.name}</span> },
                { key: "rate", header: t("Davomat olingan"), align: "right", sort: (x) => (x.held ? x.marked / x.held : 1), cell: (x) => (
                  <span className={toneText(!x.held ? "slate" : x.marked / x.held >= 0.95 ? "ok" : x.marked / x.held >= 0.8 ? "warn" : "bad")}>{x.marked}/{x.held}</span>
                ) },
                { key: "grades", header: t("Baholar"), align: "right", sort: (x) => x.grades, cell: (x) => x.grades },
              ]} />
          </Section>
        </div>
        <Section title={t("E'tibor talab qiladigan o'quvchilar")}>
          <DataTable rows={risk} rowKey={(x) => x.s.id} rowHref={(x) => `/director/students/${x.s.id}`}
            empty={<Card><EmptyState compact icon={TriangleAlert} title={t("Bunday o'quvchi yo'q")} text={t("Davomati 80% dan yoki o'rtacha bahosi 3.2 dan past o'quvchilar shu yerda chiqadi")} /></Card>}
            columns={[
              { key: "name", header: t("O'quvchi"), cell: (x) => <span className="flex items-center gap-2.5"><Avatar name={x.s.name} size={30} /><span className="font-medium">{x.s.name}</span></span> },
              { key: "class", header: t("Sinf"), cell: (x) => app.schoolClass(x.s.classId)?.name },
              { key: "att", header: t("Davomat"), align: "right", cell: (x) => <span className={toneText(x.a !== null && x.a < 0.8 ? "bad" : "slate")}>{fmt.percent(x.a)}</span> },
              { key: "avg", header: t("O'rtacha"), align: "right", cell: (x) => <b className={toneText(avgTone(x.g))}>{x.g === null ? "—" : fmt.number(x.g, 2)}</b> },
            ]} />
        </Section>
      </PageBody>
    </>
  );
}
