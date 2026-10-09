import { Suspense } from "react";

import { PageSkeleton } from "@/components/ui";
import { LessonClient } from "./lesson-client";

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <LessonClient />
    </Suspense>
  );
}
