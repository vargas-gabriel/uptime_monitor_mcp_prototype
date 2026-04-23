from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from models import Check, Incident, Monitor

SLO_TARGET = 99.9


def calculate_slo(db: Session, monitor_id: int, days: int = 30, slo_target: float = SLO_TARGET) -> dict:
    monitor = db.query(Monitor).filter(Monitor.id == monitor_id).first()
    if not monitor:
        return None

    window_start = datetime.utcnow() - timedelta(days=days)
    checks = (
        db.query(Check)
        .filter(Check.monitor_id == monitor_id, Check.checked_at >= window_start)
        .all()
    )

    checks_total = len(checks)
    checks_up = sum(1 for c in checks if c.is_up)
    uptime_pct = (checks_up / checks_total * 100) if checks_total > 0 else None

    window_duration_seconds = days * 86400
    error_budget_total_seconds = (1 - slo_target / 100) * window_duration_seconds
    checks_down = checks_total - checks_up
    error_budget_used_seconds = checks_down * monitor.interval_seconds
    error_budget_remaining_seconds = max(0.0, error_budget_total_seconds - error_budget_used_seconds)

    return {
        "monitor_id": monitor_id,
        "uptime_pct": uptime_pct,
        "checks_total": checks_total,
        "checks_up": checks_up,
        "error_budget_total_seconds": error_budget_total_seconds,
        "error_budget_used_seconds": error_budget_used_seconds,
        "error_budget_remaining_seconds": error_budget_remaining_seconds,
        "slo_target": slo_target,
        "window_days": days,
    }


def get_report_rows(db: Session) -> list[dict]:
    monitors = db.query(Monitor).filter(Monitor.is_active == True).all()
    rows = []
    for monitor in monitors:
        slo = calculate_slo(db, monitor.id)
        open_incidents = (
            db.query(Incident)
            .filter(Incident.monitor_id == monitor.id, Incident.resolved_at == None)
            .count()
        )
        uptime_pct = slo["uptime_pct"]
        rows.append({
            "monitor_id": monitor.id,
            "monitor_name": monitor.name,
            "url": monitor.url,
            "uptime_pct": uptime_pct,
            "checks_total": slo["checks_total"],
            "checks_up": slo["checks_up"],
            "error_budget_remaining_seconds": slo["error_budget_remaining_seconds"],
            "is_compliant": (uptime_pct is not None and uptime_pct >= SLO_TARGET),
            "open_incidents": open_incidents,
        })
    return rows
