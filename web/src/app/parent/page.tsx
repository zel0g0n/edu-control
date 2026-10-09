"use client";

import { LearnerHome } from "@/components/learner";
import { ParentFrame } from "@/components/parent-frame";

export default function ParentHome() {
  return <ParentFrame title="Bosh sahifa">{(s) => <LearnerHome student={s} base="/parent" showPayments />}</ParentFrame>;
}
