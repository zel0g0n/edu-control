"use client";

import { AppShell } from "@/components/shell";

export default function ParentLayout({ children }: LayoutProps<"/parent">) {
  return <AppShell role="parent">{children}</AppShell>;
}
