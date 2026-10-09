"use client";

import { AppShell } from "@/components/shell";

export default function DirectorLayout({ children }: LayoutProps<"/director">) {
  return <AppShell role="director">{children}</AppShell>;
}
