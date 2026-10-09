"use client";

import { LearnerAttendance } from "@/components/learner";
import { ParentFrame } from "@/components/parent-frame";

export default function Page() {
  return <ParentFrame title="Davomat">{(s) => <LearnerAttendance student={s} />}</ParentFrame>;
}
