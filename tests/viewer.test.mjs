import test from "node:test";
import assert from "node:assert/strict";
import { ImageViewer } from "../vision/viewer.mjs";
import { imageToViewportPoint, viewportToImagePoint, measurePixelDistance } from "../vision/core.mjs";

globalThis.window = { devicePixelRatio: 2 };
globalThis.ResizeObserver = class { observe() {} };

function setup() {
  const calls = [], captures = new Set();
  const ctx = new Proxy({}, { get(target, key) {
    if (key in target) return target[key];
    if (key === "measureText") return (text) => ({ width: text.length * 8 });
    return (...args) => calls.push([key, ...args]);
  } });
  const rect = { left: 20, top: 50, width: 500, height: 400 };
  const canvas = { style: {}, getContext: () => ctx, getBoundingClientRect: () => rect, addEventListener() {}, focus() {}, setPointerCapture: (id) => captures.add(id), hasPointerCapture: (id) => captures.has(id), releasePointerCapture: (id) => captures.delete(id) };
  let latest = [];
  const viewer = new ImageViewer(canvas, { onPoints: (points) => { latest = points; }, onView() {} });
  const image = { naturalWidth: 2000, naturalHeight: 1000 };
  viewer.setImage(image); viewer.setMeasuring(true);
  const event = (x, y) => ({ clientX: rect.left + x, clientY: rect.top + y, pointerId: 1, button: 0, preventDefault() {} });
  const click = (x, y) => { viewer.pointerDown(event(x, y)); viewer.pointerUp(event(x, y)); };
  return { viewer, canvas, rect, event, click, calls, latest: () => latest };
}

test("viewer uses CSS pixels for pointer selection and DPR only for rendering", () => {
  const { viewer, canvas, click, latest, calls } = setup();
  assert.equal(canvas.width, 1000); assert.equal(canvas.height, 800);
  const draw = calls.find(([method]) => method === "drawImage");
  assert.deepEqual(draw.slice(2), [0, 75, 500, 250]);
  click(50, 50); // top letterbox, not part of the image
  assert.equal(viewer.points.length, 0);
  click(50, 100); click(150, 100);
  assert.deepEqual(latest(), [{ x: 200, y: 100 }, { x: 600, y: 100 }]);
  assert.equal(measurePixelDistance(...latest()), 400);
});

test("zoom, pan and viewport resizing keep the selected pixel span unchanged", () => {
  const { viewer, click, rect, event } = setup();
  click(50, 100); click(150, 100);
  const anchor = { x: 150, y: 100 };
  const before = viewportToImagePoint(anchor, viewer.transform, viewer.size);
  viewer.zoom(3, anchor);
  assert.deepEqual(viewportToImagePoint(anchor, viewer.transform, viewer.size), before);
  viewer.space = true;
  viewer.pointerDown(event(200, 200)); viewer.pointerMove(event(240, 220)); viewer.pointerUp(event(240, 220));
  viewer.space = false;
  rect.width = 725.5; rect.height = 511.25; viewer.resize();
  assert.equal(measurePixelDistance(...viewer.points), 400);
});

test("endpoint dragging and keyboard nudges operate in original pixels", () => {
  const { viewer, click, event, latest } = setup();
  click(50, 100); click(150, 100);
  viewer.zoom(2);
  const point = imageToViewportPoint(viewer.points[1], viewer.transform);
  viewer.pointerDown(event(point.x, point.y));
  viewer.pointerMove(event(point.x + 20 * viewer.scale, point.y));
  viewer.pointerUp(event(point.x + 20 * viewer.scale, point.y));
  assert.equal(measurePixelDistance(...latest()), 420);
  viewer.keyDown({ key: "ArrowRight", shiftKey: false, preventDefault() {} });
  assert.equal(measurePixelDistance(...latest()), 421);
  viewer.keyDown({ key: "ArrowLeft", shiftKey: true, preventDefault() {} });
  assert.equal(measurePixelDistance(...latest()), 411);
});

test("a cancelled pointer gesture restores its previous endpoints", () => {
  const { viewer, event, latest } = setup();
  viewer.pointerDown(event(50, 100));
  assert.equal(viewer.points.length, 1);
  viewer.pointerUp(event(50, 100), true);
  assert.deepEqual(latest(), []);
});
