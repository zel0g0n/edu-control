"use client";

import { useState } from "react";
import Link from "next/link";
import { MessagesSquare, ScanFace, ShieldCheck, ShieldOff } from "lucide-react";
import type { Student } from "@edunazorat/shared";

import { ParentFrame } from "@/components/parent-frame";
import { useRun } from "@/components/providers";
import { Avatar, btn, Card, cx, ListCard, ListRow, Pill, Section, useConfirm } from "@/components/ui";
import { useApp } from "@/lib/data/store";
import { fmt } from "@/lib/format";
import { useT } from "@/lib/i18n/react";

export default function Page() {
  return <ParentFrame title="Farzand profili">{(s) => <Profile student={s} />}</ParentFrame>;
}

function Profile({ student: s }: { student: Student }) {
  const app = useApp();
  const t = useT();
  const run = useRun();
  const { ask, dialog } = useConfirm();
  const [busy, setBusy] = useState(false);
  const cls = app.schoolClass(s.classId);
  const teachers = app.teachersOfClass(s.classId);
  const homeroom = cls?.homeroomTeacherId;

  const setConsent = async (consent: boolean) => {
    if (!consent && !(await ask(t("Rozilik bekor qilinsa, farzandingizning yuz namunasi o'chiriladi va davomat faqat qo'lda olinadi."), { danger: true, ok: t("Bekor qilish") }))) return;
    setBusy(true);
    await run(() => app.run("consent.set", { studentId: s.id, consent }), consent ? t("Rozilik berildi") : t("Rozilik bekor qilindi"));
    setBusy(false);
  };

  return (
    <div className="grid grid-cols-1 gap-x-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div>
        <Card className="flex items-center gap-4 p-5">
          <Avatar name={s.name} image={s.facePhoto} size={72} />
          <div className="min-w-0">
            <div className="text-xl font-bold">{s.name}</div>
            <div className="text-sm text-muted">{cls?.name} · {app.institution(s.institutionId)?.name}</div>
            {s.birthDay && <div className="text-sm text-muted">{t("Tug'ilgan sana")}: {fmt.dateFull(s.birthDay)}</div>}
          </div>
        </Card>

        <Section title={t("Yuz orqali davomat")}>
          <Card className="p-4">
            <div className="flex items-start gap-3">
              <span className={cx("flex size-10 shrink-0 items-center justify-center rounded-xl", s.parentConsent ? "bg-ok/12 text-ok" : "bg-slate/12 text-slate")}>
                {s.parentConsent ? <ShieldCheck size={20} /> : <ShieldOff size={20} />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 font-semibold">
                  {s.parentConsent ? t("Rozilik berilgan") : t("Rozilik berilmagan")}
                  {s.parentConsent && <Pill tone={s.facePhoto ? "ok" : "warn"} icon={ScanFace}>{s.facePhoto ? t("Namuna olingan") : t("Namuna hali olinmagan")}</Pill>}
                </div>
                <p className="mt-1 text-sm text-muted">
                  {t("O'qituvchi darsda kamerani yoqadi, dastur farzandingiz yuzini taniydi va sizga faqat uning yuz kesimini yuboradi. Video va to'liq rasm saqlanmaydi; serverda faqat raqamli yuz namunasi turadi.")}
                </p>
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              {s.parentConsent
                ? <button type="button" className={btn.sm} disabled={busy} onClick={() => setConsent(false)}>{t("Rozilikni bekor qilish")}</button>
                : <button type="button" className={btn.smPrimary} disabled={busy} onClick={() => setConsent(true)}>{t("Rozilik berish")}</button>}
            </div>
          </Card>
        </Section>
      </div>

      <Section title={t("O'qituvchilar")}>
        <ListCard>
          {teachers.map(({ teacher, subjects }) => (
            <ListRow key={teacher.id}
              leading={<Avatar name={teacher.name} />}
              title={teacher.name}
              subtitle={[subjects.join(", "), teacher.id === homeroom ? t("sinf rahbari") : ""].filter(Boolean).join(" · ")}
              trailing={<MessageButton teacherId={teacher.id} studentId={s.id} />}
            />
          ))}
        </ListCard>
      </Section>
      {dialog}
    </div>
  );
}

function MessageButton({ teacherId, studentId }: { teacherId: string; studentId: string }) {
  const app = useApp();
  const t = useT();
  const u = app.currentUser!;
  const th = app.threadsOf(u.id).find((x) => x.teacherId === teacherId && x.studentId === studentId);
  return (
    <Link href={th ? `/parent/messages/${th.id}` : "/parent/messages"} className={btn.icon} aria-label={t("Yozish")}>
      <MessagesSquare size={19} />
    </Link>
  );
}
