import logging

from fastapi import APIRouter, HTTPException

from app.core import groq_client
from app.core.config import settings
from app.schemas import ChatRequest, ChatResponse, ToolEvent

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
    "tool result, summarize it concisely for the user."
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
