"use client";

import { Payments } from "@/components/payments-view";
import { StudentFrame } from "@/components/student-frame";

/** Katta yoshli tinglovchi (o'quv markazi) o'z to'lovlarini o'zi ko'radi va to'laydi. */
export default function Page() {
  return <StudentFrame title="To'lovlar">{(s) => <Payments student={s} />}</StudentFrame>;
}
