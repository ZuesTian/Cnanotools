"use strict";

const services = {
  vision: "https://cnt-vision.47.236.76.214.nip.io/health",
  opt: "https://opt-cnt.47.236.76.214.nip.io/health",
  tem: "https://tem-cnt.47.236.76.214.nip.io/health",
  sem: "https://sem.47.236.76.214.nip.io/health",
  grain: "https://grain-peak.47.236.76.214.nip.io/health",
  uv: "https://uv-spectrum.47.236.76.214.nip.io/health",
  raman: "https://raman.47.236.76.214.nip.io/health",
  xrd: "https://cnt-xrd.47.236.76.214.nip.io/health",
  bet: "https://47.236.76.214.nip.io/health",
  production: "https://cnt-analysis.47.236.76.214.nip.io/health",
  furnace: "https://sim-db.47.236.76.214.nip.io/health",
};

async function probe(url) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(url, { mode: "cors", cache: "no-store", signal: controller.signal });
    if (!response.ok) return "offline";
    if (!response.headers.get("content-type")?.includes("application/json")) return "offline";
    const health = await response.json().catch(() => null);
    return health && typeof health === "object" && !Array.isArray(health) ? "online" : "offline";
  } catch {
    // A CORS-blocked response is not evidence that a service is offline.
    return "unknown";
  } finally { window.clearTimeout(timer); }
}

async function checkServices() {
  const button = document.getElementById("refreshServices");
  if (button.disabled) return;
  button.disabled = true;
  document.getElementById("serviceSummary").textContent = "正在检查接口响应";
  const entries = Object.entries(services);
  const results = await Promise.all(entries.map(async ([key, url]) => [key, await probe(url)]));
  const labels = { online: "接口响应", offline: "接口异常", unknown: "待核验" };
  for (const [key, state] of results) {
    const pill = document.querySelector(`[data-service="${key}"] .status-pill`);
    pill.className = `status-pill ${state}`;
    pill.querySelector("b").textContent = labels[state];
  }
  const online = results.filter(([, state]) => state === "online").length;
  document.getElementById("serviceSummary").textContent = `${online} / ${entries.length} 项接口已响应`;
  button.disabled = false;
}

document.getElementById("refreshServices").addEventListener("click", checkServices);
checkServices();

document.getElementById("tool-mode").addEventListener("change", event => {
  const mode = event.target.value;
  for (const card of document.querySelectorAll("[data-service]")) {
    card.hidden = Boolean(mode && mode !== card.dataset.mode);
  }
  for (const section of document.querySelectorAll("section:has([data-service])")) {
    section.hidden = !section.querySelector("[data-service]:not([hidden])");
  }
});
