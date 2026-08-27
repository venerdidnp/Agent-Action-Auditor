# Agent Action Auditor

Dashboard web untuk memantau, menyetujui, dan mengaudit setiap aksi yang mau diambil AI agent — sebelum dieksekusi. Lihat `PRD-Agent-Action-Auditor.md` untuk detail lengkap.

## Status

> **Under active development** — saat ini di akhir Fase 1 (Setup & Skeleton) sesuai roadmap di PRD. Chat endpoint sudah jalan end-to-end via Groq, tapi sisanya (mock tools, risk classifier, approval queue, audit log) belum diimplementasi.

**Sudah jalan (Fase 1):**
- Chat dasar: kirim pesan → dapat balasan dari LLM

**Segera (Fase 2-5):**
- Mock tools (send_email, create_calendar_event, delete_file)
- Risk classifier (low / medium / high)
- Approval queue dengan flow approve / reject
- Audit log
- Dashboard analitik

## Stack

- **Backend:** FastAPI (Python) + OpenAI SDK (pointed at Groq)
- **Frontend:** Next.js 16 (App Router, TypeScript) + Tailwind CSS

## Prasyarat

- Python 3.11+
- Node.js 20+ / npm
- API key Groq (https://console.groq.com)

## Setup

### 1. Backend

```bash
cd backend

# buat & aktifkan virtual environment
python -m venv .venv
.venv\Scripts\activate        # Windows (PowerShell)
# source .venv/bin/activate   # Linux/macOS

pip install -r requirements.txt

# salin env lalu isi GROQ_API_KEY
cp .env.example .env          # Windows: Copy-Item .env.example .env
```

Isi `.env`:

```
GROQ_API_KEY=gsk-xxxx
```

Jalankan server:

```bash
uvicorn app.main:app --reload --port 8000
```

Cek: buka <http://localhost:8000/api/health> → harus `{"status": "ok"}`.

### 2. Frontend

Buka terminal baru:

```bash
cd frontend
npm install
npm run dev
```

Buka <http://localhost:3000> — chat page akan memanggil backend di `http://localhost:8000` (bisa di-override lewat `NEXT_PUBLIC_API_URL`, lihat `.env.local.example`).

## Struktur Project

```
backend/
├── app/
│   ├── main.py                  # FastAPI app + CORS + health check
│   ├── schemas.py               # Pydantic request/response
│   ├── core/
│   │   ├── config.py            # settings via pydantic-settings (.env)
│   │   └── groq_client.py       # wrapper OpenAI SDK (Groq endpoint)
│   └── api/routes/chat.py       # POST /api/chat
├── tests/
└── requirements.txt

frontend/
└── src/
    ├── app/page.tsx             # halaman chat
    ├── layout.tsx
    └── lib/api.ts               # client utk endpoint backend
```

## API

| Method | Endpoint     | Body               | Response                          |
|--------|--------------|--------------------|-----------------------------------|
| GET    | `/api/health`| –                  | `{"status": "ok"}`                |
| POST   | `/api/chat`  | `{"message": "..."}` | `{"reply", "model"}`           |

Dokumentasi interaktif otomatis: <http://localhost:8000/docs>
