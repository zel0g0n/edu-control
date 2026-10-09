"use client";

import { LearnerGrades } from "@/components/learner";
import { StudentFrame } from "@/components/student-frame";

export default function Page() {
  return <StudentFrame title="Baholar">{(s) => <LearnerGrades student={s} />}</StudentFrame>;
}
