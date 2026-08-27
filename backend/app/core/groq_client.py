from __future__ import annotations

import json
import logging

from openai import OpenAI

from app.core.config import settings
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
            result_str = execute_tool_call(tc.function.name, tc.function.arguments or "")
            _log_tool_result(tc.id, result_str)

            try:
                result_obj = json.loads(result_str)
            except json.JSONDecodeError:
                result_obj = result_str
            try:
                args_obj = json.loads(tc.function.arguments) if tc.function.arguments else {}
            except json.JSONDecodeError:
                args_obj = tc.function.arguments

            tool_events.append(
                {
                    "id": tc.id,
                    "name": tc.function.name,
                    "arguments": args_obj,
                    "result": result_obj,
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
