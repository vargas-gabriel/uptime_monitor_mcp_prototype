import { getReports } from "./api.js";

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatBudget(seconds) {
  if (seconds == null) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts = [];
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(" ");
}

function renderSummary(rows) {
  const total = rows.length;
  const compliant = rows.filter((r) => r.is_compliant).length;
  const nonCompliant = total - compliant;
  document.getElementById("summaryTotal").textContent = total;
  document.getElementById("summaryCompliant").textContent = compliant;
  document.getElementById("summaryNonCompliant").textContent = nonCompliant;
}

function renderTable(rows) {
  const tbody = document.getElementById("reportBody");
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--color-muted)">No monitors found.</td></tr>';
    return;
  }
  tbody.innerHTML = rows
    .map((r) => {
      const uptimePct = r.uptime_pct != null ? r.uptime_pct.toFixed(3) + "%" : "—";
      const badgeClass = r.is_compliant ? "badge-compliant" : "badge-noncompliant";
      const badgeText = r.is_compliant ? "Yes" : "No";
      const uptimeColor = r.is_compliant ? "color:var(--color-up)" : "color:var(--color-down)";
      return `
        <tr>
          <td><a href="monitor.html?id=${r.monitor_id}" style="color:var(--color-accent);text-decoration:none">${escHtml(r.monitor_name)}</a></td>
          <td style="color:var(--color-muted)">${escHtml(r.url)}</td>
          <td style="${uptimeColor};font-weight:600">${uptimePct}</td>
          <td>99.9%</td>
          <td><span class="badge ${badgeClass}">${badgeText}</span></td>
          <td>${r.checks_total}</td>
          <td>${formatBudget(r.error_budget_remaining_seconds)}</td>
          <td>${r.open_incidents > 0 ? `<span class="badge badge-down">${r.open_incidents}</span>` : "0"}</td>
        </tr>`;
    })
    .join("");
}

function exportCSV(rows) {
  const headers = [
    "Name", "URL", "Uptime%", "SLO Target", "Compliant",
    "Checks Total", "Checks Up", "Error Budget Remaining (s)", "Open Incidents",
  ];
  const lines = [
    headers.join(","),
    ...rows.map((r) =>
      [
        `"${r.monitor_name}"`,
        `"${r.url}"`,
        r.uptime_pct != null ? r.uptime_pct.toFixed(3) : "",
        "99.9",
        r.is_compliant ? "Yes" : "No",
        r.checks_total,
        r.checks_up,
        r.error_budget_remaining_seconds?.toFixed(0) ?? "",
        r.open_incidents,
      ].join(",")
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `slo-report-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

document.addEventListener("DOMContentLoaded", async () => {
  let rows = [];
  try {
    rows = await getReports();
    renderSummary(rows);
    renderTable(rows);
  } catch (err) {
    document.getElementById("reportBody").innerHTML = `
      <tr><td colspan="8" class="alert alert-error">${escHtml(err.message)}</td></tr>`;
  }

  document.getElementById("exportBtn").addEventListener("click", () => exportCSV(rows));
});
