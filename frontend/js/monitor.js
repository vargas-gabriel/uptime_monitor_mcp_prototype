import { getChecks, getIncidents, getSLO, triggerCheck } from "./api.js";

const params = new URLSearchParams(window.location.search);
const MONITOR_ID = parseInt(params.get("id"), 10);

let chart = null;

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDuration(seconds) {
  if (seconds == null) return "ongoing";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts = [];
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(" ");
}

function formatBudget(seconds) {
  if (seconds == null) return "—";
  return formatDuration(seconds);
}

function formatDatetime(dt) {
  return new Date(dt).toLocaleString();
}

function renderSLO(slo) {
  const panel = document.getElementById("sloPanel");
  if (!slo) { panel.innerHTML = "<p>No SLO data.</p>"; return; }

  const upPct = slo.uptime_pct != null ? slo.uptime_pct.toFixed(3) + "%" : "—";
  const isGood = slo.uptime_pct != null && slo.uptime_pct >= slo.slo_target;
  panel.innerHTML = `
    <div class="slo-stat">
      <div class="label">Uptime (${slo.window_days}d)</div>
      <div class="value ${isGood ? "good" : "bad"}">${upPct}</div>
    </div>
    <div class="slo-stat">
      <div class="label">SLO Target</div>
      <div class="value">${slo.slo_target}%</div>
    </div>
    <div class="slo-stat">
      <div class="label">Checks Total</div>
      <div class="value">${slo.checks_total}</div>
    </div>
    <div class="slo-stat">
      <div class="label">Checks Up</div>
      <div class="value">${slo.checks_up}</div>
    </div>
    <div class="slo-stat">
      <div class="label">Budget Remaining</div>
      <div class="value ${slo.error_budget_remaining_seconds > 0 ? "good" : "bad"}">${formatBudget(slo.error_budget_remaining_seconds)}</div>
    </div>
  `;
}

function renderChart(checks) {
  const ctx = document.getElementById("responseChart").getContext("2d");
  const reversed = [...checks].reverse();
  const labels = reversed.map((c) => new Date(c.checked_at).toLocaleTimeString());
  const data = reversed.map((c) => c.response_time_ms);
  const colors = reversed.map((c) => (c.is_up ? "#22c55e" : "#ef4444"));

  if (chart) {
    chart.data.labels = labels;
    chart.data.datasets[0].data = data;
    chart.data.datasets[0].pointBackgroundColor = colors;
    chart.update();
    return;
  }

  chart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Response Time (ms)",
          data,
          pointBackgroundColor: colors,
          pointRadius: 4,
          pointHoverRadius: 6,
          borderColor: "#6366f1",
          backgroundColor: "rgba(99,102,241,0.05)",
          tension: 0.3,
          fill: true,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true, title: { display: true, text: "ms" } },
        x: { ticks: { maxTicksLimit: 12, maxRotation: 0 } },
      },
      plugins: { legend: { display: false } },
    },
  });
}

function renderHistory(checks) {
  const container = document.getElementById("uptimeHistory");
  const reversed = [...checks].reverse().slice(-50);
  container.innerHTML = reversed
    .map((c) => {
      const cls = c.is_up ? "up" : "down";
      const title = `${new Date(c.checked_at).toLocaleString()} — ${c.is_up ? "UP" : "DOWN"}${c.response_time_ms ? " " + Math.round(c.response_time_ms) + "ms" : ""}`;
      return `<div class="check-dot ${cls}" title="${escHtml(title)}"></div>`;
    })
    .join("");
}

function renderIncidents(incidents) {
  const tbody = document.getElementById("incidentsBody");
  if (!incidents.length) {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--color-muted)">No incidents</td></tr>';
    return;
  }
  tbody.innerHTML = incidents
    .map(
      (inc) => `
      <tr>
        <td>${escHtml(formatDatetime(inc.started_at))}</td>
        <td>${inc.resolved_at ? escHtml(formatDatetime(inc.resolved_at)) : '<span class="badge badge-down">Ongoing</span>'}</td>
        <td>${escHtml(formatDuration(inc.duration_seconds))}</td>
      </tr>`
    )
    .join("");
}

async function loadAll() {
  if (!MONITOR_ID) return;
  const [checks, slo, incidents] = await Promise.all([
    getChecks(MONITOR_ID, 100),
    getSLO(MONITOR_ID, 30),
    getIncidents(MONITOR_ID),
  ]);
  renderSLO(slo);
  renderChart(checks);
  renderHistory(checks);
  renderIncidents(incidents);
}

document.addEventListener("DOMContentLoaded", () => {
  if (!MONITOR_ID) {
    document.body.innerHTML = '<div class="page"><div class="alert alert-error">Missing monitor ID.</div></div>';
    return;
  }

  loadAll().catch((err) => {
    document.getElementById("sloPanel").innerHTML = `<div class="alert alert-error">${escHtml(err.message)}</div>`;
  });

  document.getElementById("checkNowBtn").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Checking…';
    try {
      await triggerCheck(MONITOR_ID);
      await loadAll();
    } catch (err) {
      alert(err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = "Check Now";
    }
  });
});
