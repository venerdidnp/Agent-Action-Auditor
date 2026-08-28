from pydantic import BaseModel


class ChatRequest(BaseModel):
    message: str


class ToolEvent(BaseModel):
    id: str
    name: str
    arguments: object
    result: object
    risk_level: str | None = None
    status: str | None = None  # "executed" | "pending"


class ChatResponse(BaseModel):
    reply: str
    model: str
    tool_events: list[ToolEvent] = []
    tool_rounds: int = 0


class PendingActionOut(BaseModel):
    id: int
    tool_call_id: str | None = None
    tool_name: str
    risk_level: str
    reason: str = ""
    arguments: object = {}
    ai_explanation: str = ""
    status: str
    created_at: str | None = None
    resolved_at: str | None = None
    result: object | None = None
    confirmation: str | None = None


class ApprovalResult(BaseModel):
    pending: PendingActionOut
    message: str
    confirmation: str | None = None
