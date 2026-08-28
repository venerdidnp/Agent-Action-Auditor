from __future__ import annotations

import json
import logging
from datetime import datetime

from openai import OpenAI
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import PendingAction, engine
from app.core.risk import classify as classify_risk, reason as risk_reason, requires_approval
from app.core.tools import TOOL_DEFINITIONS, execute_tool_call

logger = logging.getLogger("agent.tools")

MAX_TOOL_ROUNDS = 5


def get_client() -> OpenAI:
    if not settings.groq_api_key:
        raise RuntimeError(
            "GROQ_API_KEY is not set. Copy backend/.env.example to backend/.env and fill it in."
        )
    return OpenAI(api_key=settings.groq_api_key, base_url=settings.groq_base_url)


def _log_tool_call(tc) -> None:
    name = tc.function.name
    args_raw = tc.function.arguments or ""
    try:
        args_obj = json.loads(args_raw) if args_raw else {}
    except json.JSONDecodeError:
        args_obj = args_raw
    logger.info("TOOL_CALL name=%s id=%s args=%s", name, tc.id, args_obj)
    print(f"[tool_call] {name}({args_raw})  id={tc.id}", flush=True)


def _log_tool_result(tool_call_id: str, result_str: str) -> None:
    try:
        result_obj = json.loads(result_str)
    except json.JSONDecodeError:
        result_obj = result_str
    logger.info("TOOL_RESULT id=%s result=%s", tool_call_id, result_obj)
    print(f"[tool_result] id={tool_call_id} -> {result_str}", flush=True)


def _try_parse_args(arguments: str | None) -> dict | str:
    if not arguments:
        return {}
    try:
        return json.loads(arguments)
    except json.JSONDecodeError:
        return arguments


def _try_parse_result(result_str: str):
    try:
        return json.loads(result_str)
    except json.JSONDecodeError:
        return result_str


def _park_high_risk_action(tc, ai_explanation: str) -> tuple[str, dict, str]:
    """Save a high/medium-risk tool call to the DB without executing it.

    Returns ``(result_str, parsed_result, status)`` where ``status`` is
    ``"pending"``.
    """
    args_obj = _try_parse_args(tc.function.arguments)
    risk = classify_risk(tc.function.name)
    reason_text = risk_reason(tc.function.name, risk)
    explanation = (ai_explanation or "").strip() or (
        f"Agent requested to call `{tc.function.name}`."
    )

    with Session(engine) as session:
        pa = PendingAction(
            tool_call_id=tc.id,
            tool_name=tc.function.name,
            risk_level=risk,
            reason=reason_text,
            arguments_json=json.dumps(args_obj, ensure_ascii=False)
            if not isinstance(args_obj, str)
            else args_obj,
            ai_explanation=explanation,
            status="pending",
        )
        session.add(pa)
        session.commit()
        session.refresh(pa)
        pending_id = pa.id

    result_obj = {
        "status": "pending_approval",
        "message": (
            f"Action `{tc.function.name}` is {risk} risk and requires human "
            f"approval before execution. See the approval queue."
        ),
        "pending_action_id": pending_id,
    }
    return json.dumps(result_obj, ensure_ascii=False), result_obj, "pending"


def chat(messages: list[dict], system: str | None = None) -> str:
    client = get_client()
    full_messages: list[dict] = []
    if system:
        full_messages.append({"role": "system", "content": system})
    full_messages.extend(messages)

    response = client.chat.completions.create(
        model=settings.groq_model,
        max_tokens=1024,
        messages=full_messages,
        tools=TOOL_DEFINITIONS,
        tool_choice="auto",
    )

    rounds = 0
    while response.choices[0].message.tool_calls and rounds < MAX_TOOL_ROUNDS:
        rounds += 1
        assistant_msg = response.choices[0].message
        full_messages.append(
            {
                "role": "assistant",
                "content": assistant_msg.content or "",
                "tool_calls": [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {
                            "name": tc.function.name,
                            "arguments": tc.function.arguments or "",
                        },
                    }
                    for tc in assistant_msg.tool_calls
                ],
            }
        )

        for tc in assistant_msg.tool_calls:
            _log_tool_call(tc)
            risk = classify_risk(tc.function.name)
            if requires_approval(risk):
                result_str, _, _ = _park_high_risk_action(
                    tc, assistant_msg.content or ""
                )
            else:
                result_str = execute_tool_call(tc.function.name, tc.function.arguments or "")
            _log_tool_result(tc.id, result_str)
            full_messages.append(
                {
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": result_str,
                }
            )

        response = client.chat.completions.create(
            model=settings.groq_model,
            max_tokens=1024,
            messages=full_messages,
            tools=TOOL_DEFINITIONS,
            tool_choice="auto",
        )

    return response.choices[0].message.content or ""


