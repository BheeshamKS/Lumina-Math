# Lumina Math — Developer Reference

## Project Layout

```
Lumina Math/
├── backend/          FastAPI app (Python 3.11)
│   ├── main.py       App entrypoint, CORS, router mounting
│   ├── routes/       auth.py · chat.py · sessions.py · ocr.py
│   ├── services/     groq_service.py · math_engine.py · ocr_service.py
│   ├── db/           database.py · models.py · schemas.py · crud.py
│   └── core/         config.py (settings from .env)
└── frontend/         React + Vite (TypeScript, strict mode)
    ├── src/
    │   ├── App.jsx
    │   ├── components/
    │   │   ├── Auth/        LoginPage.jsx
    │   │   ├── Calculator/  Calculator.jsx
    │   │   ├── Chat/        ChatInterface.jsx · ChatInput.jsx · MathKeyboard.jsx
    │   │   ├── MathRenderer/MathRenderer.jsx
    │   │   └── Sidebar/     SessionSidebar.jsx
    │   ├── context/  AuthContext.jsx
    │   ├── data/     formulas.js
    │   ├── hooks/    useChat.js · useSessions.js
    │   ├── services/ api.js
    │   └── styles/   layout.css · chat.css · sidebar.css · calculator.css · auth.css
    └── index.html
```

## Running Locally

```bash
# Backend — port 8001 (8000 is taken by CUPS/Ghostscript)
cd backend
uvicorn main:app --reload --port 8001

# Frontend — port 5173, proxies /api → :8001
cd frontend
npm run dev
```

## Stack

| Layer        | Technology |
|---|---|
| Backend API  | FastAPI + Supabase (Postgres + Auth) |
| Math engine  | SymPy (all symbolic computation — LLM never does arithmetic) |
| LLM          | Groq `llama-3.3-70b-versatile` (JSON mode, formatting + ambiguity only) |
| OCR          | OCR.space Engine 2 (replaces Gemini Vision) |
| Auth         | Supabase JWT (HS256), refresh_token in sessionStorage |
| Frontend     | React 18 + Vite, TypeScript (strict) |
| Math render  | react-markdown + remark-math + rehype-katex (prose), react-katex BlockMath (raw SymPy output) |

## Auth Flow

- `access_token` lives only in React state (never persisted)
- `refresh_token` stored in `sessionStorage` under key `lumina_refresh`
- On page load: `AuthContext` reads sessionStorage → calls `POST /auth/refresh` → restores session
- `registerAuthCallbacks()` in `api.js` wires a 401 axios interceptor that auto-refreshes and retries
- Supabase email confirmation **must be disabled** in the dashboard (Auth → Providers → Email → "Confirm email" OFF) for local dev

## Key Conventions

### Backend
- All math computation goes through `math_engine.py` via SymPy
- LLM is called *only* for: ambiguity detection, explanation text, tips, step descriptions
- LLM responses are always parsed as JSON (Groq JSON mode)
- LaTeX output uses `$...$` for inline, `$$...$$` for display
- Never use Unicode math symbols (`½ ∫ ∑ ∞`) in LLM output — always use LaTeX commands

### Frontend
- No chat bubbles. Worksheet/document layout (`worksheet-shell`)
- `MessageRenderer` — for LLM prose text containing `$...$` math
- `BlockMath` — for raw SymPy LaTeX (no delimiters, just the expression)
- `ChatInput` — hybrid input with virtual keyboard, `+` action menu, live KaTeX preview
- `MathKeyboard` — 5-tab keyboard (Basic · Calculus · Greek · Logic · Matrix); inserts `$...$` at cursor
- Formula inserts from sidebar come through `onFormulaInsert` → `formulaPush` state in App.jsx

### CSS Design System
All values are CSS variables in `index.css`:
- `--amber: #C49035` / `--amber-bright: #D4A843` / `--amber-dim: rgba(196,144,53,0.08)` / `--amber-glow`
- `--cobalt: #3D68B4` / `--cobalt-bright: #5A84D4`
- `--cream: #E2D6BE` / `--cream-2` / `--cream-3`
- `--bg-solid: #090807` / `--surface` / `--card` / `--card-raised`
- `--border` / `--border-light`
- `--font-display: 'Cormorant Garamond'` / `--font-sans: 'DM Sans'` / `--font-mono: 'JetBrains Mono'`
- `--radius: 6px` / `--radius-lg: 10px`

## Environment Variables

### Backend `.env`
```
SUPABASE_URL=
SUPABASE_KEY=          # service role key
SUPABASE_JWT_SECRET=   # JWT secret (Settings → API)
GROQ_API_KEY=
OCR_SPACE_API_KEY=
DATABASE_URL=          # postgres connection string
```

### Frontend `.env` (Vite)
```
VITE_API_BASE=/api     # proxied to :8001 by Vite
```

## Session Persistence
- Sessions are saved to Supabase `sessions` + `messages` tables
- Auto-save triggered after each assistant response in `App.jsx` `useEffect`
- History is loaded on session select → converted and restored via `chat.restoreHistory()`
