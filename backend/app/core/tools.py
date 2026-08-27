from __future__ import annotations

import json
import os
from pathlib import Path

SANDBOX_DIR = Path(__file__).resolve().parent.parent / "sandbox"
SANDBOX_DIR.mkdir(parents=True, exist_ok=True)

DUMMY_INBOX: list[dict] = [
    {
        "id": "msg-001",
        "from": "klien@acme-corp.com",
        "subject": "Konfirmasi meeting proyek Aurora",
        "preview": "Halo, apakah kita bisa jadwalkan meeting Kamis jam 14:00?",
        "received_at": "2026-08-27T08:12:00Z",
        "unread": True,
    },
    {
        "id": "msg-002",
        "from": "billing@saas-vendor.com",
        "subject": "Invoice #INV-8821 sudah jatuh tempo",
        "preview": "Tagihan bulan ini sebesar $49.99 akan jatuh tempo pada 30 Agustus.",
        "received_at": "2026-08-27T07:45:00Z",
        "unread": True,
    },
    {
        "id": "msg-003",
        "from": "team-newsletter@startup.io",
        "subject": "Weekly digest: 5 artikel pilihan minggu ini",
        "preview": "1. State of AI Agents 2026 ... 2. Tool-use best practices ...",
        "received_at": "2026-08-26T18:00:00Z",
        "unread": False,
    },
]


SENT_EMAILS: list[dict] = []
DELETED_FILES: list[dict] = []


def check_inbox() -> dict:
    """Return the user's inbox contents (mocked)."""
    return {
        "count": len(DUMMY_INBOX),
        "emails": DUMMY_INBOX,
    }


def send_email(to: str, subject: str, body: str) -> dict:
    """Simulate sending an email."""
    record = {
        "id": f"sent-{len(SENT_EMAILS) + 1:03d}",
        "to": to,
        "subject": subject,
        "body": body,
    }
    SENT_EMAILS.append(record)
    return {"status": "queued", "message": record}


def delete_file(filename: str) -> dict:
    """Simulate deleting a file inside the sandbox directory."""
    target = SANDBOX_DIR / filename
    existed = target.exists()
    deleted = False
    if existed:
        try:
            target.unlink()
            deleted = True
        except OSError as exc:
            return {"status": "error", "error": str(exc), "path": str(target)}
    record = {
        "filename": filename,
        "path": str(target),
        "existed": existed,
        "deleted": deleted,
    }
    DELETED_FILES.append(record)
    return {"status": "ok", "result": record}


def seed_sandbox() -> None:
    """Create a couple of dummy files so delete_file has something to act on."""
    samples = {
        "cat.txt": "kucing lucu\n",
        "laporan-q3.md": "# Laporan Q3\n\nRingkasan eksekutif ...\n",
    }
    for name, content in samples.items():
        path = SANDBOX_DIR / name
        if not path.exists():
            path.write_text(content, encoding="utf-8")


seed_sandbox()


TOOL_REGISTRY = {
    "check_inbox": check_inbox,
    "send_email": send_email,
    "delete_file": delete_file,
}


TOOL_DEFINITIONS: list[dict] = [
    {
        "type": "function",
        "function": {
            "name": "check_inbox",
            "description": (
                "Return the list of recent emails in the user's inbox. "
                "Use this whenever the user asks to check, read, list, or see their email."
            ),
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "send_email",
            "description": (
                "Send (or queue) an email to a recipient. Use this when the user asks "
                "to send, reply to, or compose an email."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "to": {
                        "type": "string",
                        "description": "Recipient email address.",
                    },
                    "subject": {
                        "type": "string",
                        "description": "Email subject line.",
                    },
                    "body": {
                        "type": "string",
                        "description": "Plain-text email body.",
                    },
                },
                "required": ["to", "subject", "body"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "delete_file",
            "description": (
                "Delete a file from the local sandbox by filename. "
                "Use this when the user asks to remove or delete a file."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "filename": {
                        "type": "string",
                        "description": "Name of the file to delete (lives in the sandbox).",
                    },
                },
                "required": ["filename"],
            },
        },
    },
]


def execute_tool_call(name: str, arguments_json: str) -> str:
    """Run a registered tool by name and return a JSON-serialized result string."""
    func = TOOL_REGISTRY.get(name)
    if func is None:
        return json.dumps({"error": f"Unknown tool: {name}"})

    try:
        args = json.loads(arguments_json) if arguments_json else {}
    except json.JSONDecodeError as exc:
        return json.dumps({"error": f"Invalid arguments JSON: {exc}"})

    try:
        result = func(**args)
    except TypeError as exc:
        return json.dumps({"error": f"Bad arguments for {name}: {exc}"})

    return json.dumps(result, ensure_ascii=False)
