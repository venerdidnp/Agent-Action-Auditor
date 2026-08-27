from fastapi import APIRouter, HTTPException

from app.core import groq_client
from app.core.config import settings
from app.schemas import ChatRequest, ChatResponse

router = APIRouter()

SYSTEM_PROMPT = (
    "You are a helpful AI agent whose actions are supervised by the "
    "Agent Action Auditor. Be concise."
)


@router.post("/chat", response_model=ChatResponse)
def chat(request: ChatRequest) -> ChatResponse:
    if not request.message.strip():
        raise HTTPException(status_code=422, detail="message must not be empty")
    try:
        reply = groq_client.chat(
            messages=[{"role": "user", "content": request.message}],
            system=SYSTEM_PROMPT,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Groq API error: {exc}") from exc
    return ChatResponse(reply=reply, model=settings.groq_model)
