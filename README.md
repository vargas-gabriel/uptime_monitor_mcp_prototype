# Uptime Monitor

A lightweight uptime monitoring SaaS prototype that polls HTTP endpoints, tracks SLOs, detects incidents, and generates compliance reports.

---

## Features

- **Endpoint monitoring** — polls URLs at configurable intervals, records HTTP status and response time
- **SLO tracking** — calculates uptime %, error budget total/used/remaining over a rolling 30-day window (99.9% target)
- **Incident detection** — automatically opens and resolves incidents based on check results
- **Dashboard** — live monitor cards with UP/DOWN status, response time, and uptime %
- **Monitor detail** — response time chart (Chart.js), uptime history dots, and incidents table
- **Reports** — SLO compliance table across all monitors with CSV export

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python, FastAPI, SQLAlchemy, SQLite |
| Background polling | APScheduler (BackgroundScheduler) |
| HTTP checks | httpx |
| Frontend | Vanilla JavaScript (ES modules), HTML, CSS |
| Charts | Chart.js (CDN) |

---

## Project Structure

```
uptime_monitor_mcp_prototype/
├── backend/
│   ├── main.py           # FastAPI app, all API routes, lifespan
│   ├── database.py       # SQLite engine, session factory, Base
│   ├── models.py         # Monitor, Check, Incident ORM models
│   ├── schemas.py        # Pydantic v2 request/response schemas
│   ├── scheduler.py      # Background polling + incident state machine
│   ├── slo.py            # SLO & error budget calculations
│   └── requirements.txt
└── frontend/
    ├── index.html        # Dashboard
    ├── monitor.html      # Monitor detail page
    ├── reports.html      # SLO compliance report
    ├── js/
    │   ├── api.js        # fetch() wrappers for all API endpoints
    │   ├── dashboard.js  # Dashboard page logic
    │   ├── monitor.js    # Monitor detail + Chart.js rendering
    │   └── reports.js    # Reports table + CSV export
    └── css/
        └── style.css
```

---

## Setup

### 1. Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The SQLite database (`uptime.db`) is created automatically on first run.

### 2. Frontend

In a separate terminal:

```bash
cd frontend
python3 -m http.server 3000
```

Then open [http://localhost:3000](http://localhost:3000) in your browser.

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/monitors` | List all monitors with last check and 30d uptime % |
| `POST` | `/api/monitors` | Create a monitor and start polling |
| `PUT` | `/api/monitors/{id}` | Update monitor (reschedules if interval changes) |
| `DELETE` | `/api/monitors/{id}` | Delete monitor and cancel polling |
| `GET` | `/api/monitors/{id}/checks?limit=100` | Check history (newest first) |
| `GET` | `/api/monitors/{id}/slo?days=30` | SLO stats for a rolling window |
| `GET` | `/api/monitors/{id}/incidents` | Incidents list (newest first) |
| `POST` | `/api/monitors/{id}/check` | Trigger an immediate manual check |
| `GET` | `/api/reports` | SLO compliance summary for all monitors |

### Example: create a monitor

```bash
curl -X POST http://localhost:8000/api/monitors \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My API",
    "url": "https://api.example.com/health",
    "interval_seconds": 60,
    "expected_status": 200
  }'
```

### Example: SLO stats response

```json
{
  "monitor_id": 1,
  "uptime_pct": 99.95,
  "checks_total": 1440,
  "checks_up": 1439,
  "error_budget_total_seconds": 2592.0,
  "error_budget_used_seconds": 60.0,
  "error_budget_remaining_seconds": 2532.0,
  "slo_target": 99.9,
  "window_days": 30
}
```

---

## How It Works

**Polling** — When a monitor is created, APScheduler schedules a background job that fires at the configured interval. Each job opens its own database session, makes an HTTP GET request with a 10-second timeout, records the result as a `Check`, and updates incidents.

**Incident detection** — A state machine runs after each check:
- If a check fails and no incident is open → a new incident is opened
- If a check succeeds and an incident is open → the incident is resolved

**SLO calculation** — Uptime % is computed from checks within a rolling window. Error budget is approximated as `downtime_checks × interval_seconds`.

**Concurrency** — SQLite runs in WAL mode so APScheduler threads can write checks while FastAPI serves reads simultaneously.

---

## Limitations (prototype scope)

- SLO target is hardcoded at 99.9% — not configurable per monitor
- Error budget uses check count × interval as an approximation, not exact downtime spans
- No authentication or multi-tenancy
- Single-process only — polling stops if the server restarts (monitors are rescheduled from the DB on startup)
- CORS is open (`allow_origins=["*"]`) — restrict this in production
