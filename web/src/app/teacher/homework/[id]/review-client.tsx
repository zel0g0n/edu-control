"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, NotebookPen, Pencil, Trash2, Undo2 } from "lucide-react";
import type { Student, Submission } from "@edunazorat/shared";

import { AttachmentList } from "@/components/attachments";
import { useRun } from "@/components/providers";
import { useRouteParam } from "@/components/route-param";
import { PageBody, PageHeader } from "@/components/shell";
import { HomeworkEditor } from "@/components/teacher/homework-editor";
import {
  Avatar, btn, Card, cx, EmptyState, Field, GradeBadge, gradeTone, ListCard, ListRow, Modal, Pill, Section, textareaCls,
  toneSoft, toneSolid, useConfirm,
} from "@/components/ui";
import { useApp } from "@/lib/data/store";
import { fmt } from "@/lib/format";
import { useT } from "@/lib/i18n/react";

export function HomeworkReviewClient() {
  const app = useApp();
  const t = useT();
  const run = useRun();
  const router = useRouter();
  const { ask, dialog } = useConfirm();
  const id = useRouteParam("id");
  const h = app.homework(id);
  const [edit, setEdit] = useState(false);
  const [review, setReview] = useState<{ s: Student; sub: Submission } | null>(null);

  if (!h) return (<><PageHeader back="/teacher/homework" title={t("Vazifa")} /><PageBody><Card><EmptyState icon={NotebookPen} title={t("Vazifa topilmadi")} /></Card></PageBody></>);
  const students = app.studentsOfClass(h.classId);
  const subs = app.submissionsOf(h.id);
  const order = { submitted: 0, returned: 1, checked: 2 } as const;
  const submitted = students.filter((s) => subs.some((x) => x.studentId === s.id))
    .sort((a, b) => order[subs.find((x) => x.studentId === a.id)!.status] - order[subs.find((x) => x.studentId === b.id)!.status]);
  const missing = students.filter((s) => !subs.some((x) => x.studentId === s.id));

  const remove = async () => {
    if (!(await ask(t("Vazifa va unga yuborilgan barcha javoblar o'chiriladi."), { danger: true, ok: t("O'chirish") }))) return;
    if (await run(() => app.run("homework.delete", { id: h.id }), t("Vazifa o'chirildi"))) router.replace("/teacher/homework");
  };

  return (
    <>
      <PageHeader back="/teacher/homework" title={h.title} subtitle={`${app.schoolClass(h.classId)?.name} · ${h.subject} · ${t("Muddat")}: ${fmt.date(h.dueDay)}`}
        actions={<>
          <button type="button" className={btn.sm} onClick={() => setEdit(true)}><Pencil size={15} aria-hidden /> {t("Tahrirlash")}</button>
          <button type="button" className={btn.sm} onClick={remove}><Trash2 size={15} aria-hidden className="text-bad" /> {t("O'chirish")}</button>
        </>} />
      <PageBody>
        <div className="grid grid-cols-1 gap-x-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div>
            <Card className="p-4">
              {h.description ? <p className="text-[15px] whitespace-pre-wrap">{h.description}</p> : <p className="text-sm text-muted">{t("Izoh yo'q")}</p>}
              {h.attachments.length > 0 && <div className="mt-3"><AttachmentList items={h.attachments} /></div>}
            </Card>
            {missing.length > 0 && (
              <Section title={t("Topshirmaganlar ({n})", { n: missing.length })}>
                <div className="flex flex-wrap gap-2">
                  {missing.map((s) => (
                    <span key={s.id} className="flex items-center gap-2 rounded-full border border-line bg-surface py-1 pr-3 pl-1 text-sm">
                      <Avatar name={s.name} image={s.facePhoto} size={26} />{s.name}
                    </span>
                  ))}
                </div>
              </Section>
            )}
          </div>
          <Section title={t("Javoblar ({n}/{total})", { n: subs.length, total: students.length })} className="lg:mt-0">
            {submitted.length === 0 ? (
              <Card><EmptyState compact icon={NotebookPen} title={t("Hali javob yo'q")} /></Card>
            ) : (
              <ListCard>
                {submitted.map((s) => {
                  const sub = subs.find((x) => x.studentId === s.id)!;
                  return (
                    <ListRow key={s.id} onClick={() => setReview({ s, sub })}
                      leading={<Avatar name={s.name} image={s.facePhoto} size={38} />}
                      title={s.name}
                      subtitle={<span>{fmt.relative(sub.submittedAt, app.now)}{sub.submittedAt > new Date(`${h.dueDay}T23:59:59`).getTime() ? ` · ${t("kechikkan")}` : ""}{sub.attachments.length ? ` · 📎 ${sub.attachments.length}` : ""} · {sub.text.slice(0, 60)}</span>}
                      trailing={<span className="flex shrink-0 items-center gap-1.5">{sub.grade && <GradeBadge value={sub.grade} size={28} />}<Pill tone={sub.status === "checked" ? "ok" : sub.status === "returned" ? "bad" : "warn"}>{t(sub.status === "submitted" ? "Yangi" : `sub.${sub.status}`)}</Pill></span>}
                    />
                  );
                })}
              </ListCard>
            )}
          </Section>
        </div>
      </PageBody>
      {edit && <HomeworkEditor open onClose={() => setEdit(false)} initial={h} />}
      {review && <ReviewModal student={review.s} sub={review.sub} onClose={() => setReview(null)} />}
      {dialog}
    </>
  );
}

