"use client";

import { LearnerAttendance } from "@/components/learner";
import { StudentFrame } from "@/components/student-frame";

export default function Page() {
  return <StudentFrame title="Davomat">{(s) => <LearnerAttendance student={s} />}</StudentFrame>;
}
