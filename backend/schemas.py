from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class MonitorCreate(BaseModel):
    name: str
    url: str
    interval_seconds: int = 60
    expected_status: int = 200


class MonitorUpdate(BaseModel):
    name: Optional[str] = None
    url: Optional[str] = None
    interval_seconds: Optional[int] = None
    expected_status: Optional[int] = None
    is_active: Optional[bool] = None


class CheckOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    monitor_id: int
    checked_at: datetime
    status_code: Optional[int]
    response_time_ms: Optional[float]
    is_up: bool


class IncidentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    monitor_id: int
    started_at: datetime
    resolved_at: Optional[datetime]
    duration_seconds: float


class MonitorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    url: str
    interval_seconds: int
    expected_status: int
    is_active: bool
    created_at: datetime
    last_check: Optional[CheckOut] = None
    uptime_pct_30d: Optional[float] = None


class SLOStats(BaseModel):
    monitor_id: int
    uptime_pct: Optional[float]
    checks_total: int
    checks_up: int
    error_budget_total_seconds: float
    error_budget_used_seconds: float
    error_budget_remaining_seconds: float
    slo_target: float
    window_days: int


class ReportRow(BaseModel):
    monitor_id: int
    monitor_name: str
    url: str
    uptime_pct: Optional[float]
    checks_total: int
    checks_up: int
    error_budget_remaining_seconds: float
    is_compliant: bool
    open_incidents: int
