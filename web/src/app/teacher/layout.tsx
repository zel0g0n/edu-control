"use client";

import { AppShell } from "@/components/shell";

export default function TeacherLayout({ children }: LayoutProps<"/teacher">) {
  return <AppShell role="teacher">{children}</AppShell>;
}
