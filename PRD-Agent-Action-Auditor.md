# PRD: Agent Action Auditor

**Tagline:** Dashboard web untuk memantau, menyetujui, dan mengaudit setiap aksi yang mau diambil oleh AI agent — sebelum aksi itu benar-benar dieksekusi.

**Versi:** 1.0
**Tanggal:** 26 Agustus 2026
**Author:** Venerdi

---
 
## 1. Latar Belakang & Masalah

AI agent modern (LLM + tools) makin sering dikasih akses buat eksekusi aksi nyata: kirim email, ubah file, hit API eksternal, transfer data, dll. Masalahnya, agent bisa salah interpretasi instruksi, halusinasi, atau melakukan aksi yang tidak reversibel tanpa disadari user.

Tren governance & "human-in-the-loop approval" makin jadi concern besar di industri (agent permission scoping, approval gate untuk aksi berisiko/irreversible). Tapi kebanyakan solusi ini masih ada di level enterprise/tertutup — belum banyak implementasi open, sederhana, dan bisa dipelajari/didemokan.

**Tujuan project:** Membangun sistem yang menjadi "lapisan pengawas" antara AI agent dan tools yang dia pakai — setiap aksi berisiko di-log, dievaluasi tingkat risikonya, dan butuh approval manusia sebelum dieksekusi.

---

## 2. Tujuan (Goals)

1. Menunjukkan pemahaman arsitektur agent + tool-use + safety/governance layer.
2. Menghasilkan web app yang bisa didemokan end-to-end: user kasih task ke agent → agent rencanakan aksi → aksi berisiko masuk approval queue → user approve/reject → agent lanjut eksekusi.
3. Menghasilkan artefak yang layak dijadikan portofolio/paper (ada metrik terukur: jumlah aksi diblokir, response time approval, dsb).

### Non-Goals (di luar scope v1)
- Multi-user / role-based permission kompleks (cukup single-user dulu).
- Integrasi ke tools produksi sungguhan (pakai tools **simulasi/mock** dulu: email dummy, file sandbox, kalender dummy).
- Deployment skala besar / high availability.

---

## 3. User & Use Case

**Target user:** Developer/mahasiswa yang mau lihat gimana agent dengan governance layer bekerja (untuk demo, riset, atau portofolio).

**Use case utama:**
1. User login ke dashboard.
2. User kasih instruksi ke agent (misal: "Cek email masuk, rangkum, dan balas email dari 'klien' dengan draft konfirmasi meeting").
3. Agent breakdown instruksi jadi langkah-langkah & tools yang mau dipakai.
4. Setiap langkah diklasifikasi tingkat risikonya:
   - **Low risk** (read-only, misal baca email) → auto-execute.
   - **Medium/High risk** (irreversible, misal kirim email, hapus file) → masuk approval queue.
5. User melihat aksi yang pending, lengkap dengan alasan agent kenapa mau ambil aksi itu.
6. User approve / reject / edit aksi tersebut.
7. Agent lanjut jalan berdasarkan keputusan user.
8. Semua histori (approved, rejected, auto-executed) tercatat di log/audit trail.

---

## 4. Fitur (Functional Requirements)

### 4.1 Core (MVP — wajib ada)
| # | Fitur | Deskripsi |
|---|-------|-----------|
| F1 | Chat interface | User kasih instruksi ke agent lewat chat |
| F2 | Agent planning (streaming) | Tampilkan step-by-step reasoning agent secara real-time |
| F3 | Risk classifier | Setiap aksi yang mau diambil agent dikategorikan: low / medium / high risk |
| F4 | Approval queue | Daftar aksi pending yang butuh persetujuan user, dengan detail: aksi apa, parameter, alasan agent |
| F5 | Approve / Reject / Edit | User bisa approve, reject, atau edit parameter aksi sebelum dieksekusi |
| F6 | Mock tools | Minimal 3 tools simulasi: kirim email (dummy), buat event kalender (dummy), hapus/ubah file (sandbox) |
| F7 | Audit log | Histori semua aksi (auto-executed, approved, rejected) dengan timestamp |

