"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { homeFor } from "@/components/shell";
import { PageSkeleton } from "@/components/ui";
import { useApp } from "@/lib/data/store";

export default function Home() {
  const app = useApp();
  const router = useRouter();
  const user = app.currentUser;
  useEffect(() => {
    router.replace(user ? homeFor(user.role) : "/login");
  }, [user, router]);
  return <PageSkeleton />;
}
