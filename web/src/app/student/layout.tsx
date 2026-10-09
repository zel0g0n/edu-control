"use client";

import { AppShell } from "@/components/shell";

export default function StudentLayout({ children }: LayoutProps<"/student">) {
  return <AppShell role="student">{children}</AppShell>;
}
