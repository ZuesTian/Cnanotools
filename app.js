"use strict";

const services = {
  vision: "https://cnt-vision.47.236.76.214.nip.io/api/health",
  opt: "https://opt-cnt.47.236.76.214.nip.io/api/v1/health",
  tem: "https://tem-cnt.47.236.76.214.nip.io/api/health",
  sem: "https://sem.47.236.76.214.nip.io/api/v1/health",
  grain: "https://grain-peak.47.236.76.214.nip.io/api/health",
  uv: "https://uv-spectrum.47.236.76.214.nip.io/health",
  raman: "https://raman.47.236.76.214.nip.io/api/health",
  bet: "https://47.236.76.214.nip.io/api/config",
  production: "https://cnt-analysis.47.236.76.214.nip.io/api/v1/health",
  furnace: "https://sim-db.47.236.76.214.nip.io/",
};

async function probe(url) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(url, { mode: "cors", cache: "no-store", signal: controller.signal });
    return response.ok ? "online" : "offline";
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
