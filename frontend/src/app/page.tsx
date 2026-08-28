"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  approvePending,
  listPending,
  PendingAction,
  rejectPending,
  sendChat,
  ToolEvent,
} from "@/lib/api";

type Message = {
  role: "user" | "assistant";
  content: string;
  pendingNotice?: string;
  resolutionNotice?: {
    kind: "approved" | "rejected";
    text: string;
  };
};

export default function HomePage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [pending, setPending] = useState<PendingAction[]>([]);
  const [pendingError, setPendingError] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<number | null>(null);
  const [justResolved, setJustResolved] = useState<Record<number, "approved" | "rejected">>({});

  const refreshPending = useCallback(async () => {
    try {
      const rows = await listPending();
      setPending(rows);
      setPendingError(null);
    } catch (err) {
      setPendingError(err instanceof Error ? err.message : "Failed to load pending actions");
    }
  }, []);

  useEffect(() => {
    refreshPending();
    const interval = setInterval(refreshPending, 3000);
    return () => clearInterval(interval);
  }, [refreshPending]);

  function pushResolutionNotice(kind: "approved" | "rejected", text: string) {
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: "", resolutionNotice: { kind, text } },
    ]);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = input.trim();
    if (!message || isLoading) return;

    setError(null);
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: message }]);
    setIsLoading(true);

    try {
      const response = await sendChat(message);
      const pendingNotice = buildPendingNotice(response.tool_events);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: response.reply, pendingNotice },
      ]);
      refreshPending();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleApprove(id: number) {
    setResolvingId(id);
    setPendingError(null);
    try {
      const res = await approvePending(id);
      pushResolutionNotice(
        "approved",
        res.confirmation ?? res.message ?? "Aksi disetujui dan dieksekusi.",
      );
      setJustResolved((prev) => ({ ...prev, [id]: "approved" }));
      window.setTimeout(() => {
        setJustResolved((prev) => {
          const { [id]: _, ...rest } = prev;
          return rest;
        });
      }, 5000);
      await refreshPending();
    } catch (err) {
      setPendingError(err instanceof Error ? err.message : "Approve failed");
    } finally {
      setResolvingId(null);
    }
  }

  async function handleReject(id: number) {
    setResolvingId(id);
    setPendingError(null);
    try {
      const res = await rejectPending(id);
      pushResolutionNotice(
        "rejected",
        res.confirmation ?? res.message ?? "Aksi ditolak, tidak dieksekusi.",
      );
      setJustResolved((prev) => ({ ...prev, [id]: "rejected" }));
      window.setTimeout(() => {
        setJustResolved((prev) => {
          const { [id]: _, ...rest } = prev;
          return rest;
        });
      }, 5000);
      await refreshPending();
    } catch (err) {
      setPendingError(err instanceof Error ? err.message : "Reject failed");
    } finally {
      setResolvingId(null);
    }
  }

  return (
    <main className="mx-auto flex h-screen max-w-5xl flex-col px-4">
      <header className="border-b border-neutral-200 py-4 dark:border-neutral-800">
        <h1 className="text-xl font-semibold">Agent Action Auditor</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Chat with a supervised AI agent — high-risk actions wait for your approval.
        </p>
      </header>

      <div className="grid flex-1 gap-4 overflow-hidden py-4 lg:grid-cols-[1fr_360px]">
        <section className="flex flex-col overflow-hidden">
          <div className="flex-1 space-y-4 overflow-y-auto pr-1">
            {messages.length === 0 && (
              <p className="py-16 text-center text-sm text-neutral-500 dark:text-neutral-400">
                Send a message to start the conversation.
              </p>
            )}
            {messages.map((message, index) => (
              <div
                key={index}
                className={
                  message.role === "user"
                    ? "ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-blue-600 px-4 py-2 text-white"
                    : "mr-auto w-full max-w-[90%] whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-neutral-100 px-4 py-2 dark:bg-neutral-800"
                }
              >
                {message.content && <div>{message.content}</div>}
                {message.pendingNotice && (
                  <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
                    {message.pendingNotice}
                  </div>
                )}
                {message.resolutionNotice && (
                  <div
                    className={
                      message.resolutionNotice.kind === "approved"
                        ? "mt-2 flex items-start gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200"
                        : "mt-2 flex items-start gap-2 rounded-md border border-neutral-300 bg-neutral-200 px-3 py-2 text-xs text-neutral-800 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
                    }
                  >
                    <span className="text-base leading-none">
                      {message.resolutionNotice.kind === "approved" ? "✓" : "✗"}
                    </span>
                    <span>{message.resolutionNotice.text}</span>
                  </div>
                )}
              </div>
            ))}
            {isLoading && (
              <div className="mr-auto w-fit rounded-2xl rounded-bl-sm bg-neutral-100 px-4 py-2 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                Thinking…
              </div>
            )}
          </div>

          {error && (
            <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950 dark:text-red-400">
              {error}
            </p>
          )}

          <form
            onSubmit={handleSubmit}
            className="mt-2 flex gap-2 border-t border-neutral-200 py-3 dark:border-neutral-800"
          >
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Type a message…"
              disabled={isLoading}
              className="flex-1 rounded-full border border-neutral-300 bg-transparent px-4 py-2 outline-none focus:border-blue-500 disabled:opacity-50 dark:border-neutral-700"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="rounded-full bg-blue-600 px-5 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </section>

        <aside className="flex flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
            <div>
              <h2 className="text-sm font-semibold">Approval Queue</h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                High-risk actions waiting for your decision
              </p>
            </div>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900 dark:text-amber-200">
              {pending.length}
            </span>
          </div>

          {Object.entries(justResolved).length > 0 && (
            <div className="space-y-1 border-b border-neutral-200 px-3 py-2 text-[11px] dark:border-neutral-800">
              {Object.entries(justResolved).map(([id, kind]) => (
                <p
                  key={id}
                  className={
                    kind === "approved"
                      ? "rounded-md bg-emerald-50 px-2 py-1 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                      : "rounded-md bg-neutral-200 px-2 py-1 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                  }
                >
                  {kind === "approved" ? "✓" : "✗"} #{id} {kind === "approved" ? "disetujui" : "ditolak"}
                </p>
              ))}
            </div>
          )}

          <div className="flex-1 space-y-3 overflow-y-auto p-3">
            {pendingError && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950 dark:text-red-400">
                {pendingError}
              </p>
            )}
            {pending.length === 0 && !pendingError && (
              <p className="py-8 text-center text-xs text-neutral-500 dark:text-neutral-400">
                Nothing pending. You&apos;re all caught up.
              </p>
            )}
            {pending.map((action) => (
              <article
                key={action.id}
                className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-xs dark:border-amber-800 dark:bg-amber-950/40"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-mono text-[11px] font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-200">
                    {action.tool_name}
                  </span>
                  <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-900 dark:bg-amber-800 dark:text-amber-100">
                    {action.risk_level}
                  </span>
                </div>
                <p className="mb-2 text-neutral-700 dark:text-neutral-300">
                  {action.reason}
                </p>
                <pre className="mb-2 max-h-40 overflow-auto rounded-md bg-neutral-900/90 p-2 font-mono text-[11px] text-neutral-100">
                  {JSON.stringify(action.arguments, null, 2)}
                </pre>
                {action.ai_explanation && (
                  <p className="mb-2 italic text-neutral-600 dark:text-neutral-400">
                    &ldquo;{action.ai_explanation}&rdquo;
                  </p>
                )}
                <p className="mb-3 text-[10px] text-neutral-500 dark:text-neutral-400">
                  Requested at {action.created_at}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleApprove(action.id)}
                    disabled={resolvingId === action.id}
                    className="flex-1 rounded-md bg-emerald-600 px-3 py-1.5 font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {resolvingId === action.id ? "…" : "Setujui"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReject(action.id)}
                    disabled={resolvingId === action.id}
                    className="flex-1 rounded-md bg-neutral-700 px-3 py-1.5 font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
                  >
                    Tolak
                  </button>
                </div>
              </article>
            ))}
          </div>
        </aside>
      </div>
    </main>
  );
}

function buildPendingNotice(events: ToolEvent[]): string | undefined {
  const pending = events.filter((e) => e.status === "pending");
  if (pending.length === 0) return undefined;
  const names = pending.map((e) => `\`${e.name}\``).join(", ");
  return `⏸️ ${names} menunggu persetujuanmu — lihat panel "Approval Queue" di kanan.`;
}
