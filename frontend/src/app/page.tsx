"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
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

const SUGGESTIONS = [
  "Coba pindahkan 5000 ke tabungan darurat",
  "Lihat saldo rekening utama",
  "Buat transfer terjadwal bulanan",
  "Hapus langganan yang tidak terpakai",
];

function riskStyle(level: string) {
  const l = level.toLowerCase();
  if (l.includes("high")) {
    return {
      bg: "rgba(239, 111, 108, 0.10)",
      border: "rgba(239, 111, 108, 0.35)",
      text: "#ff8b88",
      dot: "#ef6f6c",
    };
  }
  if (l.includes("medium")) {
    return {
      bg: "rgba(245, 180, 84, 0.10)",
      border: "rgba(245, 180, 84, 0.35)",
      text: "#f5b454",
      dot: "#f5b454",
    };
  }
  return {
    bg: "rgba(62, 207, 142, 0.10)",
    border: "rgba(62, 207, 142, 0.35)",
    text: "#3ecf8e",
    dot: "#3ecf8e",
  };
}

function formatTime(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

export default function HomePage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [pending, setPending] = useState<PendingAction[]>([]);
  const [pendingError, setPendingError] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<number | null>(null);
  const [justResolved, setJustResolved] = useState<Record<number, "approved" | "rejected">>({});

  const chatScrollRef = useRef<HTMLDivElement>(null);
  const queueScrollRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    const node = chatScrollRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  }, [messages, isLoading]);

  const pendingCount = pending.length;
  const summary = useMemo(() => {
    const high = pending.filter((p) => p.risk_level.toLowerCase().includes("high")).length;
    const med = pending.filter((p) => p.risk_level.toLowerCase().includes("medium")).length;
    const low = pending.length - high - med;
    return { high, med, low };
  }, [pending]);

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
    <main className="mx-auto flex h-screen max-w-7xl flex-col px-4 sm:px-6 lg:px-8">
      <header className="flex items-center justify-between border-b border-[var(--border)] py-5">
        <div className="flex items-center gap-3">
          <div
            className="grid h-10 w-10 place-items-center rounded-xl"
            style={{
              background:
                "linear-gradient(135deg, rgba(124,140,255,0.25), rgba(62,207,142,0.18))",
              border: "1px solid var(--border-strong)",
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ color: "var(--accent)" }}
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <path d="m9 12 2 2 4-4" />
            </svg>
          </div>
          <div>
            <h1 className="text-base font-semibold tracking-tight text-[var(--fg)]">
              Agent Action Auditor
            </h1>
            <p className="text-xs text-[var(--fg-muted)]">
              Supervised AI · high-risk actions wait for your approval
            </p>
          </div>
        </div>

        <div className="hidden items-center gap-2 sm:flex">
          <StatusPill label="Live" dotColor="#3ecf8e" />
          <StatusPill
            label={`${pendingCount} pending`}
            dotColor={pendingCount > 0 ? "#f5b454" : "#5a6577"}
          />
        </div>
      </header>

      <div className="grid flex-1 gap-5 overflow-hidden py-5 lg:grid-cols-[1fr_400px]">
        <section className="glass flex flex-col overflow-hidden rounded-2xl">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-[var(--fg)]">Conversation</span>
              <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--accent)]">
                Live
              </span>
            </div>
            <span className="text-xs text-[var(--fg-muted)]">
              {messages.length} message{messages.length === 1 ? "" : "s"}
            </span>
          </div>

          <div
            ref={chatScrollRef}
            className="scrollbar-thin flex-1 space-y-4 overflow-y-auto px-5 py-5"
          >
            {messages.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center py-12 text-center">
                <div
                  className="mb-4 grid h-14 w-14 place-items-center rounded-2xl"
                  style={{
                    background: "var(--accent-soft)",
                    border: "1px solid var(--border-strong)",
                  }}
                >
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ color: "var(--accent)" }}
                  >
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-[var(--fg)]">
                  Start a conversation
                </p>
                <p className="mt-1 max-w-sm text-xs text-[var(--fg-muted)]">
                  Ask the agent to do something. Risky actions will be queued
                  for your approval before they execute.
                </p>
                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setInput(s)}
                      className="rounded-full border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1.5 text-xs text-[var(--fg-muted)] transition hover:border-[var(--accent)] hover:text-[var(--fg)]"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((message, index) => (
              <Bubble key={index} message={message} />
            ))}

            {isLoading && <ThinkingBubble />}
          </div>

          {error && (
            <div className="mx-5 mb-2 flex items-start gap-2 rounded-lg border border-[rgba(239,111,108,0.35)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[#ff8b88]">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mt-0.5 shrink-0"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            className="flex items-center gap-2 border-t border-[var(--border)] p-3"
          >
            <div className="flex flex-1 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2 transition focus-within:border-[var(--accent)]">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ color: "var(--fg-faint)" }}
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Ask the agent to do something…"
                disabled={isLoading}
                className="flex-1 bg-transparent text-sm text-[var(--fg)] outline-none placeholder:text-[var(--fg-faint)] disabled:opacity-50"
              />
              {input.trim() && !isLoading && (
                <kbd className="hidden rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] text-[var(--fg-faint)] sm:inline">
                  Enter ↵
                </kbd>
              )}
            </div>
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-medium text-white shadow-lg shadow-[rgba(124,140,255,0.25)] transition disabled:cursor-not-allowed disabled:opacity-40"
              style={{
                background:
                  "linear-gradient(180deg, var(--accent), var(--accent-strong))",
              }}
            >
              <span>Send</span>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </button>
          </form>
        </section>

        <aside className="glass flex flex-col overflow-hidden rounded-2xl">
          <div className="flex items-start justify-between border-b border-[var(--border)] px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-[var(--fg)]">
                Approval Queue
              </h2>
              <p className="mt-0.5 text-xs text-[var(--fg-muted)]">
                Risky actions awaiting your decision
              </p>
            </div>
            <div
              className="rounded-full px-2.5 py-1 text-xs font-semibold"
              style={{
                background: pendingCount > 0 ? "var(--warning-soft)" : "var(--bg-card)",
                color: pendingCount > 0 ? "var(--warning)" : "var(--fg-muted)",
                border:
                  pendingCount > 0
                    ? "1px solid rgba(245,180,84,0.35)"
                    : "1px solid var(--border)",
              }}
            >
              {pendingCount}
            </div>
          </div>

          {pendingCount > 0 && (
            <div className="grid grid-cols-3 gap-2 border-b border-[var(--border)] px-5 py-3">
              <RiskStat label="High" value={summary.high} color="#ef6f6c" />
              <RiskStat label="Medium" value={summary.med} color="#f5b454" />
              <RiskStat label="Low" value={summary.low} color="#3ecf8e" />
            </div>
          )}

          {Object.entries(justResolved).length > 0 && (
            <div className="space-y-1.5 border-b border-[var(--border)] px-5 py-3">
              {Object.entries(justResolved).map(([id, kind]) => (
                <p
                  key={id}
                  className="flex items-center gap-2 rounded-md px-2 py-1 text-[11px]"
                  style={{
                    background:
                      kind === "approved"
                        ? "var(--success-soft)"
                        : "var(--bg-card)",
                    color:
                      kind === "approved" ? "var(--success)" : "var(--fg-muted)",
                    border:
                      kind === "approved"
                        ? "1px solid rgba(62,207,142,0.30)"
                        : "1px solid var(--border)",
                  }}
                >
                  <span className="font-mono">#{id}</span>
                  <span className="font-medium">
                    {kind === "approved" ? "disetujui" : "ditolak"}
                  </span>
                </p>
              ))}
            </div>
          )}

          <div
            ref={queueScrollRef}
            className="scrollbar-thin flex-1 space-y-3 overflow-y-auto p-5"
          >
            {pendingError && (
              <div className="rounded-md border border-[rgba(239,111,108,0.35)] bg-[var(--danger-soft)] px-3 py-2 text-xs text-[#ff8b88]">
                {pendingError}
              </div>
            )}
            {pending.length === 0 && !pendingError && (
              <div className="flex h-full flex-col items-center justify-center py-10 text-center">
                <div
                  className="mb-3 grid h-12 w-12 place-items-center rounded-2xl"
                  style={{
                    background: "var(--success-soft)",
                    border: "1px solid rgba(62,207,142,0.30)",
                  }}
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ color: "var(--success)" }}
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-[var(--fg)]">
                  You&apos;re all caught up
                </p>
                <p className="mt-1 text-xs text-[var(--fg-muted)]">
                  Nothing pending. New risky actions will appear here.
                </p>
              </div>
            )}
            {pending.map((action) => (
              <PendingCard
                key={action.id}
                action={action}
                resolving={resolvingId === action.id}
                onApprove={handleApprove}
                onReject={handleReject}
              />
            ))}
          </div>
        </aside>
      </div>
    </main>
  );
}

function Bubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  return (
    <div className={`fade-up flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser ? "rounded-br-sm" : "rounded-bl-sm"
        }`}
        style={{
          background: isUser
            ? "linear-gradient(180deg, var(--accent), var(--accent-strong))"
            : "var(--bg-card)",
          color: isUser ? "#fff" : "var(--fg)",
          border: isUser ? "none" : "1px solid var(--border)",
        }}
      >
        {message.content && (
          <div className="whitespace-pre-wrap">{message.content}</div>
        )}
        {message.pendingNotice && (
          <div
            className="mt-2 flex items-start gap-2 rounded-md px-3 py-2 text-xs"
            style={{
              background: "var(--warning-soft)",
              border: "1px solid rgba(245,180,84,0.30)",
              color: "var(--warning)",
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mt-0.5 shrink-0"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span>{message.pendingNotice}</span>
          </div>
        )}
        {message.resolutionNotice && (
          <div
            className="mt-2 flex items-start gap-2 rounded-md px-3 py-2 text-xs"
            style={{
              background:
                message.resolutionNotice.kind === "approved"
                  ? "var(--success-soft)"
                  : "var(--bg-card-hover)",
              border:
                message.resolutionNotice.kind === "approved"
                  ? "1px solid rgba(62,207,142,0.30)"
                  : "1px solid var(--border)",
              color:
                message.resolutionNotice.kind === "approved"
                  ? "var(--success)"
                  : "var(--fg-muted)",
            }}
          >
            <span className="text-base leading-none">
              {message.resolutionNotice.kind === "approved" ? "✓" : "✗"}
            </span>
            <span>{message.resolutionNotice.text}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function ThinkingBubble() {
  return (
    <div className="fade-up flex justify-start">
      <div
        className="flex items-center gap-2 rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm"
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          color: "var(--fg-muted)",
        }}
      >
        <span className="dot-pulse flex gap-1">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--fg-muted)]" />
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--fg-muted)]" />
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--fg-muted)]" />
        </span>
        <span>Thinking…</span>
      </div>
    </div>
  );
}

