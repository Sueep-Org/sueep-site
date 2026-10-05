/** Badge per EmailLog status. */
export const STATUS_STYLE: Record<string, { label: string; cls: string; hint: string }> = {
  SENT: { label: "Sent", cls: "bg-emerald-50 text-emerald-700", hint: "Accepted by the email service" },
  FAILED: { label: "Failed", cls: "bg-red-100 text-red-700", hint: "The email service rejected it" },
  OFF: { label: "Turned off", cls: "bg-gray-100 text-gray-600", hint: "Not sent because this email is turned off" },
  SKIPPED: { label: "Not set up", cls: "bg-amber-50 text-amber-700", hint: "Not sent because email isn't set up on this server" },
};
