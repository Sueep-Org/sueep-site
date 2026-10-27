"use client";

import { LienEditor } from "@/app/erp/components/LienEditor";
import { ProjectLienPacket } from "./ProjectLienPacket";

type Props = Omit<React.ComponentProps<typeof LienEditor>, "target" | "renderPacket"> & { projectId: string };

/** A post-construction job's Liens tab, with the attorney packet. */
export function ProjectLienEditor({ projectId, ...rest }: Props) {
  return (
    <LienEditor
      {...rest}
      target={{ kind: "project", id: projectId }}
      renderPacket={(onPrepared) => <ProjectLienPacket projectId={projectId} onPrepared={onPrepared} />}
    />
  );
}
