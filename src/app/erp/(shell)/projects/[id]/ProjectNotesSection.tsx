"use client";

import { useState } from "react";

export type ProjectNoteRow = {
  id: string;
  body: string;
  createdAt: string;
  authorName: string;
  authorUserId: string | null;
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ProjectNotesSection({
  projectId,
  initialNotes,
  currentUserId,
}: {
  projectId: string;
  initialNotes: ProjectNoteRow[];
  currentUserId: string | null;
}) {
  const [notes, setNotes] = useState(initialNotes);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [savingEditId, setSavingEditId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function postNote(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!draft.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/erp/projects/${projectId}/notes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: draft.trim() }),
      });
      const data = (await res.json()) as ProjectNoteRow & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed to post note");
        return;
      }
      setNotes((prev) => [data, ...prev]);
      setDraft("");
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(note: ProjectNoteRow) {
    setEditingId(note.id);
    setEditDraft(note.body);
  }

  async function saveEdit(noteId: string) {
    if (!editDraft.trim()) return;
    setSavingEditId(noteId);
    try {
      const res = await fetch(`/api/erp/projects/${projectId}/notes/${noteId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: editDraft.trim() }),
      });
      const data = (await res.json()) as ProjectNoteRow & { error?: string };
      if (res.ok) {
        setNotes((prev) => prev.map((n) => (n.id === noteId ? data : n)));
        setEditingId(null);
      }
    } finally {
      setSavingEditId(null);
    }
  }

  async function deleteNote(noteId: string) {
    setDeletingId(noteId);
    try {
      const res = await fetch(`/api/erp/projects/${projectId}/notes/${noteId}`, { method: "DELETE" });
      if (res.ok) setNotes((prev) => prev.filter((n) => n.id !== noteId));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="mb-4 rounded-md border border-gray-200 bg-white p-3">
      <p className="text-[10px] uppercase text-gray-500">Notes</p>

      <form onSubmit={postNote} className="mt-2 space-y-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a note the whole team can see…"
          rows={2}
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
        />
        {error && <p className="text-xs text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={submitting || !draft.trim()}
          className="rounded-md bg-pink-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-pink-500 disabled:opacity-40"
        >
          {submitting ? "Posting…" : "Post note"}
        </button>
      </form>

      {notes.length > 0 && (
        <ul className="mt-3 space-y-3 border-t border-gray-100 pt-3">
          {notes.map((note) => {
            const isOwn = currentUserId != null && note.authorUserId === currentUserId;
            return (
              <li key={note.id} className="text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-medium text-gray-900">{note.authorName}</p>
                  <p className="text-xs text-gray-400">{formatDateTime(note.createdAt)}</p>
                </div>
                {editingId === note.id ? (
                  <div className="mt-1 space-y-2">
                    <textarea
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      rows={2}
                      className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => saveEdit(note.id)}
                        disabled={savingEditId === note.id}
                        className="rounded-md bg-pink-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-pink-500 disabled:opacity-50"
                      >
                        {savingEditId === note.id ? "Saving…" : "Save"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="mt-0.5 whitespace-pre-line text-gray-700">{note.body}</p>
                    {isOwn && (
                      <div className="mt-1 flex gap-3">
                        <button type="button" onClick={() => startEdit(note)} className="text-xs text-gray-500 hover:text-pink-600 hover:underline">
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteNote(note.id)}
                          disabled={deletingId === note.id}
                          className="text-xs text-gray-500 hover:text-red-600 hover:underline disabled:opacity-50"
                        >
                          {deletingId === note.id ? "Deleting…" : "Delete"}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
