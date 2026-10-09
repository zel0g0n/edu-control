"use client";

import { useState } from "react";
import { addDays, isoWeekday, type Attachment, type Homework } from "@edunazorat/shared";

import { useApp, type AppStore } from "@/lib/data/store";
import { useT } from "@/lib/i18n/react";
import { AttachmentPicker } from "../attachments";
import { useRun } from "../providers";
import { btn, Field, inputCls, Modal, Select, textareaCls } from "../ui";

/** Shu fan bo'yicha keyingi dars kuni (muddat uchun taklif). */
export function nextLessonDay(app: AppStore, classId: string, subject: string): string {
  for (let i = 1; i <= 14; i++) {
    const d = addDays(app.today, i);
    const wd = isoWeekday(d);
    if (app.lessonsOfClassOn(classId, wd).some((l) => l.subject === subject)) return d;
  }
  return addDays(app.today, 1);
}

export function HomeworkEditor({
  open, onClose, initial, classId: fixedClass, subject: fixedSubject, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  initial?: Homework;
  classId?: string;
  subject?: string;
  onSaved?: (id: string) => void;
}) {
  const app = useApp();
  const t = useT();
  const run = useRun();
  const me = app.currentUser!;
  const options = app.db.lessons
    .filter((l) => l.teacherId === me.id)
    .map((l) => `${l.classId}|${l.subject}`)
    .filter((v, i, a) => a.indexOf(v) === i)
    .sort();
  const firstKey = initial ? `${initial.classId}|${initial.subject}` : fixedClass && fixedSubject ? `${fixedClass}|${fixedSubject}` : options[0] ?? "";
  const [key, setKey] = useState(firstKey);
  const [cid, subj] = key.split("|");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [desc, setDesc] = useState(initial?.description ?? "");
  const [due, setDue] = useState(initial?.dueDay ?? (cid ? nextLessonDay(app, cid, subj) : app.today));
  const [files, setFiles] = useState<Attachment[]>(initial?.attachments ?? []);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    const p = await run(() => app.run("homework.save", { id: initial?.id, classId: cid, subject: subj, title, description: desc, dueDay: due, attachments: files }),
      initial ? t("Vazifa saqlandi") : t("Vazifa berildi, o'quvchi va ota-onalarga xabar yuborildi"));
    setBusy(false);
    if (p) {
      onSaved?.(p.upsert?.homeworks?.[0]?.id ?? "");
      if (!initial) {
        setTitle("");
        setDesc("");
        setFiles([]);
      }
      onClose();
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={initial ? t("Vazifani tahrirlash") : t("Yangi vazifa")} wide
      footer={<>
        <button type="button" className={btn.outline} onClick={onClose}>{t("Bekor qilish")}</button>
        <button type="button" className={btn.primary} disabled={busy || !title.trim() || !cid} onClick={save}>{initial ? t("Saqlash") : t("Vazifa berish")}</button>
      </>}>
      <div className="flex flex-col gap-3">
        {!initial && !(fixedClass && fixedSubject) && (
          <Field label={t("Sinf va fan")}>
            <Select value={key} onChange={(v) => { setKey(v); const [c, s] = v.split("|"); setDue(nextLessonDay(app, c, s)); }}>
              {options.map((o) => {
                const [c, s] = o.split("|");
                return <option key={o} value={o}>{app.schoolClass(c)?.name} — {s}</option>;
              })}
            </Select>
          </Field>
        )}
        <Field label={t("Mavzu")}>
          <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder={t("Masalan: Kasrlarni qo'shish")} />
        </Field>
        <Field label={t("Topshiriq")}>
          <textarea className={textareaCls} value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={3000} placeholder={t("Darslik 45-bet, 1-10 misollar")} />
        </Field>
        <Field label={t("Muddat")} hint={t("Taklif: shu fanning keyingi darsi")}>
          <input type="date" className={inputCls} value={due} min={initial ? undefined : app.today} onChange={(e) => setDue(e.target.value)} />
        </Field>
        <Field label={t("Ilovalar")} group>
          <AttachmentPicker value={files} onChange={setFiles} />
        </Field>
      </div>
    </Modal>
  );
}
