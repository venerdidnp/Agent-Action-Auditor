from __future__ import annotations

from typing import Literal

RiskLevel = Literal["low", "medium", "high"]

RISK_RULES: dict[str, RiskLevel] = {
    "check_inbox": "low",
    "send_email": "high",
    "delete_file": "high",
}

REASON_BY_RISK: dict[str, str] = {
    "low": "Read-only operation with no side effects; safe to auto-execute.",
    "medium": "Has visible side effects; user should be aware before execution.",
    "high": "Irreversible or external side-effect — requires human approval.",
}


def classify(tool_name: str) -> RiskLevel:
    """Return the risk level for a given tool name.

    Unknown tools default to ``high`` so the auditor never silently executes
    something it has not been explicitly whitelisted for.
    """
    return RISK_RULES.get(tool_name, "high")


def reason(tool_name: str, risk: RiskLevel) -> str:
    return REASON_BY_RISK.get(risk, REASON_BY_RISK["high"])


def requires_approval(risk: RiskLevel) -> bool:
    return risk in {"medium", "high"}
