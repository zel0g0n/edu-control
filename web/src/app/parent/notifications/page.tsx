"use client";

import { NotificationsView } from "@/components/inbox";
import { PageBody, PageHeader } from "@/components/shell";
import { useT } from "@/lib/i18n/react";

export default function Page() {
  const t = useT();
  return (
    <>
      <PageHeader title={t("Bildirishnomalar")} />
      <PageBody className="max-w-3xl"><NotificationsView /></PageBody>
    </>
  );
}
