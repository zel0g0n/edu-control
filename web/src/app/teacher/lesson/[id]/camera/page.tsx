import { Suspense } from "react";

import { PageSkeleton } from "@/components/ui";
import { CameraClient } from "./camera-client";

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <CameraClient />
    </Suspense>
  );
}
