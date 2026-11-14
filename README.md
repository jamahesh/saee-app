# Universal Fit V1 starter

This is the first working implementation slice: React + Vite frontend, FastAPI backend, SQLite local database, product-specific size charts, and a deterministic sizing engine.

## Run on Windows PowerShell

Backend (PowerShell window 1):
```powershell
cd .\backend
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn app.main:app --reload
```
If activation is blocked:
```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
```

Frontend (PowerShell window 2):
```powershell
cd .\frontend
npm install
Copy-Item .env.example .env
npm run dev
```
Open http://localhost:5173. API docs: http://127.0.0.1:8000/docs.

Click **Load example recommendation** to test the full frontend-to-backend flow. The sample chart is fictional and unverified; do not use it to buy clothing.

## Scope and safety
This is a real, runnable foundation, not the complete commercial platform. Authentication, merchant isolation, production PostgreSQL deployment, Shopify integration, parental-consent verification, and security/legal review remain launch blockers. Child profile creation is deliberately disabled until parental consent and verification safeguards are implemented and reviewed.
