import { reviewTimeOff } from "@/lib/erp/timeOffReview";

type Ctx = { params: Promise<{ id: string; timeOffId: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { id, timeOffId } = await ctx.params;
  return reviewTimeOff(req, { kind: "employee", personId: id, timeOffId });
}
