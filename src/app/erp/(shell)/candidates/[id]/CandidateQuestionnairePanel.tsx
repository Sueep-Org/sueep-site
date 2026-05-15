"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  id: string;
  email: string;
  questionnaireToken: string | null;
  questionnaireSentAt: string | null;
  questionnaireCompletedAt: string | null;
  googleFormConfigured: boolean;
  resendConfigured: boolean;
  webhookConfigured: boolean;
  siteUrl: string;
};

function formatDt(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function CandidateQuestionnairePanel(props: Props) {
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [marking, setMarking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendOk, setSendOk] = useState(false);

  const webhookUrl = `${props.siteUrl.replace(/\/$/, "")}/api/integrations/candidate-questionnaire`;

  async function sendQuestionnaire() {
    setSending(true);
    setError(null);
    setSendOk(false);
    const res = await fetch(`/api/erp/candidates/${props.id}/send-questionnaire`, { method: "POST" });
    setSending(false);
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setError(j.error || `Send failed (${res.status})`);
      return;
    }
    setSendOk(true);
    router.refresh();
    setTimeout(() => setSendOk(false), 3000);
  }

  async function markCompleteManual() {
    setMarking(true);
    setError(null);
    const res = await fetch(`/api/erp/candidates/${props.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionnaireCompleted: true }),
    });
    setMarking(false);
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setError(j.error || `Update failed (${res.status})`);
      return;
    }
    router.refresh();
  }

  const completed = Boolean(props.questionnaireCompletedAt);

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-100 p-5 space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Questionnaire (Google Form)</h2>
      <p className="text-xs text-zinc-400 leading-relaxed">
        Initial interest is captured from the website. When you select someone, send the questionnaire email — they open
        your Google Form using the personal link (and code). Completion updates this row via webhook or manual button
        below.
      </p>

      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-pink-500 text-xs">Questionnaire emailed</dt>
          <dd className="text-text-zinc-600">{formatDt(props.questionnaireSentAt)}</dd>
        </div>
        <div>
          <dt className="text-pink-500 text-xs">Questionnaire completed</dt>
          <dd className={completed ? "text-emerald-400 font-medium" : "text-zinc-400"}>
            {completed ? formatDt(props.questionnaireCompletedAt) : "Not yet"}
          </dd>
        </div>
      </dl>

      {props.questionnaireToken && (
        <div>
          <p className="text-xs text-zinc-500 mb-1">Applicant code (matches Google Form / webhook)</p>
          <code className="block break-all rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-xs text-zinc-200">
            {props.questionnaireToken}
          </code>
        </div>
      )}

      {!props.googleFormConfigured && (
        <p className="text-sm text-pink-400">
          Set <span className="font-mono text-xs">QUESTIONNAIRE_GOOGLE_FORM_URL</span> on the server (e.g. Vercel) before
          sending emails.
        </p>
      )}
      {!props.resendConfigured && (
        <p className="text-sm text-pink-400">
          <span className="font-mono text-xs">RESEND_API_KEY</span> is required to email applicants from the ERP.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void sendQuestionnaire()}
          disabled={sending || !props.googleFormConfigured || !props.resendConfigured}
          className="rounded-md bg-[#E73C6E] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
        >
          {sending ? "Sending…" : props.questionnaireSentAt ? "Resend questionnaire email" : "Send questionnaire email"}
        </button>
        <button
          type="button"
          onClick={() => void markCompleteManual()}
          disabled={marking || completed}
          className="rounded-md border border-pink-300 bg-pink-300 px-4 py-2 text-sm font-medium text-white hover:bg-pink-400 disabled:opacity-40"
        >
          {completed ? "Marked complete" : marking ? "Saving…" : "Mark complete (manual)"}
        </button>
      </div>

      {sendOk && <p className="text-sm text-emerald-400">Email sent to {props.email}</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}

      <details className="text-xs text-zinc-500 leading-relaxed border-t border-zinc-800 pt-4">
        <summary className="cursor-pointer text-zinc-400 hover:text-zinc-300">Automate “completed” from Google Forms</summary>
        <p className="mt-3">
          Add an Apps Script trigger on form submit. POST JSON{" "}
          <code className="text-zinc-400">{`{ "token": "<applicant code from response>" }`}</code> to:
        </p>
        <code className="mt-2 block break-all rounded bg-zinc-900 border border-zinc-800 p-2 text-zinc-300">{webhookUrl}</code>
        <p className="mt-2">
          Header <code className="text-zinc-400">x-sueep-webhook-secret</code>: same value as env{" "}
          <code className="text-zinc-400">CANDIDATE_QUESTIONNAIRE_WEBHOOK_SECRET</code>
          {props.webhookConfigured ? " (configured)." : " (not set on server yet)."}
        </p>
      </details>
    </div>
  );
}