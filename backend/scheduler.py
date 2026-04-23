import time
from datetime import datetime

import httpx
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.jobstores.base import JobLookupError

from database import SessionLocal
from models import Check, Incident, Monitor

scheduler = BackgroundScheduler(timezone="UTC")


def _update_incidents(db, monitor, check):
    open_incident = (
        db.query(Incident)
        .filter(Incident.monitor_id == monitor.id, Incident.resolved_at == None)
        .first()
    )
    if not check.is_up and open_incident is None:
        incident = Incident(
            monitor_id=monitor.id,
            started_at=check.checked_at,
            root_check_id=check.id,
        )
        db.add(incident)
        db.commit()
    elif check.is_up and open_incident is not None:
        open_incident.resolved_at = check.checked_at
        db.commit()


def perform_check(monitor_id: int):
    db = SessionLocal()
    try:
        monitor = db.query(Monitor).filter(Monitor.id == monitor_id).first()
        if not monitor or not monitor.is_active:
            remove_monitor_job(monitor_id)
            return

        status_code = None
        response_time_ms = None
        is_up = False

        try:
            start = time.perf_counter()
            with httpx.Client(timeout=10.0) as client:
                response = client.get(monitor.url)
            response_time_ms = (time.perf_counter() - start) * 1000
            status_code = response.status_code
            is_up = status_code == monitor.expected_status
        except httpx.RequestError:
            pass

        check = Check(
            monitor_id=monitor.id,
            checked_at=datetime.utcnow(),
            status_code=status_code,
            response_time_ms=response_time_ms,
            is_up=is_up,
        )
        db.add(check)
        db.commit()
        db.refresh(check)

        _update_incidents(db, monitor, check)
    finally:
        db.close()


def schedule_monitor(monitor):
    scheduler.add_job(
        perform_check,
        trigger="interval",
        seconds=monitor.interval_seconds,
        args=[monitor.id],
        id=f"monitor_{monitor.id}",
        replace_existing=True,
        next_run_time=datetime.utcnow(),
    )


def remove_monitor_job(monitor_id: int):
    try:
        scheduler.remove_job(f"monitor_{monitor_id}")
    except JobLookupError:
        pass


def load_all_monitors(db):
    monitors = db.query(Monitor).filter(Monitor.is_active == True).all()
    for monitor in monitors:
        schedule_monitor(monitor)
