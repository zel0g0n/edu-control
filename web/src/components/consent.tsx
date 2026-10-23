"use client";

import { useState } from "react";
import { Camera, Eye, Lock, LogOut, ServerCog, Undo2 } from "lucide-react";
import { isZamsLinked, type Student } from "@edunazorat/shared";

import { useApp, type AppStore } from "@/lib/data/store";
import { useT } from "@/lib/i18n/react";
import { errorText, Logo } from "./providers";
import { Avatar, btn, cx } from "./ui";

/**
 * Ota-ona kirganda rozilik so'raladigan farzandlar (arxivdagi, katta yoshli tinglovchi va Z_AMS orqali
 * kelganlardan tashqari: ularning davomatini maktab kamerasi oladi, rozilik maktabda olinadi).
 */
export function consentPending(app: AppStore): Student[] {
  const u = app.currentUser;
  if (!u || u.role !== "parent") return [];
  return u.childIds.map((id) => app.student(id)).filter((s): s is Student => !!s && !s.archived && !s.adult && !s.parentConsent && !isZamsLinked(s));
}

/**
 * Ota-ona sahifasiga kirishdan oldin: farzand rasmi va yuz namunasidan foydalanishga rozilik.
 * Rozilik bermasa sahifaga kira olmaydi (chiqib ketadi). Sozlamalarda alohida tugma yo'q.
 */
export function ParentConsentGate() {
  const app = useApp();
  const t = useT();
  const kids = consentPending(app);
  const [agree, setAgree] = useState(false);
  const [declined, setDeclined] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      for (const s of kids) await app.run("consent.set", { studentId: s.id, consent: true });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const points = [
    { icon: Camera, text: t("Darsga kelganini avtomatik belgilash uchun maktab kamerasi yoki o'qituvchi telefoni farzandingiz yuzini taniydi.") },
    { icon: Lock, text: t("Saqlanadi: yuzning raqamli namunasi va kichik yuz kesimi. Video yozilmaydi.") },
    { icon: Eye, text: t("Ko'radi: siz, farzandingiz o'qituvchilari va maktab rahbariyati. Boshqa ota-onalar ko'rmaydi.") },
    { icon: ServerCog, text: t("Ma'lumotlar O'zbekistondagi serverda saqlanadi va uchinchi shaxslarga berilmaydi.") },
    { icon: Undo2, text: t("Rozilikni maktab administratsiyasi orqali istalgan vaqtda bekor qilishingiz mumkin: namuna va rasmlar o'chiriladi.") },
  ];

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-lg">
        <Logo />
        {declined ? (
          <div className="mt-8 rounded-2xl border border-line bg-surface p-6">
            <h1 className="text-xl font-bold">{t("Rozilik berilmadi")}</h1>
            <p className="mt-2 text-sm text-muted">{t("Rozilik bo'lmasa ota-ona sahifasidan foydalanib bo'lmaydi. Savollaringiz bo'lsa, maktab administratsiyasiga murojaat qiling.")}</p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button type="button" className={btn.outline} onClick={() => setDeclined(false)}>{t("Ortga")}</button>
              <button type="button" className={btn.primary} onClick={() => void app.signOut()}><LogOut size={17} aria-hidden /> {t("Chiqish")}</button>
            </div>
          </div>
        ) : (
          <div className="mt-8 rounded-2xl border border-line bg-surface p-6">
            <h1 className="text-xl font-bold text-balance">{t("Farzandingiz rasmidan foydalanishga rozilik")}</h1>
            <div className="mt-4 flex flex-col gap-2">
              {kids.map((s) => (
                <div key={s.id} className="flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2">
                  <Avatar name={s.name} image={s.photo} size={36} />
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{s.name}</div>
                    <div className="truncate text-xs text-muted">{app.classNamesOf(s)} · {app.institution(s.institutionId)?.name}</div>
                  </div>
                </div>
              ))}
            </div>
            <ul className="mt-5 flex flex-col gap-3">
              {points.map((p) => (
                <li key={p.text} className="flex gap-3 text-sm">
                  <p.icon size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden />
                  <span>{p.text}</span>
                </li>
              ))}
            </ul>
            <label className="mt-5 flex items-start gap-2.5 rounded-xl border border-line p-3">
              <input type="checkbox" className="mt-0.5 size-4 accent-[var(--color-primary)]" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
              <span className="text-sm font-medium">{t("Yuqoridagilarni o'qidim va farzandim rasmidan shu maqsadda foydalanishga roziman")}</span>
            </label>
            {error && <p role="alert" className="mt-3 text-sm font-medium text-bad">{error}</p>}
            <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button type="button" className={btn.outline} disabled={busy} onClick={() => setDeclined(true)}>{t("Rozi emasman")}</button>
              <button type="button" className={cx(btn.primary)} disabled={!agree || busy} onClick={() => void accept()}>{t("Roziman, davom etish")}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
