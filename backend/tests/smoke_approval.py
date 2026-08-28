"""Smoke test: park, list, approve, reject — end-to-end through the DB layer."""
from sqlalchemy.orm import Session

from app.core import tools
from app.core.db import PendingAction, engine, init_db, list_pending_actions
from app.core.groq_client import execute_approved_action, reject_pending_action


def main() -> None:
    init_db()

    # Reset state
    with Session(engine) as s:
        s.query(PendingAction).delete()
        s.commit()
    tools.SENT_EMAILS.clear()
    tools.seed_sandbox()

    # 1) Park a send_email (simulate the agent wanting to send)
    with Session(engine) as s:
        pa = PendingAction(
            tool_call_id="tc_test_001",
            tool_name="send_email",
            risk_level="high",
            reason="Irreversible or external side-effect — requires human approval.",
            arguments_json='{"to":"klien@acme-corp.com","subject":"Confirmed","body":"Kamis jam 14 OK."}',
            ai_explanation="Agent drafted a reply to the client confirming the meeting.",
            status="pending",
        )
        s.add(pa)
        s.commit()
        s.refresh(pa)
    print(f"PARKED id={pa.id} status={pa.status}")

    # 2) Confirm send_email was NOT executed yet
    print(f"SENT_EMAILS after park: {len(tools.SENT_EMAILS)} (should be 0)")
    assert len(tools.SENT_EMAILS) == 0, "FAIL: tool executed before approval"

    # 3) list pending
    pending = list_pending_actions()
    print(f"list_pending count = {len(pending)}")
    for p in pending:
        print(f"  - {p.id} {p.tool_name} {p.status} | args: {p.arguments_json[:60]}")
    assert len(pending) == 1, "FAIL: expected exactly 1 pending"

    # 4) Approve it
    res = execute_approved_action(pa.id)
    print(f"APPROVED: {res['status']} | tool: {res['tool_name']}")
    print(f"SENT_EMAILS after approve: {len(tools.SENT_EMAILS)} (should be 1)")
    print(f"   sent[0]: {tools.SENT_EMAILS[0]}")
    assert res["status"] == "approved"
    assert len(tools.SENT_EMAILS) == 1, "FAIL: tool did not run after approve"

    # 5) Park another (delete_file), then reject
    with Session(engine) as s:
        pa2 = PendingAction(
            tool_call_id="tc_test_002",
            tool_name="delete_file",
            risk_level="high",
            reason="Irreversible or external side-effect — requires human approval.",
            arguments_json='{"filename":"cat.txt"}',
            ai_explanation="User asked to remove cat.txt.",
            status="pending",
        )
        s.add(pa2)
        s.commit()
        s.refresh(pa2)

    before = sorted(p.name for p in tools.SANDBOX_DIR.iterdir())
    print(f"files in sandbox before reject: {before}")
    res2 = reject_pending_action(pa2.id)
    print(f"REJECTED: {res2['status']}")
    after = sorted(p.name for p in tools.SANDBOX_DIR.iterdir())
    print(f"files in sandbox after reject:  {after}")
    print(f"cat.txt still exists: {(tools.SANDBOX_DIR / 'cat.txt').exists()}")
    assert res2["status"] == "rejected"
    assert (tools.SANDBOX_DIR / "cat.txt").exists(), "FAIL: rejected action deleted the file"

    # 6) Re-approve an already-resolved action -> 409 expected
    again = execute_approved_action(pa.id)
    print(f"re-approve already-resolved: {again}")
    assert again.get("error") == "already_resolved"

    print("\nALL ASSERTIONS PASSED")


if __name__ == "__main__":
    main()
