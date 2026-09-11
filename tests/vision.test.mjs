import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getScale, getImageTransform, viewportToImagePoint, imageToViewportPoint, scaleMatches, measurePixelDistance, detectImageType, buildRequest, requestAnswer, API_URL, QUESTIONS } from "../vision/core.mjs";

const image = { width: 1024, height: 768, dataUrl: "data:image/png;base64,TEST_ONLY" };
const input = { image, imageType: "TEM", scale: null, history: [], question: "分布均匀吗？" };

test("request preserves original image and question without exposing model selection", () => {
  const payload = buildRequest(input);
  assert.deepEqual(Object.keys(payload), ["messages"]);
  assert.equal(payload.messages[0].content[1].image_url.url, image.dataUrl);
  assert.equal(payload.messages[0].content[1].image_url.detail, "original");
  assert.equal(payload.messages.at(-1).content, input.question);
  assert.match(payload.messages[0].content[0].text, /未提供像素标定/);
  assert.ok(payload.messages.every((message) => message.role !== "system"));
  assert.equal(Object.keys(QUESTIONS).length, 3);
});

test("scale requires a complete positive finite pair; units are preserved", () => {
  assert.equal(getScale("", "", "nm"), null);
  assert.deepEqual(getScale("200", "100", "nm"), { pixels: 200, length: 100, unit: "nm", perPixel: .5 });
  assert.equal(getScale("50", "2", "µm").perPixel, .04);
  for (const args of [["", "2", "nm"], ["2", "", "nm"], ["0", "4", "nm"], ["-1", "4", "nm"], ["x", "4", "nm"], ["1", "Infinity", "nm"], ["1", "4", "m"], ["1e-300", "1e300", "nm"]]) {
    assert.throws(() => getScale(...args));
  }
});

test("calibration and successful conversation turns are retained, image is sent only once per request", () => {
  const history = [{ role: "user", content: "哪里团聚？" }, { role: "assistant", content: "图像右上方。" }];
  const payload = buildRequest({ ...input, scale: getScale("100", "2", "µm"), history });
  assert.match(payload.messages[0].content[0].text, /100 px = 2 µm/);
  assert.equal(payload.messages.length, 4);
  assert.deepEqual(payload.messages.slice(1, 3), history);
  assert.equal(JSON.stringify(payload).split(image.dataUrl).length - 1, 1);
  assert.throws(() => buildRequest({ ...input, image: null }));
  assert.throws(() => buildRequest({ ...input, question: " " }));
});

test("image file signatures reject SVG, TIFF and renamed non-images", () => {
  assert.equal(detectImageType(Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])), "image/png");
  assert.equal(detectImageType(Uint8Array.from([255, 216, 255])), "image/jpeg");
  assert.equal(detectImageType(new TextEncoder().encode("RIFF0000WEBP")), "image/webp");
  for (const data of ["<svg></svg>", "II*\x00", "not an image", ""]) assert.throws(() => detectImageType(new TextEncoder().encode(data)));
});

test("scale picker maps landscape and portrait previews to original pixels, excluding letterboxing", () => {
  const viewport = { width: 500, height: 400 }, size = { width: 2000, height: 1000 };
  const transform = getImageTransform(viewport, size, .25, { x: 0, y: 0 });
  assert.deepEqual(transform, { x: 0, y: 75, scale: .25 });
  assert.deepEqual(viewportToImagePoint({ x: 50, y: 100 }, transform, size), { x: 200, y: 100 });
  for (const point of [{ x: 50, y: 50 }, { x: 50, y: 350 }, { x: -1, y: 100 }, { x: 501, y: 100 }]) assert.equal(viewportToImagePoint(point, transform, size), null);
  assert.deepEqual(viewportToImagePoint({ x: 500, y: 325 }, transform, size), { x: 2000, y: 1000 });
  const portrait = { width: 1000, height: 2000 };
  const portraitTransform = getImageTransform(viewport, portrait, .2, { x: 0, y: 0 });
  assert.deepEqual(viewportToImagePoint({ x: 250, y: 200 }, portraitTransform, portrait), { x: 500, y: 1000 });
  assert.equal(viewportToImagePoint({ x: 30, y: 200 }, portraitTransform, portrait), null);
});

test("scale distance is invariant under preview resizing and works for diagonal or reversed points", () => {
  for (const width of [300, 500, 1000]) {
    const viewport = { width, height: width * .8 }, size = { width: 2000, height: 1000 };
    const transform = getImageTransform(viewport, size, width / size.width, { x: 0, y: 0 });
    const points = [{ x: 200, y: 300 }, { x: 500, y: 700 }].map((point) => viewportToImagePoint(imageToViewportPoint(point, transform), transform, size));
    assert.ok(Math.abs(measurePixelDistance(...points) - 500) < 1e-9);
    assert.ok(Math.abs(measurePixelDistance(points[1], points[0]) - 500) < 1e-9);
  }
  assert.throws(() => measurePixelDistance({ x: 10, y: 10 }, { x: 10, y: 10 }));
  assert.throws(() => measurePixelDistance({ x: 10, y: 10 }, { x: 10.5, y: 10.5 }));
});

