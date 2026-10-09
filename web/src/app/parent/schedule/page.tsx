"use client";

import { WeekSchedule } from "@/components/learner";
import { ParentFrame } from "@/components/parent-frame";

export default function Page() {
  return <ParentFrame title="Dars jadvali">{(s) => <WeekSchedule classId={s.classId} />}</ParentFrame>;
}