def chat_with_trace(messages: list[dict], system: str | None = None) -> dict:
    """Same as `chat` but also returns a list of tool-call events for the API layer."""
    client = get_client()
    full_messages: list[dict] = []
    if system:
        full_messages.append({"role": "system", "content": system})
    full_messages.extend(messages)

    tool_events: list[dict] = []

    response = client.chat.completions.create(
        model=settings.groq_model,
        max_tokens=1024,
        messages=full_messages,
        tools=TOOL_DEFINITIONS,
        tool_choice="auto",
    )

    rounds = 0
    while response.choices[0].message.tool_calls and rounds < MAX_TOOL_ROUNDS:
        rounds += 1
        assistant_msg = response.choices[0].message
        full_messages.append(
            {
                "role": "assistant",
                "content": assistant_msg.content or "",
                "tool_calls": [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {
                            "name": tc.function.name,
                            "arguments": tc.function.arguments or "",
                        },
                    }
                    for tc in assistant_msg.tool_calls
                ],
            }
        )

        for tc in assistant_msg.tool_calls:
            _log_tool_call(tc)
            risk = classify_risk(tc.function.name)
            args_obj = _try_parse_args(tc.function.arguments)

            if requires_approval(risk):
                result_str, result_obj, event_status = _park_high_risk_action(
                    tc, assistant_msg.content or ""
                )
            else:
                result_str = execute_tool_call(tc.function.name, tc.function.arguments or "")
                result_obj = _try_parse_result(result_str)
                event_status = "executed"

            _log_tool_result(tc.id, result_str)

            tool_events.append(
                {
                    "id": tc.id,
                    "name": tc.function.name,
                    "arguments": args_obj,
                    "result": result_obj,
                    "risk_level": risk,
                    "status": event_status,
                }
            )

            full_messages.append(
                {
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": result_str,
                }
            )

        response = client.chat.completions.create(
            model=settings.groq_model,
            max_tokens=1024,
            messages=full_messages,
            tools=TOOL_DEFINITIONS,
            tool_choice="auto",
        )

    final = response.choices[0].message.content or ""
    return {"reply": final, "tool_events": tool_events, "rounds": rounds}


def execute_approved_action(pending_id: int) -> dict:
    """Run a previously-pending tool call for real and mark it as approved.

    Returns the ``PendingAction.to_dict()`` representation on success, or a
    dict like ``{"error": "not_found"}`` / ``{"error": "already_resolved",
    "status": "..."}`` on failure.
    """
    with Session(engine) as session:
        pa = session.get(PendingAction, pending_id)
        if pa is None:
            return {"error": "not_found"}
        if pa.status != "pending":
            return {"error": "already_resolved", "status": pa.status}

        args_json = pa.arguments_json or "{}"
        result_str = execute_tool_call(pa.tool_name, args_json)
        result_obj = _try_parse_result(result_str)

        pa.status = "approved"
        pa.resolved_at = datetime.utcnow()
        pa.result_json = (
            json.dumps(result_obj, ensure_ascii=False)
            if not isinstance(result_obj, str)
            else result_obj
        )
        session.commit()
        session.refresh(pa)
        data = pa.to_dict()
        data["confirmation"] = _build_confirmation(
            pa.tool_name, pa.arguments_json, result_obj
        )
        return data


def _build_confirmation(tool_name: str, args_json: str, result_obj) -> str:
    """Build a short, human-readable summary of an executed action."""
    try:
        args = json.loads(args_json) if args_json else {}
    except json.JSONDecodeError:
        args = {}

    if tool_name == "send_email":
        to = args.get("to", "?")
        subject = args.get("subject", "")
        msg_id = ""
        if isinstance(result_obj, dict):
            inner = result_obj.get("message") or {}
            if isinstance(inner, dict):
                msg_id = inner.get("id", "")
        return f"Email berhasil dikirim ke {to}" + (
            f" (subjek: \"{subject}\")" if subject else ""
        ) + (f" — id: {msg_id}" if msg_id else "")

    if tool_name == "delete_file":
        filename = args.get("filename", "?")
        deleted = False
        if isinstance(result_obj, dict):
            inner = result_obj.get("result") or {}
            if isinstance(inner, dict):
                deleted = inner.get("deleted", False)
        return (
            f"File {filename} berhasil dihapus."
            if deleted
            else f"File {filename} tidak ditemukan, tidak ada yang dihapus."
        )

    if tool_name == "check_inbox":
        count = result_obj.get("count", 0) if isinstance(result_obj, dict) else 0
        return f"Ditemukan {count} email di inbox."

    return f"Aksi `{tool_name}` berhasil dieksekusi."


def reject_pending_action(pending_id: int) -> dict:
    """Mark a pending action as rejected without executing it."""
    with Session(engine) as session:
        pa = session.get(PendingAction, pending_id)
        if pa is None:
            return {"error": "not_found"}
        if pa.status != "pending":
            return {"error": "already_resolved", "status": pa.status}

        pa.status = "rejected"
        pa.resolved_at = datetime.utcnow()
        pa.result_json = json.dumps(
            {"status": "rejected", "message": "Rejected by user."},
            ensure_ascii=False,
        )
        session.commit()
        session.refresh(pa)
        return pa.to_dict()
