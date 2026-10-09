import { Suspense } from "react";

import { PageSkeleton } from "@/components/ui";
import { HomeworkReviewClient } from "./review-client";

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <HomeworkReviewClient />
    </Suspense>
  );
}
