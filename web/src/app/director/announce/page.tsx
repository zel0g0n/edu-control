"use client";

import { useState } from "react";
import { Megaphone, Send } from "lucide-react";

import { useRun } from "@/components/providers";
import { PageBody, PageHeader } from "@/components/shell";
import { btn, Card, Field, inputCls, Select, textareaCls } from "@/components/ui";
import { useApp } from "@/lib/data/store";
import { useT } from "@/lib/i18n/react";

export default function DirectorAnnounce() {
  const app = useApp();
  const t = useT();
  const run = useRun();
  const inst = app.myInstitution!;
  const classes = app.classesOfInstitution(inst.id);
  const [classId, setClassId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const recipients = app.studentsOfInstitution(inst.id).filter((s) => !classId || s.classId === classId);
  const people = new Set(recipients.flatMap((s) => [...s.parentIds, ...(s.userId ? [s.userId] : [])])).size;

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const ok = await run(() => app.run("announcement.send", { classId: classId || undefined, title, body }), t("E'lon {n} kishiga yuborildi", { n: people }));
    setBusy(false);
    if (ok) {
      setTitle("");
      setBody("");
    }
  };

  return (
    <>
      <PageHeader title={t("E'lonlar")} subtitle={t("Ota-onalar va o'quvchilarga bildirishnoma")} />
      <PageBody className="max-w-2xl">
        <Card className="p-5">
          <form onSubmit={send} className="flex flex-col gap-4">
            <Field label={t("Kimga")}>
              <Select value={classId} onChange={setClassId}>
                <option value="">{t("Butun muassasa")}</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label={t("Sarlavha")}><input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder={t("Masalan: Ota-onalar yig'ilishi")} /></Field>
            <Field label={t("Matn")}><textarea className={textareaCls} value={body} onChange={(e) => setBody(e.target.value)} maxLength={1000} rows={5} placeholder={t("Shanba kuni soat 10:00 da maktab zalida...")} /></Field>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-sm text-muted"><Megaphone size={16} aria-hidden />{t("{n} kishi oladi", { n: people })}</span>
              <button type="submit" className={btn.primary} disabled={busy || !title.trim() || !body.trim()}><Send size={17} aria-hidden /> {t("Yuborish")}</button>
            </div>
          </form>
        </Card>
      </PageBody>
    </>
  );
}
