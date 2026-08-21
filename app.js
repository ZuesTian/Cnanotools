"use strict";

const services = {
  opt: { url: "https://opt-cnt.47.236.76.214.nip.io/api/v1/health", fallback: "https://opt-cnt.47.236.76.214.nip.io/", method: "GET" },
  tem: { url: "https://tem-cnt.47.236.76.214.nip.io/api/health", fallback: "https://tem-cnt.47.236.76.214.nip.io/", method: "GET" },
  sem: { url: "https://sem.47.236.76.214.nip.io/api/v1/health", fallback: "https://sem.47.236.76.214.nip.io/", method: "GET" },
  bet: { url: "https://47.236.76.214.nip.io/api/config", method: "GET" },
  production: { url: "https://cnt-analysis.47.236.76.214.nip.io/api/v1/health", method: "GET" },
  grain: { url: "https://grain-peak.47.236.76.214.nip.io/api/health", method: "GET" },
  uv: { url: "https://uv-spectrum.47.236.76.214.nip.io/health", method: "GET" },
  raman: { url: "https://raman.47.236.76.214.nip.io/api/health", method: "GET" },
  furnace: { url: "https://47.236.76.214.nip.io/oc-furnace-report-plain-v6/", fallback: "https://sim-db.47.236.76.214.nip.io/", method: "GET" },
};

async function probe(config) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 5000);
  try {
    await fetch(config.url, { method: config.method, mode: "no-cors", cache: "no-store", signal: controller.signal });
    return true;
  } catch (_) {
    if (!config.fallback) return false;
    try {
      await fetch(config.fallback, { mode: "no-cors", cache: "no-store", signal: controller.signal });
      return true;
    } catch (_) {
      return false;
    }
  } finally {
    window.clearTimeout(timer);
  }
}

async function checkServices() {
  const entries = Object.entries(services);
  const statuses = await Promise.all(entries.map(async ([key, config]) => [key, await probe(config)]));
  let online = 0;
  statuses.forEach(([key, isOnline]) => {
    const card = document.querySelector(`[data-service="${key}"]`);
    const pill = card.querySelector(".status-pill");
    pill.className = `status-pill ${isOnline ? "online" : "offline"}`;
    pill.querySelector("b").textContent = isOnline ? "在线" : "暂不可达";
    card.classList.toggle("offline-card", !isOnline);
    if (isOnline) online += 1;
  });
  document.querySelector("#onlineCount").textContent = String(online);
  const summary = document.querySelector("#serviceSummary");
  const header = document.querySelector(".header-status");
  summary.textContent = `${online} / ${entries.length} 项服务在线`;
  header.classList.toggle("ready", online === entries.length);
}

checkServices();
