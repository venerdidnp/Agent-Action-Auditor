"""Live HTTP test using FastAPI TestClient — exercises routes + DB end-to-end."""
from fastapi.testclient import TestClient

from app.core import tools
from app.core.db import PendingAction, engine, init_db
from app.main import app
from sqlalchemy.orm import Session


def main() -> None:
    init_db()
    with Session(engine) as s:
        s.query(PendingAction).delete()
        s.commit()
    tools.SENT_EMAILS.clear()
    tools.seed_sandbox()

    client = TestClient(app)

    # 1) health
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json() == {"status": "ok"}, r.text
    print("GET  /api/health         ->", r.status_code, r.json())

    # 2) pending list (empty)
    r = client.get("/api/pending")
    assert r.status_code == 200 and r.json() == [], r.text
    print("GET  /api/pending        ->", r.status_code, r.json())

    # 3) seed a pending action via DB (mimics the agent's parked call)
    with Session(engine) as s:
        pa = PendingAction(
            tool_call_id="tc_live_1",
            tool_name="send_email",
            risk_level="high",
            reason="Irreversible or external side-effect — requires human approval.",
            arguments_json='{"to":"klien@acme-corp.com","subject":"Confirmed","body":"Kamis jam 14 OK."}',
            ai_explanation="Drafted a confirmation reply.",
            status="pending",
        )
        s.add(pa)
        s.commit()
        s.refresh(pa)
        pid = pa.id
    print(f"SEED  pending_action id={pid}")

    # 4) pending list (one item)
    r = client.get("/api/pending")
    body = r.json()
    assert r.status_code == 200 and len(body) == 1
    assert body[0]["tool_name"] == "send_email"
    assert body[0]["status"] == "pending"
    print("GET  /api/pending        ->", r.status_code, f"{len(body)} item(s), tool={body[0]['tool_name']}")
    assert len(tools.SENT_EMAILS) == 0, "tool must NOT have executed before approval"

    # 5) approve
    r = client.post(f"/api/pending/{pid}/approve")
    body = r.json()
    assert r.status_code == 200, r.text
    assert body["pending"]["status"] == "approved"
    assert len(tools.SENT_EMAILS) == 1
    assert body.get("confirmation"), f"missing confirmation: {body}"
    assert "klien@acme-corp.com" in body["confirmation"], body["confirmation"]
    print("POST /api/pending/{}/approve -> {} | SENT_EMAILS={} | msg={!r}".format(
        pid, r.status_code, len(tools.SENT_EMAILS), body["message"]))
    print(f"   confirmation: {body['confirmation']!r}")

    # 6) re-approve -> 409
    r = client.post(f"/api/pending/{pid}/approve")
    assert r.status_code == 409, r.text
    print(f"POST /api/pending/{pid}/approve (again) -> {r.status_code} {r.json()['detail']}")

    # 7) park another, reject
    with Session(engine) as s:
        pa2 = PendingAction(
            tool_call_id="tc_live_2",
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
        pid2 = pa2.id

    r = client.post(f"/api/pending/{pid2}/reject")
    body = r.json()
    assert r.status_code == 200, r.text
    assert body["pending"]["status"] == "rejected"
    assert (tools.SANDBOX_DIR / "cat.txt").exists()
    assert body.get("confirmation"), f"missing confirmation: {body}"
    assert "tidak" in body["confirmation"].lower() or "ditolak" in body["confirmation"].lower(), body["confirmation"]
    print(f"POST /api/pending/{pid2}/reject  -> {r.status_code} | cat.txt still exists: True")
    print(f"   confirmation: {body['confirmation']!r}")

    # 8) approve non-existent -> 404
    r = client.post("/api/pending/99999/approve")
    assert r.status_code == 404, r.text
    print(f"POST /api/pending/99999/approve -> {r.status_code} {r.json()['detail']}")

    print("\nALL HTTP ASSERTIONS PASSED")


if __name__ == "__main__":
    main()
