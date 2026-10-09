import { Suspense } from "react";

import { PageSkeleton } from "@/components/ui";
import { RollCallClient } from "./rollcall-client";

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <RollCallClient />
    </Suspense>
  );
}
