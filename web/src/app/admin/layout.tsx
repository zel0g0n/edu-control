"use client";

import { AppShell } from "@/components/shell";

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return <AppShell role="superAdmin">{children}</AppShell>;
}
