/**
 * Which Email Log rows belong to a project. Every email about a project is
 * logged with `link` set to that project's ERP page (or a page under it),
 * so the link is what ties them together.
 */

import type { Prisma } from "@prisma/client";

/** Emails about any project. */
export const PROJECT_EMAILS: Prisma.EmailLogWhereInput = { link: { startsWith: "/erp/projects/" } };

/** Emails about one project. */
export function projectEmailsWhere(projectId: string): Prisma.EmailLogWhereInput {
  const page = `/erp/projects/${projectId}`;
  return { OR: [{ link: page }, { link: { startsWith: `${page}/` } }, { link: { startsWith: `${page}?` } }] };
}
