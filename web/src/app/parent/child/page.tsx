"use client";

import Link from "next/link";
import { MessagesSquare, ScanFace, ShieldCheck, ShieldOff } from "lucide-react";
import { hasOnlinePayments, isZamsLinked, type Student } from "@edunazorat/shared";

import { ParentFrame } from "@/components/parent-frame";
import { ReceiptIdCard } from "@/components/receipt-id";
import { Avatar, btn, Card, cx, ListCard, ListRow, Pill, Section } from "@/components/ui";
import { useApp } from "@/lib/data/store";
import { fmt } from "@/lib/format";
import { useT } from "@/lib/i18n/react";

export default function Page() {
  return <ParentFrame title="Farzand profili">{(s) => <Profile student={s} />}</ParentFrame>;
}

function Profile({ student: s }: { student: Student }) {
  const app = useApp();
  const t = useT();
  const classes = app.classesOfStudent(s);
  const teachers = app.teachersOfStudent(s);
  const homerooms = new Set(classes.map((c) => c.homeroomTeacherId).filter(Boolean));

  return (
    <div className="grid grid-cols-1 gap-x-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div>
        <Card className="flex items-center gap-4 p-5">
          <Avatar name={s.name} image={s.facePhoto ?? s.photo} size={72} />
          <div className="min-w-0">
            <div className="text-xl font-bold">{s.name}</div>
            <div className="text-sm text-muted">{classes.map((c) => c.name).join(", ")} · {app.institution(s.institutionId)?.name}</div>
            {s.birthDay && <div className="text-sm text-muted">{t("Tug'ilgan sana")}: {fmt.dateFull(s.birthDay)}</div>}
          </div>
        </Card>
        <ReceiptIdCard id={s.receiptId} online={hasOnlinePayments(app.institution(s.institutionId)?.settings.payments)} className="mt-3" />

        {isZamsLinked(s) ? (
          <Section title={t("Yuz orqali davomat")}>
            <Card className="p-4">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary"><ScanFace size={20} /></span>
                <p className="min-w-0 flex-1 text-sm text-muted">
                  {t("Davomatni maktabdagi kamera tizimi (Z_AMS) oladi. Farzandingiz rasmidan foydalanishga rozilik maktabda olingan; savollar va rozilikni bekor qilish uchun maktab administratsiyasiga murojaat qiling.")}
                </p>
              </div>
            </Card>
          </Section>
        ) : (
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
              {/* Rozilik kirishda so'raladi; bekor qilish — maktab administratsiyasi orqali */}
              <p className="mt-3 text-xs text-muted">
                {s.consentAt ? `${t("Rozilik berilgan sana")}: ${fmt.dateFull(new Date(s.consentAt).toISOString().slice(0, 10))}. ` : ""}
                {t("Rozilikni bekor qilish uchun maktab administratsiyasiga murojaat qiling.")}
              </p>
            </Card>
          </Section>
        )}
      </div>

      <Section title={t("O'qituvchilar")}>
        <ListCard>
          {teachers.map(({ teacher, subjects }) => (
            <ListRow key={teacher.id}
              leading={<Avatar name={teacher.name} />}
              title={teacher.name}
              subtitle={[subjects.join(", "), homerooms.has(teacher.id) ? t("sinf rahbari") : ""].filter(Boolean).join(" · ")}
              trailing={<MessageButton teacherId={teacher.id} studentId={s.id} />}
            />
          ))}
        </ListCard>
      </Section>
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
