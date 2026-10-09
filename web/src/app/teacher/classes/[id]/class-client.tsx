"use client";

import { useState } from "react";
import Link from "next/link";
import { BookOpen, MessagesSquare, ScanFace, ShieldOff } from "lucide-react";
import { attendanceRate, addDays, weightedAverage } from "@edunazorat/shared";

import { WeekSchedule } from "@/components/learner";
import { useQueryParam } from "@/components/query";
import { useRouteParam } from "@/components/route-param";
import { PageBody, PageHeader } from "@/components/shell";
import { Journal } from "@/components/teacher/journal";
import {
  Avatar, avgTone, btn, Card, Chip, ChipRow, cx, DataTable, EmptyState, Pill, Segmented, Select, toneText,
} from "@/components/ui";
import { useApp } from "@/lib/data/store";
import { fmt, termLabel } from "@/lib/format";
import { needsReenroll, usableTemplates } from "@/lib/face/matcher";
import { useT } from "@/lib/i18n/react";

export function ClassClient() {
  const app = useApp();
  const t = useT();
  const id = useRouteParam("id");
  const me = app.currentUser!;
  const cls = app.schoolClass(id);
  const mySubjects = cls ? app.subjectsOfTeacherInClass(me.id, cls.id) : [];
  const isHomeroom = cls?.homeroomTeacherId === me.id;
  // Sinf rahbari barcha fanlarni ko'radi (faqat o'qish), o'z fanini tahrirlaydi.
  const subjects = cls ? (isHomeroom ? app.subjectsOfClass(cls.id) : mySubjects) : [];
  const qSubject = useQueryParam("subject");
  const qTab = useQueryParam("tab");
  const [tab, setTab] = useState<"journal" | "students" | "schedule">(qTab === "students" ? "students" : subjects.length ? "journal" : "students");
  const [subject, setSubject] = useState(qSubject && subjects.includes(qSubject) ? qSubject : mySubjects[0] ?? subjects[0] ?? "");
  const { terms, term, setTermId } = useTerm(cls?.institutionId ?? "");

  if (!cls) return (<><PageHeader back="/teacher/classes" title={t("Sinf")} /><PageBody><Card><EmptyState icon={BookOpen} title={t("Sinf topilmadi")} /></Card></PageBody></>);
  const students = app.studentsOfClass(cls.id);

  return (
    <>
      <PageHeader back="/teacher/classes" title={cls.name}
        subtitle={`${t("{n} o'quvchi", { n: students.length })}${isHomeroom ? ` · ${t("sinf rahbari")}` : ""}`}
        below={<Segmented value={tab} onChange={setTab} options={[
          ...(subjects.length ? [{ value: "journal" as const, label: t("Jurnal") }] : []),
          { value: "students" as const, label: t("O'quvchilar") },
          { value: "schedule" as const, label: t("Jadval") },
        ]} />} />
      <PageBody>
        {tab === "journal" && term && (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <ChipRow>
                {subjects.map((s) => <Chip key={s} selected={subject === s} onClick={() => setSubject(s)}>{s}</Chip>)}
              </ChipRow>
              <span className="flex-1" />
              <Select value={term.id} onChange={setTermId} className="h-10 !w-auto" aria-label={t("Chorak")}>
                {terms.map((x) => <option key={x.id} value={x.id}>{termLabel(x.name)}</option>)}
              </Select>
            </div>
            {!mySubjects.includes(subject) && <p className="mb-2 px-1 text-sm text-muted">{t("Bu fanni boshqa o'qituvchi o'tadi: faqat ko'rish")}</p>}
            <Journal classId={cls.id} subject={subject} term={term} editable={mySubjects.includes(subject)} />
          </>
        )}

        {tab === "students" && (
          <DataTable
            rows={students}
            rowKey={(s) => s.id}
            empty={<Card><EmptyState icon={BookOpen} title={t("Sinfda o'quvchi yo'q")} /></Card>}
            columns={[
              {
                key: "name", header: t("O'quvchi"), sort: (s) => s.name,
                cell: (s) => (
                  <span className="flex items-center gap-2.5">
                    <Avatar name={s.name} image={s.facePhoto} size={34} />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{s.name}</span>
                      <span className="block truncate text-xs text-muted">{app.parentsOfStudent(s.id).map((p) => `${p.name.replace(/ \(.*\)$/, "")} ${fmt.phone(p.phone)}`).join(", ") || t("ota-ona biriktirilmagan")}</span>
                    </span>
                  </span>
                ),
              },
              {
                key: "att", header: t("Davomat (30 kun)"), align: "right",
                sort: (s) => attendanceRate(app.attendanceOfStudentBetween(s.id, addDays(app.today, -30), app.today)) ?? -1,
                cell: (s) => fmt.percent(attendanceRate(app.attendanceOfStudentBetween(s.id, addDays(app.today, -30), app.today))),
              },
              {
                key: "avg", header: mySubjects[0] ? t("O'rtacha ({s})", { s: mySubjects[0] }) : t("O'rtacha"), align: "right",
                sort: (s) => weightedAverage(app.gradesOfStudent(s.id, { subject: mySubjects[0], from: term?.startDay })) ?? -1,
                cell: (s) => {
                  const v = weightedAverage(app.gradesOfStudent(s.id, { subject: mySubjects[0], from: term?.startDay }));
                  return <b className={toneText(avgTone(v))}>{v === null ? "—" : fmt.number(v, 2)}</b>;
                },
              },
              {
                key: "face", header: t("Yuz namunasi"),
                cell: (s) => !s.parentConsent ? <Pill tone="slate" icon={ShieldOff}>{t("Rozilik yo'q")}</Pill>
                  : needsReenroll(s) ? <Link href={`/teacher/enroll/${s.id}`} className={cx(btn.smPrimary, "h-8 !bg-warn")}><ScanFace size={15} aria-hidden /> {t("Qayta olish kerak")}</Link>
                  : usableTemplates(s).length ? (
                    <span className="flex items-center gap-2"><Pill tone="ok" icon={ScanFace}>{t("Bor")}</Pill>
                      <Link href={`/teacher/enroll/${s.id}`} className="text-xs text-primary hover:underline">{t("Yangilash")}</Link></span>
                  ) : <Link href={`/teacher/enroll/${s.id}`} className={cx(btn.smPrimary, "h-8")}><ScanFace size={15} aria-hidden /> {t("Ro'yxatga olish")}</Link>,
              },
              {
                key: "msg", header: "", hideOnMobile: true, align: "right",
                cell: (s) => {
                  const th = app.threadsOf(me.id).find((x) => x.studentId === s.id);
                  return <Link href={th ? `/teacher/messages/${th.id}` : "/teacher/messages"} className={btn.icon} aria-label={t("Ota-onaga yozish")}><MessagesSquare size={18} /></Link>;
                },
              },
            ]}
          />
        )}

        {tab === "schedule" && <WeekSchedule classId={cls.id} highlightTeacherId={me.id} />}
      </PageBody>
    </>
  );
}

function useTerm(instId: string) {
  const app = useApp();
  const terms = app.termsOf(instId);
  const [termId, setTermId] = useState(() => app.currentTerm(instId)?.id ?? "");
  return { terms, term: terms.find((x) => x.id === termId) ?? terms[0], setTermId };
}