test("zoom and pan preserve original coordinates even at fractional CSS sizes", () => {
  const size = { width: 2048, height: 1024 };
  for (const scale of [.1, .37, 1, 2.5, 8]) {
    const transform = getImageTransform({ width: 511.375, height: 419.625 }, size, scale, { x: -127.2, y: 58.7 });
    const expected = { x: 321.25, y: 901.75 };
    const actual = viewportToImagePoint(imageToViewportPoint(expected, transform), transform, size);
    assert.ok(Math.abs(actual.x - expected.x) < 1e-9);
    assert.ok(Math.abs(actual.y - expected.y) < 1e-9);
  }
});

test("unconfirmed units and changed calibration cannot match the applied scale", () => {
  const applied = getScale("200", "10", "µm");
  assert.throws(() => getScale("200", "10", ""), /请选择标尺单位/);
  assert.equal(scaleMatches(getScale("200", "10", "nm"), applied), false);
  assert.equal(scaleMatches(getScale("100", "10", "µm"), applied), false);
  assert.equal(scaleMatches(getScale("200", "20", "µm"), applied), false);
  assert.equal(scaleMatches(getScale("200", "10", "µm"), applied), true);
  assert.equal(scaleMatches(null, applied), false);
  assert.equal(scaleMatches(null, null), true);
});

test("a picked 10 µm scale reaches the model as a calibrated original-image span", () => {
  const pixels = measurePixelDistance({ x: 100, y: 600 }, { x: 300, y: 600 });
  const scale = getScale(String(pixels), "10", "µm");
  const payload = buildRequest({ ...input, scale });
  assert.match(payload.messages[0].content[0].text, /200 px = 10 µm/);
  assert.match(payload.messages[0].content[0].text, /每像素 0.05 µm/);
  assert.equal(payload.messages[0].content[1].image_url.url, image.dataUrl);
});

test("requests go only to the portal gateway without credentials or redirects", async () => {
  const payload = buildRequest(input);
  const result = await requestAnswer({ payload, fetchImpl: async (url, options) => {
    assert.equal(url, API_URL);
    assert.equal(url, "https://cnt-vision.47.236.76.214.nip.io/api/chat");
    assert.equal(options.headers.Authorization, undefined);
    assert.equal(options.redirect, "error");
    assert.equal(options.credentials, "omit");
    assert.deepEqual(JSON.parse(options.body), payload);
    return { ok: true, json: async () => ({ choices: [{ message: { content: "观察结果" }, finish_reason: "length" }] }) };
  } });
  assert.deepEqual(result, { content: "观察结果", truncated: true });
});

test("HTTP, empty and malformed responses do not produce fake answers or expose raw errors", async () => {
  for (const status of [400, 401, 402, 403, 413, 422, 429, 500]) {
    await assert.rejects(requestAnswer({ payload: {}, key: "TEST_KEY", fetchImpl: async () => ({ ok: false, status }) }), (error) => !error.message.includes("TEST_KEY"));
  }
  for (const json of [async () => ({}), async () => ({ choices: [{ message: { content: "" } }] }), async () => { throw new Error("bad JSON"); }]) {
    await assert.rejects(requestAnswer({ payload: {}, key: "TEST_KEY", fetchImpl: async () => ({ ok: true, json }) }));
  }
});

test("cancellation propagates to fetch", async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(requestAnswer({ payload: {}, key: "TEST_KEY", signal: controller.signal, fetchImpl: async (_url, { signal }) => {
    assert.equal(signal, controller.signal); signal.throwIfAborted();
  } }), { name: "AbortError" });
});

test("page references and IDs resolve; no application persistence or unsafe HTML injection", () => {
  const pageUrl = new URL("../vision/index.html", import.meta.url);
  const html = readFileSync(pageUrl, "utf8");
  const app = readFileSync(new URL("../vision/app.mjs", import.meta.url), "utf8");
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const match of app.matchAll(/\$\("([^"]+)"\)/g)) assert.ok(ids.includes(match[1]), `Missing element ${match[1]}`);
  for (const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
    if (match[1].startsWith("https:")) continue;
    const url = new URL(match[1], pageUrl); url.search = "";
    assert.ok(existsSync(fileURLToPath(url)), `Missing local asset ${match[1]}`);
  }
  assert.doesNotMatch(app, /innerHTML|localStorage|sessionStorage|console\./);
  assert.match(html, /connect-src https:\/\/cnt-vision.47.236.76.214.nip.io/);
  assert.doesNotMatch(html, /id="connection"/);
  assert.doesNotMatch(html, /id="apiKey"/);
  assert.doesNotMatch(html, /id="model"/);
  for (const file of ["index.html", "app.mjs", "core.mjs", "viewer.mjs", "styles.css"]) {
    assert.doesNotMatch(readFileSync(new URL(`../vision/${file}`, import.meta.url), "utf8"), /deepseek|4\.1\s*flash/i);
  }
  assert.match(app, /碳管视觉助手/);
  const portal = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(portal, /href="vision\/"/);
  const indexes = [...portal.matchAll(/class="tool-index">(\d+)/g)].map((match) => Number(match[1]));
  assert.deepEqual(indexes, [1,2,3,4,5,6,7,8,9,10]);
});
