(() => {
  "use strict";
  const section = document.querySelector("#usage");
  const date = section.querySelector("input");
  const status = section.querySelector("[role=status]");
  const table = section.querySelector("table");
  const rows = [...document.querySelectorAll("article[data-service]")].map(card => {
    const row = table.tBodies[0].insertRow();
    const label = document.createElement("th");
    label.scope = "row";
    label.textContent = card.querySelector("h3").textContent;
    row.append(label);
    return [card.dataset.service, row.insertCell()];
  });
  const endpoint = "https://cnt-vision.47.236.76.214.nip.io/api/usage/daily";
  const beijingDay = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  let active;
  async function refresh() {
    active?.abort();
    const controller = new AbortController();
    active = controller;
    const timeout = setTimeout(() => controller.abort(), 10000);
    const requested = date.value || beijingDay();
    status.textContent = "正在读取使用日志…";
    for (const [, cell] of rows) cell.textContent = "—";
    try {
      const response = await fetch(endpoint + "?date=" + encodeURIComponent(requested), {cache: "no-store", credentials: "omit", signal: controller.signal});
      if (!response.ok) throw Error();
      const data = await response.json();
      if (active !== controller) return;
      date.min = data.started_at.slice(0, 10);
      date.max = data.today;
      if (!data.counts) { status.textContent = "这个日期没有统计记录。统计始于 " + date.min + "。"; return; }
      for (const [tool, cell] of rows) {
        if (!Number.isInteger(data.counts[tool])) throw Error();
        cell.textContent = String(data.counts[tool]);
      }
      const firstDay = requested === date.min ? "本日从 " + data.started_at.slice(11, 16) + " 起统计。 " : "";
      status.textContent = firstDay + (requested === data.today ? "更新于北京时间 " + data.updated_at.slice(11, 16) : requested + " 全天记录");
    } catch {
      if (active === controller) {
        for (const [, cell] of rows) cell.textContent = "—";
        status.textContent = "暂时无法读取使用日志，请稍后刷新。";
      }
    } finally { clearTimeout(timeout); }
  }
  date.value = date.max = beijingDay();
  date.addEventListener("change", refresh);
  section.querySelector("button").addEventListener("click", refresh);
  refresh();
})();
