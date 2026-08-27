from pydantic import BaseModel


class ChatRequest(BaseModel):
    message: str


class ToolEvent(BaseModel):
    id: str
    name: str
    arguments: object
    result: object


class ChatResponse(BaseModel):
    reply: str
    model: str
    tool_events: list[ToolEvent] = []
    tool_rounds: int = 0
