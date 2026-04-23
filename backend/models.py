from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Index, Integer, String
from sqlalchemy.orm import relationship

from database import Base


class Monitor(Base):
    __tablename__ = "monitors"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), nullable=False)
    url = Column(String(2048), nullable=False)
    interval_seconds = Column(Integer, default=60, nullable=False)
    expected_status = Column(Integer, default=200, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    checks = relationship("Check", back_populates="monitor", cascade="all, delete-orphan")
    incidents = relationship("Incident", back_populates="monitor", cascade="all, delete-orphan")


class Check(Base):
    __tablename__ = "checks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    monitor_id = Column(Integer, ForeignKey("monitors.id"), nullable=False, index=True)
    checked_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    status_code = Column(Integer, nullable=True)
    response_time_ms = Column(Float, nullable=True)
    is_up = Column(Boolean, nullable=False)

    monitor = relationship("Monitor", back_populates="checks")


class Incident(Base):
    __tablename__ = "incidents"

    id = Column(Integer, primary_key=True, autoincrement=True)
    monitor_id = Column(Integer, ForeignKey("monitors.id"), nullable=False, index=True)
    started_at = Column(DateTime, nullable=False)
    resolved_at = Column(DateTime, nullable=True)
    root_check_id = Column(Integer, ForeignKey("checks.id"), nullable=True)

    monitor = relationship("Monitor", back_populates="incidents")

    @property
    def duration_seconds(self):
        end = self.resolved_at or datetime.utcnow()
        return (end - self.started_at).total_seconds()


Index("ix_checks_monitor_checked", Check.monitor_id, Check.checked_at)
