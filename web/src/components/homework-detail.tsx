"use client";

import { useState } from "react";
import { CalendarClock, Send, UserRound } from "lucide-react";
import type { Attachment, Homework, Student } from "@edunazorat/shared";

import { useApp } from "@/lib/data/store";
import { fmt } from "@/lib/format";
import { useT } from "@/lib/i18n/react";
import { AttachmentList, AttachmentPicker } from "./attachments";
import { homeworkStatus } from "./learner";
import { useRun } from "./providers";
import { btn, Card, cx, Field, GradeBadge, Pill, textareaCls } from "./ui";

/** Vazifa matni, ilovalari va o'quvchining javobi. O'quvchi shu yerda topshiradi. */
export function HomeworkDetail({ hw: h, student: s, canSubmit }: { hw: Homework; student: Student; canSubmit: boolean }) {
  const app = useApp();
  const t = useT();
  const run = useRun();
  const st = homeworkStatus(app, h, s.id);
  const sub = st.sub;
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(sub?.text ?? "");
  const [files, setFiles] = useState<Attachment[]>(sub?.attachments ?? []);
  const [busy, setBusy] = useState(false);
  const late = h.dueDay < app.today;
  const showForm = canSubmit && (!sub || editing || sub.status === "returned") && sub?.status !== "checked";

  const submit = async () => {
    setBusy(true);
    const ok = await run(() => app.run("submission.submit", { homeworkId: h.id, text, attachments: files }), t("Javob yuborildi"));
    setBusy(false);
    if (ok) setEditing(false);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted">
        <span className="flex items-center gap-1.5"><CalendarClock size={16} aria-hidden />{t("Muddat")}: <b className={cx(late ? "text-bad" : "text-ink")}>{fmt.weekday(h.dueDay)}, {fmt.date(h.dueDay)}</b></span>
        <span className="flex items-center gap-1.5"><UserRound size={16} aria-hidden />{app.userById(h.teacherId)?.name}</span>
        <Pill tone={st.tone}>{t(st.key)}</Pill>
      </div>
      {h.description && <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{h.description}</p>}
      <AttachmentList items={h.attachments} />

      {sub && !showForm && (
        <Card className="p-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="flex-1 text-sm font-semibold">{canSubmit ? t("Mening javobim") : t("O'quvchi javobi")}</span>
            <span className="tabular text-xs text-muted">{fmt.relative(sub.submittedAt, app.now)}</span>
          </div>
          {sub.text && <p className="text-[15px] whitespace-pre-wrap">{sub.text}</p>}
          <div className="mt-2"><AttachmentList items={sub.attachments} /></div>
          {(sub.status !== "submitted" || sub.feedback) && (
            <div className={cx("mt-3 flex items-start gap-3 rounded-xl p-3", sub.status === "returned" ? "bg-bad/8" : "bg-ok/8")}>
              {sub.grade && <GradeBadge value={sub.grade} size={40} />}
              <div className="min-w-0">
                <div className="text-sm font-semibold">{t(`sub.${sub.status}`)}</div>
                {sub.feedback && <div className="text-[15px]">{sub.feedback}</div>}
              </div>
            </div>
          )}
          {canSubmit && sub.status === "submitted" && (
            <button type="button" className={cx(btn.sm, "mt-3")} onClick={() => setEditing(true)}>{t("Javobni o'zgartirish")}</button>
          )}
        </Card>
      )}

      {showForm && (
        <Card className="flex flex-col gap-3 p-4">
          {sub?.status === "returned" && <p className="text-sm text-bad">{t("O'qituvchi javobni qaytardi. Tuzatib, qayta yuboring.")}</p>}
          <Field label={t("Javob")}>
            <textarea className={textareaCls} value={text} onChange={(e) => setText(e.target.value)} placeholder={t("Javobingizni yozing yoki daftar rasmini biriktiring")} maxLength={5000} />
          </Field>
          <AttachmentPicker value={files} onChange={setFiles} />
          {late && <p className="text-sm text-warn">{t("Muddat o'tgan: javob kechikkan deb ko'rinadi")}</p>}
          <button type="button" className={btn.primary} disabled={busy || (!text.trim() && files.length === 0)} onClick={submit}>
            <Send size={17} aria-hidden /> {t("Yuborish")}
          </button>
        </Card>
      )}
      {!canSubmit && !sub && <p className="text-sm text-muted">{t("O'quvchi hali javob yubormagan")}</p>}
    </div>
  );
}
