const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface ToolEvent {
  id: string;
  name: string;
  arguments: unknown;
  result: unknown;
  risk_level?: string;
  status?: string;
}

export interface ChatResponse {
  reply: string;
  model: string;
  tool_events: ToolEvent[];
  tool_rounds: number;
}

export interface PendingAction {
  id: number;
  tool_call_id?: string | null;
  tool_name: string;
  risk_level: string;
  reason: string;
  arguments: unknown;
  ai_explanation: string;
  status: string;
  created_at?: string | null;
  resolved_at?: string | null;
  result?: unknown;
  confirmation?: string | null;
}

export interface ApprovalResult {
  pending: PendingAction;
  message: string;
  confirmation?: string | null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(
      (body as { detail?: string } | null)?.detail ??
        `Request failed with status ${res.status}`,
    );
  }
  return res.json() as Promise<T>;
}

export function sendChat(message: string): Promise<ChatResponse> {
  return request<ChatResponse>("/api/chat", {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

export function listPending(): Promise<PendingAction[]> {
  return request<PendingAction[]>("/api/pending", { method: "GET" });
}

export function approvePending(id: number): Promise<ApprovalResult> {
  return request<ApprovalResult>(`/api/pending/${id}/approve`, { method: "POST" });
}

export function rejectPending(id: number): Promise<ApprovalResult> {
  return request<ApprovalResult>(`/api/pending/${id}/reject`, { method: "POST" });
}
