"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, GraduationCap, Plus, ScanFace, ShieldOff } from "lucide-react";
import { addDays, attendanceRate, invoiceRemaining, weightedAverage } from "@edunazorat/shared";

import { StudentForm } from "@/components/director/forms";
import { PageBody, PageHeader } from "@/components/shell";
import { Avatar, avgTone, btn, Card, DataTable, EmptyState, Pill, SearchInput, Select, toneText } from "@/components/ui";
import { useApp } from "@/lib/data/store";
import { exportXlsx } from "@/lib/export";
import { fmt } from "@/lib/format";
import { needsReenroll, usableTemplates } from "@/lib/face/matcher";
import { useT } from "@/lib/i18n/react";

export default function DirectorStudents() {
  const app = useApp();
  const t = useT();
  const router = useRouter();
  const inst = app.myInstitution!;
  const [q, setQ] = useState("");
  const [classId, setClassId] = useState("");
  const [archived, setArchived] = useState(false);
  const [form, setForm] = useState(false);
  const classes = app.classesOfInstitution(inst.id);
  const term = app.currentTerm(inst.id);
  const ql = q.trim().toLowerCase();
  const rows = app.studentsOfInstitution(inst.id, true)
    .filter((s) => s.archived === archived)
    .filter((s) => !classId || s.classId === classId)
    .filter((s) => !ql || s.name.toLowerCase().includes(ql) || app.parentsOfStudent(s.id).some((p) => p.phone.includes(ql.replace(/\D/g, "") || "§")));

  const stats = (id: string) => ({
    att: attendanceRate(app.attendanceOfStudentBetween(id, addDays(app.today, -30), app.today)),
    avg: weightedAverage(app.gradesOfStudent(id, { from: term?.startDay })),
    debt: app.invoicesOfStudent(id).reduce((s, i) => s + invoiceRemaining(i), 0),
  });

  const download = () => {
    const header = [t("O'quvchi"), t("Sinf"), t("Ota-onalar"), t("Telefon"), t("Davomat (30 kun)"), t("O'rtacha baho"), t("Qarzdorlik"), t("Yuz namunasi")];
    void exportXlsx(`${t("O'quvchilar")}_${app.today}.xlsx`, [{
      name: t("O'quvchilar"),
      rows: [header, ...rows.map((s) => {
        const st = stats(s.id);
        const ps = app.parentsOfStudent(s.id);
        return [s.name, app.schoolClass(s.classId)?.name, ps.map((p) => p.name).join(", "), ps.map((p) => fmt.phone(p.phone)).join(", "),
          st.att === null ? "" : Math.round(st.att * 100) / 100, st.avg === null ? "" : Number(st.avg.toFixed(2)), st.debt, usableTemplates(s).length ? t("Bor") : needsReenroll(s) ? t("Qayta olish kerak") : s.parentConsent ? t("Yo'q") : t("Rozilik yo'q")];
      })],
    }]);
  };

  return (
    <>
      <PageHeader title={t("O'quvchilar")} subtitle={t("{n} nafar", { n: rows.length })}
        actions={<>
          <button type="button" className={btn.sm} onClick={download}><Download size={15} aria-hidden /> Excel</button>
          <button type="button" className={btn.smPrimary} onClick={() => setForm(true)}><Plus size={16} aria-hidden /> {t("O'quvchi qo'shish")}</button>
        </>} />
      <PageBody>
        <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <SearchInput value={q} onChange={setQ} placeholder={t("Ism yoki ota-ona telefoni")} />
          <Select value={classId} onChange={setClassId} aria-label={t("Sinf")} className="sm:w-44">
            <option value="">{t("Barcha sinflar")}</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Select value={archived ? "1" : ""} onChange={(v) => setArchived(v === "1")} aria-label={t("Holat")} className="sm:w-40">
            <option value="">{t("Faol")}</option>
            <option value="1">{t("Arxiv")}</option>
          </Select>
        </div>
        <DataTable
          rows={rows}
          rowKey={(s) => s.id}
          rowHref={(s) => `/director/students/${s.id}`}
          initialSort={{ key: "name", dir: 1 }}
          empty={<Card><EmptyState icon={GraduationCap} title={q || classId ? t("Hech narsa topilmadi") : t("Hali o'quvchi yo'q")}
            action={!q && !classId && !archived && <button type="button" className={btn.smPrimary} onClick={() => setForm(true)}><Plus size={16} aria-hidden /> {t("O'quvchi qo'shish")}</button>} /></Card>}
          columns={[
            { key: "name", header: t("O'quvchi"), sort: (s) => s.name, cell: (s) => (
              <span className="flex items-center gap-2.5"><Avatar name={s.name} image={s.facePhoto} size={32} /><span className="truncate font-medium">{s.name}</span></span>
            ) },
            { key: "class", header: t("Sinf"), sort: (s) => app.schoolClass(s.classId)?.name ?? "", cell: (s) => app.schoolClass(s.classId)?.name },
            { key: "parents", header: t("Ota-ona"), hideOnMobile: true, cell: (s) => {
              const ps = app.parentsOfStudent(s.id);
              return ps.length ? <span className="text-muted">{fmt.phone(ps[0].phone)}{ps.length > 1 ? ` +${ps.length - 1}` : ""}</span> : <Pill tone="bad">{t("yo'q")}</Pill>;
            } },
            { key: "att", header: t("Davomat"), align: "right", sort: (s) => stats(s.id).att ?? -1, cell: (s) => fmt.percent(stats(s.id).att) },
            { key: "avg", header: t("O'rtacha"), align: "right", sort: (s) => stats(s.id).avg ?? -1, cell: (s) => {
              const v = stats(s.id).avg;
              return <b className={toneText(avgTone(v))}>{v === null ? "—" : fmt.number(v, 2)}</b>;
            } },
            { key: "debt", header: t("Qarz"), align: "right", sort: (s) => stats(s.id).debt, cell: (s) => {
              const d = stats(s.id).debt;
              return d ? <span className="font-semibold text-bad">{fmt.moneyShort(d)}</span> : <span className="text-muted">—</span>;
            } },
            { key: "face", header: t("Yuz"), align: "center", hideOnMobile: true, cell: (s) => usableTemplates(s).length
              ? <ScanFace size={18} className="inline text-ok" aria-label={t("Bor")} /> : !s.parentConsent ? <ShieldOff size={18} className="inline text-muted" aria-label={t("Rozilik yo'q")} /> : <span className="text-muted">—</span> },
          ]}
        />
      </PageBody>
      {form && <StudentForm defaultClassId={classId || undefined} onClose={(id) => { setForm(false); if (id) router.push(`/director/students/${id}`); }} />}
    </>
  );
}
