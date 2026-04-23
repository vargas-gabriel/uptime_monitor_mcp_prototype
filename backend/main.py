import asyncio
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

import models
from database import Base, SessionLocal, engine, get_db
from models import Check, Incident, Monitor
from scheduler import load_all_monitors, perform_check, remove_monitor_job, schedule_monitor, scheduler
from schemas import (
    CheckOut,
    IncidentOut,
    MonitorCreate,
    MonitorOut,
    MonitorUpdate,
    ReportRow,
    SLOStats,
)
from slo import calculate_slo, get_report_rows

Base.metadata.create_all(bind=engine)


@asynccontextmanager
async def lifespan(app: FastAPI):
    db = SessionLocal()
    try:
        load_all_monitors(db)
    finally:
        db.close()
    scheduler.start()
    yield
    scheduler.shutdown(wait=False)


app = FastAPI(title="Uptime Monitor", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _get_monitor_or_404(monitor_id: int, db: Session) -> Monitor:
    monitor = db.query(Monitor).filter(Monitor.id == monitor_id).first()
    if not monitor:
        raise HTTPException(status_code=404, detail="Monitor not found")
    return monitor


def _enrich_monitor(monitor: Monitor, db: Session) -> dict:
    last_check = (
        db.query(Check)
        .filter(Check.monitor_id == monitor.id)
        .order_by(Check.checked_at.desc())
        .first()
    )
    slo = calculate_slo(db, monitor.id, days=30)
    uptime_pct = slo["uptime_pct"] if slo else None
    data = {c.name: getattr(monitor, c.name) for c in monitor.__table__.columns}
    data["last_check"] = last_check
    data["uptime_pct_30d"] = uptime_pct
    return data


@app.get("/api/monitors", response_model=list[MonitorOut])
def list_monitors(db: Session = Depends(get_db)):
    monitors = db.query(Monitor).all()
    return [_enrich_monitor(m, db) for m in monitors]


@app.post("/api/monitors", response_model=MonitorOut, status_code=201)
def create_monitor(payload: MonitorCreate, db: Session = Depends(get_db)):
    monitor = Monitor(**payload.model_dump())
    db.add(monitor)
    db.commit()
    db.refresh(monitor)
    schedule_monitor(monitor)
    return _enrich_monitor(monitor, db)


@app.put("/api/monitors/{monitor_id}", response_model=MonitorOut)
def update_monitor(monitor_id: int, payload: MonitorUpdate, db: Session = Depends(get_db)):
    monitor = _get_monitor_or_404(monitor_id, db)
    updates = payload.model_dump(exclude_none=True)
    for field, value in updates.items():
        setattr(monitor, field, value)
    db.commit()
    db.refresh(monitor)

    if "is_active" in updates and not monitor.is_active:
        remove_monitor_job(monitor_id)
    elif "is_active" in updates and monitor.is_active:
        schedule_monitor(monitor)
    elif "interval_seconds" in updates and monitor.is_active:
        schedule_monitor(monitor)

    return _enrich_monitor(monitor, db)


@app.delete("/api/monitors/{monitor_id}", status_code=204)
def delete_monitor(monitor_id: int, db: Session = Depends(get_db)):
    monitor = _get_monitor_or_404(monitor_id, db)
    remove_monitor_job(monitor_id)
    db.delete(monitor)
    db.commit()


@app.get("/api/monitors/{monitor_id}/checks", response_model=list[CheckOut])
def get_checks(monitor_id: int, limit: int = 100, db: Session = Depends(get_db)):
    _get_monitor_or_404(monitor_id, db)
    return (
        db.query(Check)
        .filter(Check.monitor_id == monitor_id)
        .order_by(Check.checked_at.desc())
        .limit(limit)
        .all()
    )


@app.get("/api/monitors/{monitor_id}/slo", response_model=SLOStats)
def get_slo(monitor_id: int, days: int = 30, db: Session = Depends(get_db)):
    _get_monitor_or_404(monitor_id, db)
    result = calculate_slo(db, monitor_id, days=days)
    return result


@app.get("/api/monitors/{monitor_id}/incidents", response_model=list[IncidentOut])
def get_incidents(monitor_id: int, db: Session = Depends(get_db)):
    _get_monitor_or_404(monitor_id, db)
    return (
        db.query(Incident)
        .filter(Incident.monitor_id == monitor_id)
        .order_by(Incident.started_at.desc())
        .all()
    )


@app.get("/api/reports", response_model=list[ReportRow])
def get_reports(db: Session = Depends(get_db)):
    return get_report_rows(db)


@app.post("/api/monitors/{monitor_id}/check", response_model=CheckOut)
async def trigger_check(monitor_id: int, db: Session = Depends(get_db)):
    _get_monitor_or_404(monitor_id, db)
    await asyncio.to_thread(perform_check, monitor_id)
    latest = (
        db.query(Check)
        .filter(Check.monitor_id == monitor_id)
        .order_by(Check.checked_at.desc())
        .first()
    )
    return latest
