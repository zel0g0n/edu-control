"use client";

import { ThreadView, useThreadTitle } from "./inbox";
import { useRouteParam } from "./route-param";
import { PageBody, PageHeader } from "./shell";

export function ThreadPage({ back }: { back: string }) {
  const id = useRouteParam("id");
  const { title, subtitle } = useThreadTitle({ threadId: id });
  return (
    <>
      <PageHeader back={back} title={title} subtitle={subtitle} />
      <PageBody className="max-w-3xl"><ThreadView threadId={id} /></PageBody>
    </>
  );
}
