import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Exercise real application event handlers with small in-memory UI doubles.
// No browser, real image or API credential is involved.
test("calibration draft/apply/cancel/clear flow never submits unconfirmed values", async () => {
  class Element {
    constructor() {
      this.events = new Map(); this.children = []; this.value = ""; this.style = {};
      this.dataset = {}; this.classList = { toggle() {} };
    }
    addEventListener(name, listener) { this.events.set(name, listener); }
    fire(name, event = {}) { return this.events.get(name)?.({ preventDefault() {}, ...event }); }
    setAttribute() {} focus() {} scrollIntoView() {}
    append(...nodes) { this.children.push(...nodes); nodes.forEach((node) => { node.parent = this; }); }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter((node) => node !== this); }
    querySelectorAll() { return this.children.filter((node) => node.className?.startsWith("message ")); }
    getBoundingClientRect() { return { left: 0, top: 0, width: this.hidden ? 0 : 500, height: this.hidden ? 0 : 400 }; }
    getContext() { return new Proxy({}, { get(target, key) { return key in target ? target[key] : key === "measureText" ? (text) => ({ width: text.length * 8 }) : () => {}; } }); }
  }
  const html = readFileSync(new URL("../vision/index.html", import.meta.url), "utf8");
  const nodes = new Map([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => [match[1], new Element()]));
  const $ = (id) => nodes.get(id);
  globalThis.document = { getElementById: $, querySelectorAll: () => [], addEventListener() {}, createElement: () => new Element() };
  globalThis.window = { devicePixelRatio: 1, addEventListener() {} };
  globalThis.ResizeObserver = class { observe() {} };
  globalThis.Image = class { naturalWidth = 1024; naturalHeight = 768; decode() { return Promise.resolve(); } };
  globalThis.FileReader = class { readAsDataURL() { this.result = "data:image/png;base64,TEST_ONLY"; this.onload(); } };
  const requests = [];
  globalThis.fetch = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({ choices: [{ message: { content: "测试回答" }, finish_reason: "stop" }] }) };
  };
  await import("../vision/app.mjs");
  const file = new Blob([Uint8Array.from([137,80,78,71,13,10,26,10])]);
  await $("imageFile").fire("change", { target: { files: [file] } });
  const input = (id, value) => { $(id).value = value; $(id).fire("input"); };
  input("question", "请估算长度");
  input("scalePixels", "200"); input("scaleLength", "10");
  assert.equal($("applyScale").disabled, true, "unit must be explicitly chosen");
  input("scaleUnit", "µm");
  assert.equal($("scaleState").textContent, "待应用");
  await $("questionForm").fire("submit");
  assert.equal(requests.length, 0);
  $("applyScale").fire("click");
  assert.equal($("scaleState").textContent, "已生效");
  await $("questionForm").fire("submit");
  assert.equal(requests.length, 1);
  assert.match(requests[0].messages[0].content[0].text, /200 px = 10 µm/);

  input("question", "再问一次"); input("scalePixels", "100");
  assert.equal($("sendQuestion").disabled, true);
  await $("questionForm").fire("submit");
  assert.equal(requests.length, 1, "draft must not overwrite applied calibration");
  $("cancelScale").fire("click");
  assert.equal($("scalePixels").value, "200");
  assert.equal($("scaleState").textContent, "已生效");
  assert.equal($("clearChat").disabled, false, "cancel preserves conversation");

  input("scalePixels", "100"); $("applyScale").fire("click");
  assert.equal($("clearChat").disabled, true, "applying changed scale clears old context");
  await $("questionForm").fire("submit");
  assert.match(requests[1].messages[0].content[0].text, /100 px = 10 µm/);
  $("clearScale").fire("click");
  assert.equal($("scaleState").textContent, "未标定");
  assert.equal($("scalePixels").value, "");
  assert.equal($("scaleUnit").value, "");
});
