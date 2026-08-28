import logging

from fastapi import APIRouter, HTTPException

from app.core import groq_client
from app.core.config import settings
from app.core.db import list_pending_actions
from app.schemas import (
    ApprovalResult,
    ChatRequest,
    ChatResponse,
    PendingActionOut,
    ToolEvent,
)

router = APIRouter()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)

SYSTEM_PROMPT = (
    "You are a helpful AI agent whose actions are supervised by the "
    "Agent Action Auditor. You have access to tools (check_inbox, send_email, "
    "delete_file). Whenever the user asks for an action that a tool can perform, "
    "you MUST call the tool instead of answering with prose. After receiving the "
    "tool result, summarize it concisely for the user. NOTE: high-risk tool calls "
    "(send_email, delete_file) are NOT executed immediately — they are parked for "
    "human approval. When you receive a tool result with status 'pending_approval', "
    "tell the user the action is awaiting their approval in the queue and do NOT "
    "claim it was sent or executed."
)


@router.post("/chat", response_model=ChatResponse)
def chat(request: ChatRequest) -> ChatResponse:
    if not request.message.strip():
        raise HTTPException(status_code=422, detail="message must not be empty")
    try:
        result = groq_client.chat_with_trace(
            messages=[{"role": "user", "content": request.message}],
            system=SYSTEM_PROMPT,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Groq API error: {exc}") from exc

    return ChatResponse(
        reply=result["reply"],
        model=settings.groq_model,
        tool_events=[ToolEvent(**ev) for ev in result["tool_events"]],
        tool_rounds=result["rounds"],
    )


@router.get("/pending", response_model=list[PendingActionOut])
def get_pending() -> list[PendingActionOut]:
    rows = list_pending_actions()
    return [PendingActionOut(**r.to_dict()) for r in rows]


@router.post("/pending/{pending_id}/approve", response_model=ApprovalResult)
def approve_pending(pending_id: int) -> ApprovalResult:
    data = groq_client.execute_approved_action(pending_id)
    if data.get("error") == "not_found":
        raise HTTPException(status_code=404, detail="pending action not found")
    if data.get("error") == "already_resolved":
        raise HTTPException(
            status_code=409,
            detail=f"action already {data['status']}",
        )
    return ApprovalResult(
        pending=PendingActionOut(**data),
        message=f"Approved and executed `{data['tool_name']}`.",
        confirmation=data.get("confirmation"),
    )


@router.post("/pending/{pending_id}/reject", response_model=ApprovalResult)
def reject_pending(pending_id: int) -> ApprovalResult:
    data = groq_client.reject_pending_action(pending_id)
    if data.get("error") == "not_found":
        raise HTTPException(status_code=404, detail="pending action not found")
    if data.get("error") == "already_resolved":
        raise HTTPException(
            status_code=409,
            detail=f"action already {data['status']}",
        )
    tool_name = data.get("tool_name", "?")
    return ApprovalResult(
        pending=PendingActionOut(**data),
        message=f"Rejected `{tool_name}` — tool was NOT executed.",
        confirmation=f"Aksi `{tool_name}` ditolak. Tidak ada yang dieksekusi.",
    )
