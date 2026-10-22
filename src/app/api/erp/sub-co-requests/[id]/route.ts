import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, isPmLevel } from "@/lib/erpAuth";
import { cancelSubCoRequest, sendOnSubCoRequest, setSubCoAnswerByOffice, updateSubCoRequest, type SubCoUpdateInput } from "@/lib/erp/subCoRequestReview";

type Ctx = { params: Promise<{ id: string }> };

/** Office actions on a sub's change order request: update (prices, quantities, surcharge), send, cancel, answer. Admin, PM, Business Manager. */
export async function PATCH(req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isPmLevel(auth.role)) return NextResponse.json({ error: "Only Admin, Project Manager, or Business Manager can do this" }, { status: 403 });
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as ({ action?: string; reason?: string | null; answer?: string } & SubCoUpdateInput) | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const employee = await prisma.employee.findFirst({ where: { email: { equals: auth.email, mode: "insensitive" } }, select: { firstName: true, lastName: true } });
  const actor = employee ? `${employee.firstName} ${employee.lastName}`.trim() : auth.email;

  try {
    const result =
      body.action === "update"
        ? await updateSubCoRequest(id, actor, { lines: body.lines, surchargeId: body.surchargeId })
        : body.action === "send"
          ? await sendOnSubCoRequest(id, actor)
          : body.action === "cancel"
            ? await cancelSubCoRequest(id, actor, typeof body.reason === "string" ? body.reason : null)
            : body.action === "answer" && (body.answer === "APPROVED" || body.answer === "DENIED")
              ? await setSubCoAnswerByOffice(id, actor, body.answer, typeof body.reason === "string" ? body.reason : null)
              : { error: "Unknown action" };
    return "error" in result ? NextResponse.json(result, { status: result.error === "Not found" ? 404 : 400 }) : NextResponse.json(result);
  } catch (e) {
    console.error("PATCH /api/erp/sub-co-requests/[id]", e);
    return NextResponse.json({ error: "Save failed" }, { status: 500 });
  }
}
