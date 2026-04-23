import { createMonitor, deleteMonitor, getMonitors, triggerCheck } from "./api.js";

let refreshTimer = null;

function formatUptime(pct) {
  if (pct == null) return "—";
  return pct.toFixed(2) + "%";
}

function formatResponseTime(ms) {
  if (ms == null) return "—";
  return Math.round(ms) + " ms";
}

function statusBadge(lastCheck) {
  if (!lastCheck) return '<span class="badge badge-unknown">No data</span>';
  return lastCheck.is_up
    ? '<span class="badge badge-up">UP</span>'
    : '<span class="badge badge-down">DOWN</span>';
}

function renderCard(monitor) {
  const card = document.createElement("div");
  card.className = "card monitor-card";
  card.dataset.id = monitor.id;

  const uptime = formatUptime(monitor.uptime_pct_30d);
  const rt = formatResponseTime(monitor.last_check?.response_time_ms);
  const badge = statusBadge(monitor.last_check);

  card.innerHTML = `
    <div class="monitor-card-header">
      <div>
        <div class="monitor-name">${escHtml(monitor.name)}</div>
        <div class="monitor-url">${escHtml(monitor.url)}</div>
      </div>
      ${badge}
    </div>
    <div class="monitor-stats">
      <div>
        <div class="stat-label">Uptime (30d)</div>
        <div class="stat-value">${uptime}</div>
      </div>
      <div>
        <div class="stat-label">Response</div>
        <div class="stat-value">${rt}</div>
      </div>
      <div>
        <div class="stat-label">Interval</div>
        <div class="stat-value">${monitor.interval_seconds}s</div>
      </div>
    </div>
    <div class="monitor-card-actions">
      <a href="monitor.html?id=${monitor.id}" class="btn btn-secondary btn-sm">View Details</a>
      <button class="btn btn-secondary btn-sm check-now-btn" data-id="${monitor.id}">Check Now</button>
      <button class="btn btn-danger btn-sm delete-btn" data-id="${monitor.id}">Delete</button>
    </div>
  `;

  card.querySelector(".check-now-btn").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';
    try {
      await triggerCheck(monitor.id);
      await renderDashboard();
    } catch (err) {
      showError(err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = "Check Now";
    }
  });

  card.querySelector(".delete-btn").addEventListener("click", async (e) => {
    if (!confirm(`Delete monitor "${monitor.name}"?`)) return;
    try {
      await deleteMonitor(monitor.id);
      card.remove();
      if (document.querySelectorAll(".monitor-card").length === 0) {
        showEmpty();
      }
    } catch (err) {
      showError(err.message);
    }
  });

  return card;
}

function showEmpty() {
  const grid = document.getElementById("monitorsGrid");
  grid.innerHTML = '<div class="empty-state"><strong>No monitors yet</strong><p>Add one above to get started.</p></div>';
}

async function renderDashboard() {
  const grid = document.getElementById("monitorsGrid");
  try {
    const monitors = await getMonitors();
    grid.innerHTML = "";
    if (monitors.length === 0) {
      showEmpty();
      return;
    }
    monitors.forEach((m) => grid.appendChild(renderCard(m)));
  } catch (err) {
    grid.innerHTML = `<div class="alert alert-error">${escHtml(err.message)}</div>`;
  }
}

function showError(msg) {
  const el = document.getElementById("globalError");
  el.textContent = msg;
  el.style.display = "block";
  setTimeout(() => (el.style.display = "none"), 5000);
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

document.addEventListener("DOMContentLoaded", () => {
  renderDashboard();
  refreshTimer = setInterval(renderDashboard, 30000);

  const form = document.getElementById("addMonitorForm");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    try {
      await createMonitor({
        name: form.monitorName.value.trim(),
        url: form.monitorUrl.value.trim(),
        interval_seconds: parseInt(form.monitorInterval.value, 10),
        expected_status: parseInt(form.monitorStatus.value, 10),
      });
      form.reset();
      await renderDashboard();
    } catch (err) {
      showError(err.message);
    } finally {
      btn.disabled = false;
    }
  });
});