function ReviewModal({ student: s, sub, onClose }: { student: Student; sub: Submission; onClose: () => void }) {
  const app = useApp();
  const t = useT();
  const run = useRun();
  const [grade, setGrade] = useState<number | undefined>(sub.grade);
  const [feedback, setFeedback] = useState(sub.feedback ?? "");
  const [busy, setBusy] = useState(false);
  const save = async (status: "checked" | "returned") => {
    setBusy(true);
    const ok = await run(() => app.run("submission.review", { id: sub.id, status, grade: status === "checked" ? grade : undefined, feedback }),
      status === "checked" ? t("Tekshirildi") : t("Qaytarildi"));
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <Modal open onClose={onClose} title={s.name} wide
      footer={<>
        <button type="button" className={btn.outline} disabled={busy} onClick={() => save("returned")}><Undo2 size={16} aria-hidden /> {t("Qaytarish")}</button>
        <button type="button" className={btn.primary} disabled={busy} onClick={() => save("checked")}><Check size={16} aria-hidden /> {t("Tekshirildi")}</button>
      </>}>
      <div className="text-xs text-muted">{fmt.dateFull(sub.submittedAt)}, {fmt.time(sub.submittedAt)}</div>
      {sub.text && <p className="mt-2 rounded-xl bg-surface-2 p-3 text-[15px] whitespace-pre-wrap">{sub.text}</p>}
      {sub.attachments.length > 0 && <div className="mt-3"><AttachmentList items={sub.attachments} /></div>}
      <div className="mt-5 text-[13px] font-semibold text-muted">{t("Baho (ixtiyoriy, jurnalga \"Yozma\" bo'lib tushadi)")}</div>
      <div className="mt-2 grid grid-cols-5 gap-2">
        {[5, 4, 3, 2].map((v) => (
          <button key={v} type="button" aria-pressed={grade === v} onClick={() => setGrade(grade === v ? undefined : v)}
            className={cx("h-12 rounded-xl text-xl font-bold", grade === v ? toneSolid(gradeTone(v)) : toneSoft(gradeTone(v)))}>{v}</button>
        ))}
        <button type="button" aria-pressed={grade === undefined} onClick={() => setGrade(undefined)} className={cx("h-12 rounded-xl text-sm", grade === undefined ? "bg-ink text-bg" : "bg-surface-2")}>{t("Bahosiz")}</button>
      </div>
      <Field label={t("Izoh")} className="mt-4">
        <textarea className={textareaCls} value={feedback} onChange={(e) => setFeedback(e.target.value)} maxLength={1000} placeholder={t("Masalan: 3-misolni qayta tekshiring")} />
      </Field>
    </Modal>
  );
}
