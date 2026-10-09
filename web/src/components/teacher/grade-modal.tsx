"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { LESSON_GRADE_TYPES, type GradeType, type Student } from "@edunazorat/shared";

import { useApp } from "@/lib/data/store";
import { fmt, gradeComment } from "@/lib/format";
import { useT } from "@/lib/i18n/react";
import { useRun } from "../providers";
import { btn, cx, Field, GradeBadge, gradeTone, inputCls, Modal, Segmented, toneSoft, toneSolid } from "../ui";

/** Baho qo'yish: qiymat, tur va izoh. Shu kundagi baholarni o'chirish ham shu yerda. */
export function GradeModal({
  student, subject, day, lessonId, onClose,
}: {
  student: Student | null;
  subject: string;
  day: string;
  lessonId?: string;
  onClose: () => void;
}) {
  const app = useApp();
  const t = useT();
  const run = useRun();
  const [value, setValue] = useState<number | null>(null);
  const [type, setType] = useState<GradeType>("current");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const me = app.currentUser!;
  const existing = student ? app.gradesOfStudent(student.id, { subject, from: day, to: day }) : [];
  const rec = student && lessonId ? app.attendanceRecord(student.id, lessonId, day) : undefined;

  const close = () => {
    setValue(null);
    setComment("");
    setType("current");
    onClose();
  };

  const save = async () => {
    if (!student || value === null) return;
    setBusy(true);
    const ok = await run(() => app.run("grade.add", { studentId: student.id, subject, value, type, day, lessonId, comment: comment.trim() || undefined }),
      t("Baho qo'yildi, ota-onaga xabar yuborildi"));
    setBusy(false);
    if (ok) close();
  };

  return (
    <Modal open={!!student} onClose={close} title={student?.name}
      footer={<>
        <button type="button" className={btn.outline} onClick={close}>{t("Bekor qilish")}</button>
        <button type="button" className={btn.primary} disabled={value === null || busy} onClick={save}>{t("Saqlash")}</button>
      </>}>
      <div className="text-sm text-muted">{subject} · {fmt.weekday(day)}, {fmt.date(day)}</div>
      {rec && (rec.status === "absent" || rec.status === "excused") && (
        <p className="mt-2 rounded-lg bg-warn/12 px-3 py-2 text-sm text-warn">{t("Bu darsda o'quvchi belgilangan: {s}", { s: t(`att.${rec.status}`) })}</p>
      )}

      {existing.length > 0 && (
        <div className="mt-4">
          <div className="mb-1.5 text-[13px] font-semibold text-muted">{t("Shu kungi baholar")}</div>
          <ul className="flex flex-col gap-1.5">
            {existing.map((g) => (
              <li key={g.id} className="flex items-center gap-2.5 rounded-xl bg-surface-2 px-3 py-2">
                <GradeBadge value={g.value} type={g.type} size={30} />
                <span className="min-w-0 flex-1 text-sm">
                  <span className="font-medium">{t(`grade.type.${g.type}`)}</span>
                  {g.comment && <span className="block truncate text-muted">{gradeComment(g.comment)}</span>}
                </span>
                {(g.teacherId === me.id || me.role === "director") && (
                  <button type="button" className={btn.icon} aria-label={t("Bahoni o'chirish")}
                    onClick={() => run(() => app.run("grade.remove", { id: g.id }), t("Baho o'chirildi"))}>
                    <Trash2 size={17} className="text-bad" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-5 text-[13px] font-semibold text-muted">{t("Yangi baho")}</div>
      <div className="mt-2 grid grid-cols-4 gap-2">
        {[5, 4, 3, 2].map((v) => (
          <button key={v} type="button" aria-pressed={value === v} onClick={() => setValue(v)}
            className={cx("tabular h-14 rounded-2xl text-2xl font-bold transition", value === v ? toneSolid(gradeTone(v)) : toneSoft(gradeTone(v)))}>
            {v}
          </button>
        ))}
      </div>
      <div className="mt-4 flex flex-col gap-3">
        <Field label={t("Turi")} group>
          <div className="scroll-x">
            <Segmented size="sm" value={type} onChange={setType} options={LESSON_GRADE_TYPES.map((x) => ({ value: x, label: t(`grade.type.${x}`) }))} />
          </div>
        </Field>
        <Field label={t("Izoh (ixtiyoriy)")} hint={t("Ota-ona va o'quvchi ko'radi")}>
          <input className={inputCls} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={200} placeholder={t("Masalan: Faol qatnashdi")} />
        </Field>
      </div>
    </Modal>
  );
}
