"use client";

import { LearnerGrades } from "@/components/learner";
import { ParentFrame } from "@/components/parent-frame";

export default function Page() {
  return <ParentFrame title="Baholar">{(s) => <LearnerGrades student={s} />}</ParentFrame>;
}
