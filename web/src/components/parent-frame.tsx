"use client";

import { useEffect } from "react";
import { UserRound } from "lucide-react";
import type { Student } from "@edunazorat/shared";

import { useApp } from "@/lib/data/store";
import { useT } from "@/lib/i18n/react";
import { PageBody, PageHeader } from "./shell";
import { Avatar, Card, cx, EmptyState } from "./ui";

/** Ota-ona sahifasi: sarlavha + farzand tanlash (bir nechta farzand bo'lsa). */
export function ParentFrame({
  title, actions, children,
}: {
  title: string;
  actions?: React.ReactNode;
  children: (child: Student) => React.ReactNode;
}) {
  const app = useApp();
  const t = useT();
  const u = app.currentUser!;
  const child = app.child;
  const kids = u.childIds.map((id) => app.student(id)).filter((s): s is Student => !!s);

  // Bildirishnomadan ?child=... bilan kelinsa.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("child");
    if (id && u.childIds.includes(id)) app.selectChild(id);
  }, [app, u.childIds]);

  const switcher = kids.length > 1 ? (
    <div className="scroll-x -mx-4 flex gap-2 px-4 md:mx-0 md:px-0" role="tablist" aria-label={t("Farzand")}>
      {kids.map((k) => (
        <button key={k.id} type="button" role="tab" aria-selected={child?.id === k.id} onClick={() => app.selectChild(k.id)}
          className={cx("flex shrink-0 items-center gap-2 rounded-full border py-1 pr-3.5 pl-1 text-sm transition",
            child?.id === k.id ? "border-ink bg-ink font-semibold text-bg" : "border-line bg-surface hover:bg-surface-2")}>
          <Avatar name={k.name} image={k.facePhoto} size={28} />
          {k.name.split(" ")[0]}
          <span className={cx("text-xs", child?.id === k.id ? "opacity-70" : "text-muted")}>{app.schoolClass(k.classId)?.name}</span>
        </button>
      ))}
    </div>
  ) : undefined;

  return (
    <>
      <PageHeader title={t(title)} subtitle={kids.length === 1 && child ? `${child.name} · ${app.schoolClass(child.classId)?.name}` : undefined} actions={actions} below={switcher} />
      <PageBody>
        {child ? children(child) : <Card><EmptyState icon={UserRound} title={t("Farzand biriktirilmagan")} text={t("Muassasa administratoriga murojaat qiling")} /></Card>}
      </PageBody>
    </>
  );
}
