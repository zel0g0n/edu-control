import { Suspense } from "react";

import { PageSkeleton } from "@/components/ui";
import { StudentClient } from "./student-client";

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <StudentClient />
    </Suspense>
  );
}
