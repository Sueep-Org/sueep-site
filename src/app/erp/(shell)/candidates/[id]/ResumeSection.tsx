import { prisma } from "@/lib/prisma";
import { RESUME_LABEL } from "@/lib/erp/candidateResume";
import { ResumeUploader, type ResumeFile } from "./ResumeUploader";

/** Resume tab on a candidate: files staff uploaded, newest first. */
export async function ResumeSection({ candidateId }: { candidateId: string }) {
  const docs = await prisma.candidateDocument.findMany({
    where: { candidateApplicationId: candidateId, label: RESUME_LABEL },
    select: { id: true, filename: true, size: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  const files: ResumeFile[] = docs.map((d) => ({
    id: d.id,
    filename: d.filename,
    size: d.size,
    createdAt: d.createdAt.toISOString(),
  }));
  return <ResumeUploader candidateId={candidateId} files={files} />;
}