function PendingCard({
  action,
  resolving,
  onApprove,
  onReject,
}: {
  action: PendingAction;
  resolving: boolean;
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
}) {
  const style = riskStyle(action.risk_level);
  return (
    <article
      className="fade-up rounded-xl p-4"
      style={{
        background: style.bg,
        border: `1px solid ${style.border}`,
      }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide"
          style={{
            background: "rgba(0,0,0,0.25)",
            color: style.text,
            border: `1px solid ${style.border}`,
          }}
        >
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: style.dot }}
          />
          {action.tool_name}
        </span>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
          style={{
            background: "rgba(0,0,0,0.25)",
            color: style.text,
            border: `1px solid ${style.border}`,
          }}
        >
          {action.risk_level}
        </span>
      </div>

      <p className="mb-3 text-xs leading-relaxed text-[var(--fg)]">
        {action.reason}
      </p>

      <pre className="mb-3 max-h-40 overflow-auto rounded-md border border-[var(--border)] bg-black/60 p-2.5 font-mono text-[11px] leading-relaxed text-[var(--fg)] scrollbar-thin">
        {JSON.stringify(action.arguments, null, 2)}
      </pre>

      {action.ai_explanation && (
        <p className="mb-3 border-l-2 border-[var(--accent)] pl-2 text-[11px] italic leading-relaxed text-[var(--fg-muted)]">
          &ldquo;{action.ai_explanation}&rdquo;
        </p>
      )}

      <div className="mb-3 flex items-center gap-1.5 text-[10px] text-[var(--fg-faint)]">
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        <span>{formatTime(action.created_at ?? "")}</span>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onApprove(action.id)}
          disabled={resolving}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-black transition disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: "var(--success)" }}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          {resolving ? "…" : "Setujui"}
        </button>
        <button
          type="button"
          onClick={() => onReject(action.id)}
          disabled={resolving}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-card)] px-3 py-2 text-xs font-semibold text-[var(--fg)] transition hover:bg-[var(--bg-card-hover)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
          {resolving ? "…" : "Tolak"}
        </button>
      </div>
    </article>
  );
}

function StatusPill({ label, dotColor }: { label: string; dotColor: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium text-[var(--fg-muted)]"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
      }}
    >
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: dotColor, boxShadow: `0 0 8px ${dotColor}` }}
      />
      {label}
    </span>
  );
}

function RiskStat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div
      className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-2.5 py-2 text-center"
    >
      <div className="text-base font-semibold" style={{ color }}>
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wider text-[var(--fg-faint)]">
        {label}
      </div>
    </div>
  );
}

function buildPendingNotice(events: ToolEvent[]): string | undefined {
  const pending = events.filter((e) => e.status === "pending");
  if (pending.length === 0) return undefined;
  const names = pending.map((e) => `\`${e.name}\``).join(", ");
  return `${names} menunggu persetujuanmu — lihat panel "Approval Queue" di kanan.`;
}