import { Suspense } from "react";

import { PageSkeleton } from "@/components/ui";
import { HomeworkClient } from "./homework-client";

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <HomeworkClient />
    </Suspense>
  );
}