### 4.2 Nice-to-have (kalau waktu cukup)
| # | Fitur | Deskripsi |
|---|-------|-----------|
| F8 | Dashboard analitik | Grafik: jumlah aksi per kategori risiko, approval rate, waktu rata-rata user approve |
| F9 | Custom risk rules | User bisa atur sendiri aturan risiko (misal: semua aksi yang menyentuh kata "hapus" otomatis high risk) |
| F10 | Explain mode | Agent kasih penjelasan lebih detail kenapa suatu aksi diklasifikasikan risk tertentu |

---

## 5. Arsitektur Teknis (Usulan)

```
┌─────────────┐      ┌──────────────────┐      ┌─────────────┐
│  Frontend   │─────▶│  Backend API      │─────▶│  LLM API    │
│  (Next.js)  │◀─────│  (FastAPI/Node)   │◀─────│ (Claude API)│
└─────────────┘      └──────────────────┘      └─────────────┘
                              │
                              ▼
                     ┌──────────────────┐
                     │  Risk Classifier  │  (rule-based + LLM judge)
                     └──────────────────┘
                              │
                              ▼
                     ┌──────────────────┐
                     │  Mock Tools Layer │  (email dummy, calendar dummy, file sandbox)
                     └──────────────────┘
                              │
                              ▼
                     ┌──────────────────┐
                     │   Database        │  (audit log, approval queue) — SQLite/Postgres
                     └──────────────────┘
```

**Stack yang disarankan:**
- Frontend: Next.js (React) + Tailwind
- Backend: FastAPI (Python) — cocok kalau mau nambah eksperimen ML/analitik nanti
- LLM: Claude API (tool use / function calling)
- DB: SQLite dulu buat MVP (gampang, gak perlu setup server)
- Realtime update: Server-Sent Events (SSE) atau WebSocket buat streaming reasoning agent

---

## 6. Metrik Keberhasilan (buat bahan paper/evaluasi)

- **Approval accuracy**: seberapa sering user setuju dengan klasifikasi risiko dari sistem (bandingkan keputusan user vs prediksi sistem).
- **False positive/negative rate**: aksi low-risk yang ternyata seharusnya di-flag, dan sebaliknya.
- **Response latency**: waktu dari agent mengusulkan aksi sampai muncul di approval queue.
- **Task completion rate**: berapa persen task selesai dengan/ tanpa intervensi approval.

---

## 7. Roadmap / Milestone

| Fase | Target | Estimasi |
|------|--------|----------|
| 1. Setup & Skeleton | Project scaffold (FE+BE), koneksi ke Claude API, chat basic jalan | 1 minggu |
| 2. Mock Tools + Tool Use | Agent bisa panggil 3 mock tools via function calling | 1 minggu |
| 3. Risk Classifier + Approval Queue | Klasifikasi risiko, UI approval queue, approve/reject flow | 1-2 minggu |
| 4. Audit Log + Dashboard | Histori, log, analitik dasar | 1 minggu |
| 5. Polish + Dokumentasi + Paper | UI polish, testing, tulis laporan/paper | 1-2 minggu |

---

## 8. Risiko & Mitigasi

| Risiko | Mitigasi |
|--------|----------|
| Klasifikasi risiko LLM tidak konsisten | Kombinasikan rule-based (keyword/tool-type) + LLM judge sebagai lapisan kedua |
| Scope kebablasan (fitur kebanyakan) | Kunci di MVP (F1-F7) dulu, nice-to-have belakangan |
| Biaya API kalau testing banyak | Pakai model kecil/murah untuk development, model besar untuk demo final |

---

## 9. Deliverables

1. Source code (repo GitHub)
2. Web app yang bisa dijalankan lokal (dan idealnya di-deploy, misal Vercel + Railway/Render)
3. Dokumentasi teknis (README + arsitektur)
4. Laporan/paper singkat (metodologi, hasil evaluasi, keterbatasan)
5. Demo video/screenshot untuk portofolio
