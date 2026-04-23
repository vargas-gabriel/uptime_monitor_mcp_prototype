const API_BASE = "http://localhost:8000/api";

async function apiFetch(path, options = {}) {
  const res = await fetch(API_BASE + path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (res.status === 204) return null;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json();
}

export const getMonitors = () => apiFetch("/monitors");
export const createMonitor = (data) =>
  apiFetch("/monitors", { method: "POST", body: JSON.stringify(data) });
export const updateMonitor = (id, data) =>
  apiFetch(`/monitors/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const deleteMonitor = (id) =>
  apiFetch(`/monitors/${id}`, { method: "DELETE" });
export const getChecks = (id, limit = 100) =>
  apiFetch(`/monitors/${id}/checks?limit=${limit}`);
export const getSLO = (id, days = 30) =>
  apiFetch(`/monitors/${id}/slo?days=${days}`);
export const getIncidents = (id) => apiFetch(`/monitors/${id}/incidents`);
export const getReports = () => apiFetch("/reports");
export const triggerCheck = (id) =>
  apiFetch(`/monitors/${id}/check`, { method: "POST" });
