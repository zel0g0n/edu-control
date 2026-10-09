"use client";

import { LearnerHomeworkList } from "@/components/learner";
import { StudentFrame } from "@/components/student-frame";

export default function Page() {
  return <StudentFrame title="Vazifalar">{(s) => <LearnerHomeworkList student={s} hrefFor={(h) => `/student/homework/${h.id}`} />}</StudentFrame>;
}
