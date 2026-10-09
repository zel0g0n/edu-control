"use client";

import { useState } from "react";

import { HomeworkDetail } from "@/components/homework-detail";
import { LearnerHomeworkList } from "@/components/learner";
import { ParentFrame } from "@/components/parent-frame";
import { Modal } from "@/components/ui";
import { useApp } from "@/lib/data/store";

export default function Page() {
  const app = useApp();
  // Bildirishnoma yoki bosh sahifadan ?hw=... bilan kelinsa, vazifa darhol ochiladi.
  const [open, setOpen] = useState<string | null>(() => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("hw")));
  const hw = open ? app.homework(open) : undefined;
  return (
    <ParentFrame title="Vazifalar">
      {(s) => (
        <>
          <LearnerHomeworkList student={s} onOpen={(h) => setOpen(h.id)} />
          <Modal open={!!hw} onClose={() => setOpen(null)} title={hw ? `${hw.subject}: ${hw.title}` : ""} wide>
            {hw && <HomeworkDetail hw={hw} student={s} canSubmit={false} />}
          </Modal>
        </>
      )}
    </ParentFrame>
  );
}
