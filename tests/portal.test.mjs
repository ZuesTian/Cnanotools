import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import vm from "node:vm";

test("each portal card probes JSON and distinguishes an unreadable response", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const cards = [...html.matchAll(/data-service="([^"]+)"/g)].map(hit => hit[1]);
  const source = await readFile(new URL("../app.js", import.meta.url), "utf8");
  const refresh = {disabled: true, addEventListener() {}};
  const context = vm.createContext({
    AbortController, window: {setTimeout, clearTimeout},
    document: {getElementById: () => refresh},
  });
  vm.runInContext(source, context);
  assert.equal(cards.length, 11);
  assert.deepEqual([...vm.runInContext("Object.keys(services)", context)].sort(), cards.sort());
  assert.ok([...vm.runInContext("Object.values(services)", context)].every(url => new URL(url).pathname === "/health"));
  for (const [response, state] of [
    [Response.json({status: "ok"}), "online"],
    [new Response("<html></html>", {headers: {"Content-Type": "text/html"}}), "offline"],
    [new Response("{", {headers: {"Content-Type": "application/json"}}), "offline"],
    [Response.json({status: "unavailable"}, {status: 503}), "offline"],
    [null, "unknown"],
  ]) {
    context.fetch = async () => { if (!response) throw new TypeError("network"); return response; };
    assert.equal(await vm.runInContext("probe('https://example.test/health')", context), state);
  }
});
