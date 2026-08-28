from __future__ import annotations

import json
import logging
from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String, Text, create_engine, select
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings

logger = logging.getLogger("agent.db")


class Base(DeclarativeBase):
    pass


class PendingAction(Base):
    """An action the agent wants to take that is awaiting human approval."""

    __tablename__ = "pending_actions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tool_call_id = Column(String(64), index=True, nullable=True)
    tool_name = Column(String(64), nullable=False)
    risk_level = Column(String(16), nullable=False, default="high")
    reason = Column(Text, default="", nullable=False)
    arguments_json = Column(Text, default="{}", nullable=False)
    ai_explanation = Column(Text, default="", nullable=False)
    status = Column(String(16), default="pending", index=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    resolved_at = Column(DateTime, nullable=True)
    result_json = Column(Text, nullable=True)

    def to_dict(self) -> dict:
        try:
            args = json.loads(self.arguments_json or "{}")
        except json.JSONDecodeError:
            args = self.arguments_json
        try:
            result = json.loads(self.result_json) if self.result_json else None
        except json.JSONDecodeError:
            result = self.result_json
        return {
            "id": self.id,
            "tool_call_id": self.tool_call_id,
            "tool_name": self.tool_name,
            "risk_level": self.risk_level,
            "reason": self.reason,
            "arguments": args,
            "ai_explanation": self.ai_explanation,
            "status": self.status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "resolved_at": self.resolved_at.isoformat() if self.resolved_at else None,
            "result": result,
        }


_connect_args: dict = (
    {"check_same_thread": False}
    if settings.database_url.startswith("sqlite")
    else {}
)

engine = create_engine(
    settings.database_url,
    connect_args=_connect_args,
    future=True,
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
    logger.info("DB initialized at %s", settings.database_url)


def list_pending_actions() -> list[PendingAction]:
    with Session(engine) as session:
        stmt = (
            select(PendingAction)
            .where(PendingAction.status == "pending")
            .order_by(PendingAction.created_at.desc())
        )
        return list(session.execute(stmt).scalars().all())
