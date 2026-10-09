import { Suspense } from "react";

import { PageSkeleton } from "@/components/ui";
import { ClassClient } from "./class-client";

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ClassClient />
    </Suspense>
  );
}
