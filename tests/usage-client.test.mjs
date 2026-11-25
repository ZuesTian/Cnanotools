import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";

const script = readFileSync(new URL("../usage-client.js", import.meta.url), "utf8");
const turn = () => new Promise(resolve => setImmediate(resolve));
function page(storage, requests, send = () => true) {
  const handlers = {};
  const add = (key, cb) => { handlers[key] = cb; };
  vm.runInNewContext(script, {
    document: {documentElement: {dataset: {usageTool: "uv"}}, addEventListener: add},
    window: {addEventListener: add}, location: {protocol: "https:", hostname: "uv-spectrum.47.236.76.214.nip.io"},
    crypto: webcrypto, navigator: {}, URLSearchParams,
    localStorage: {getItem: k => storage.get(k), setItem: (k,v) => storage.set(k,v)},
    fetch: async (url, options) => { requests.push(Object.fromEntries(options.body)); return {ok: send()}; },
  });
  return (id, trusted = true) => handlers.click({
    isTrusted: trusted, target: {closest: selector => selector.split(", ").includes(id) ? {closest: () => null} : null},
  });
}
test("opening, refreshing, theme changes and scripted clicks do not count", async () => {
  const storage = new Map(), requests = [];
  const click = page(storage, requests);
  click("#theme"); click("#calculateButton", false); await turn();
  assert.equal(requests.length, 0);
  click("#calculateButton"); click("#batchButton"); await turn();
  page(storage, requests)("#exportButton"); await turn();
  assert.equal(requests.length, 1);
  assert.deepEqual(Object.keys(requests[0]).sort(), ["day", "tool", "visitor"]);
});
test("a failed submission retries with the same anonymous identifier", async () => {
  const storage = new Map(), requests = [];
  page(storage, requests, () => false)("#calculateButton"); await turn();
  page(storage, requests); await turn();
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[0], requests[1]);
});
