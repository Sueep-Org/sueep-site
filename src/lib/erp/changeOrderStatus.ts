/** How a change order status reads in dropdowns and sentences: "Draft", not "DRAFT". Safe to import on the client. */
export function changeOrderStatusLabel(status: string): string {
  return status ? status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, " ") : status;
}
