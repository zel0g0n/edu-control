"use client";

import { LearnerHome } from "@/components/learner";
import { StudentFrame } from "@/components/student-frame";

export default function Page() {
  return <StudentFrame title="Bugun">{(s) => <LearnerHome student={s} base="/student" showPayments={false} />}</StudentFrame>;
}
