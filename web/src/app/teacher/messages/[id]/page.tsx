import { Suspense } from "react";

import { ThreadPage } from "@/components/thread-page";
import { PageSkeleton } from "@/components/ui";

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ThreadPage back="/teacher/messages" />
    </Suspense>
  );
}
