"use client";

import { useState } from "react";
import { Pencil, Plus, UserCheck, UserX, Users } from "lucide-react";
import { isoWeekday, type AppUser } from "@edunazorat/shared";

import { TeacherForm } from "@/components/director/forms";
import { useRun } from "@/components/providers";
import { PageBody, PageHeader } from "@/components/shell";
import { Avatar, btn, Card, DataTable, EmptyState, Pill, SearchInput, Segmented } from "@/components/ui";
import { useApp } from "@/lib/data/store";
import { fmt } from "@/lib/format";
import { useT } from "@/lib/i18n/react";

export default function DirectorTeachers() {
  const app = useApp();
  const t = useT();
  const run = useRun();
  const inst = app.myInstitution!;
  const [q, setQ] = useState("");
  const [show, setShow] = useState<"active" | "inactive">("active");
  const [form, setForm] = useState<AppUser | "new" | null>(null);
  const all = app.teachersOfInstitution(inst.id, true);
  const rows = all.filter((u) => (show === "active") === u.active).filter((u) => !q || `${u.name} ${u.subjects.join(" ")}`.toLowerCase().includes(q.toLowerCase()));
  const today = isoWeekday(app.today);
  const weekly = (id: string) => app.db.lessons.filter((l) => l.teacherId === id).length;
  // Bugun shu o'qituvchining darslaridan nechtasida davomat olingan.
  const todayInfo = (id: string) => {
    const ls = today === 7 ? [] : app.db.lessons.filter((l) => l.teacherId === id && l.weekday === today);
    return { total: ls.length, done: ls.filter((l) => app.attendanceOfLesson(l.id, app.today).length > 0).length };
  };

  return (
    <>
      <PageHeader title={t("O'qituvchilar")} subtitle={t("{n} nafar", { n: all.filter((u) => u.active).length })}
        actions={<button type="button" className={btn.smPrimary} onClick={() => setForm("new")}><Plus size={16} aria-hidden /> {t("O'qituvchi qo'shish")}</button>} />
      <PageBody>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <SearchInput value={q} onChange={setQ} placeholder={t("Ism yoki fan")} className="min-w-60 flex-1" />
          <Segmented value={show} onChange={setShow} options={[{ value: "active", label: t("Faol") }, { value: "inactive", label: t("Faol emas") }]} />
        </div>
        <DataTable rows={rows} rowKey={(u) => u.id} initialSort={{ key: "name", dir: 1 }}
          empty={<Card><EmptyState icon={Users} title={t("O'qituvchi yo'q")} /></Card>}
          columns={[
            { key: "name", header: t("O'qituvchi"), sort: (u) => u.name, cell: (u) => (
              <span className="flex items-center gap-2.5"><Avatar name={u.name} size={32} /><span className="min-w-0"><span className="block truncate font-medium">{u.name}</span><span className="tabular block text-xs text-muted">{fmt.phone(u.phone)}</span></span></span>
            ) },
            { key: "subjects", header: t("Fanlari"), cell: (u) => u.subjects.join(", ") || "—" },
            { key: "classes", header: t("Sinflar"), cell: (u) => app.classesOfTeacher(u.id).map((c) => c.name).join(", ") || "—" },
            { key: "load", header: t("Haftalik dars"), align: "right", sort: (u) => weekly(u.id), cell: (u) => weekly(u.id) },
            { key: "today", header: t("Bugun davomat"), cell: (u) => {
              const x = todayInfo(u.id);
              return x.total === 0 ? <span className="text-muted">—</span> : <Pill tone={x.done === x.total ? "ok" : "warn"}>{x.done}/{x.total}</Pill>;
            } },
            { key: "act", header: "", align: "right", cell: (u) => (
              <span className="flex justify-end gap-1">
                <button type="button" className={btn.icon} aria-label={t("Tahrirlash")} onClick={() => setForm(u)}><Pencil size={17} /></button>
                <button type="button" className={btn.icon} aria-label={u.active ? t("Faolsizlantirish") : t("Faollashtirish")}
                  onClick={() => run(() => app.run("teacher.setActive", { id: u.id, active: !u.active }), u.active ? t("O'qituvchi faolsizlantirildi") : t("O'qituvchi faollashtirildi"))}>
                  {u.active ? <UserX size={17} className="text-bad" /> : <UserCheck size={17} className="text-ok" />}
                </button>
              </span>
            ) },
          ]} />
      </PageBody>
      {form && <TeacherForm teacher={form === "new" ? undefined : form} onClose={() => setForm(null)} />}
    </>
  );
}
