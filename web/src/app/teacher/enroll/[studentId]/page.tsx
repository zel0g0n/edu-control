import { Suspense } from "react";

import { PageSkeleton } from "@/components/ui";
import { EnrollClient } from "./enroll-client";

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <EnrollClient />
    </Suspense>
  );
}
