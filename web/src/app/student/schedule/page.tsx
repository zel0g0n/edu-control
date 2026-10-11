"use client";

import { WeekSchedule } from "@/components/learner";
import { StudentFrame } from "@/components/student-frame";

export default function Page() {
  return <StudentFrame title="Dars jadvali">{(s) => <WeekSchedule student={s} />}</StudentFrame>;
}
