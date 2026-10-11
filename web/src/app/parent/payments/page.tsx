"use client";

import { ParentFrame } from "@/components/parent-frame";
import { Payments } from "@/components/payments-view";

export default function Page() {
  return <ParentFrame title="To'lovlar">{(s) => <Payments student={s} />}</ParentFrame>;
}
