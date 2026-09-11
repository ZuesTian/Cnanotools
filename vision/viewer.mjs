import { getImageTransform, viewportToImagePoint, imageToViewportPoint } from "./core.mjs?v=20260911-neutral";

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const copyPoints = (points) => points.map((point) => ({ ...point }));

export class ImageViewer {
  constructor(canvas, { onPoints, onView }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.onPoints = onPoints;
    this.onView = onView;
    this.image = null;
    this.points = [];
    this.pan = { x: 0, y: 0 };
    this.scale = 1;
    this.fitted = true;
    this.measuring = false;
    this.enabled = true;
    this.enhanced = false;
    this.activeEndpoint = 0;
    this.drag = null;
    this.hover = null;
    this.space = false;
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    canvas.addEventListener("wheel", (event) => {
      if (!this.image) return;
      event.preventDefault();
      this.zoom(event.deltaY < 0 ? 1.2 : 1 / 1.2, this.localPoint(event));
    }, { passive: false });
    canvas.addEventListener("pointerdown", (event) => this.pointerDown(event));
    canvas.addEventListener("pointermove", (event) => this.pointerMove(event));
    canvas.addEventListener("pointerup", (event) => this.pointerUp(event));
    canvas.addEventListener("pointercancel", (event) => this.pointerUp(event, true));
    canvas.addEventListener("pointerleave", () => { if (!this.drag) { this.hover = null; this.draw(); } });
    canvas.addEventListener("keydown", (event) => this.keyDown(event));
    canvas.addEventListener("keyup", (event) => { if (event.code === "Space") { this.space = false; this.updateCursor(); } });
    canvas.addEventListener("blur", () => { this.space = false; this.hover = null; this.updateCursor(); this.draw(); });
  }

  get size() { return { width: this.image.naturalWidth, height: this.image.naturalHeight }; }
  get viewport() { const rect = this.canvas.getBoundingClientRect(); return { width: rect.width, height: rect.height }; }
  get transform() { return getImageTransform(this.viewport, this.size, this.scale, this.pan); }
  localPoint(event) { const rect = this.canvas.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; }

  setImage(image) {
    this.image = image;
    this.points = []; this.hover = null; this.drag = null; this.measuring = false;
    this.canvas.hidden = !image;
    if (image) this.fit(); else this.draw();
  }

  setPoints(points) { this.points = copyPoints(points); this.draw(); }
  setMeasuring(value) { this.measuring = value; this.hover = null; this.updateCursor(); this.draw(); }
  updateCursor() { this.canvas.style.cursor = this.measuring && !this.space ? "crosshair" : this.drag ? "grabbing" : "grab"; }

  resize() {
    const { width, height } = this.viewport;
    if (!width || !height) return;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    if (this.image && this.fitted) this.scale = Math.min(width / this.size.width, height / this.size.height);
    this.draw();
  }

  fit() {
    this.fitted = true; this.pan = { x: 0, y: 0 };
    this.resize();
  }

  zoom(factor, anchor = { x: this.viewport.width / 2, y: this.viewport.height / 2 }) {
    if (!this.image) return;
    const old = this.transform;
    const source = { x: (anchor.x - old.x) / old.scale, y: (anchor.y - old.y) / old.scale };
    this.scale = clamp(this.scale * factor, .005, 8);
    this.fitted = false;
    this.pan = {
      x: anchor.x - source.x * this.scale - (this.viewport.width - this.size.width * this.scale) / 2,
      y: anchor.y - source.y * this.scale - (this.viewport.height - this.size.height * this.scale) / 2,
    };
    this.draw();
  }

  pointerDown(event) {
    if (!this.image || !this.enabled || this.drag || event.button !== 0) return;
    event.preventDefault();
    this.canvas.focus({ preventScroll: true });
    const local = this.localPoint(event);
    const point = viewportToImagePoint(local, this.transform, this.size);
    const previous = copyPoints(this.points);
    let endpoint = -1;
    if (this.measuring && !this.space) {
      endpoint = this.points.findIndex((p) => {
        const screen = imageToViewportPoint(p, this.transform);
        return Math.hypot(local.x - screen.x, local.y - screen.y) <= 15;
      });
      if (endpoint < 0 && this.points.length < 2) {
        if (!point) return;
        endpoint = this.points.length;
        this.points.push(point);
      }
    }
    this.drag = { id: event.pointerId, endpoint, start: local, pan: { ...this.pan }, previous };
    if (endpoint >= 0) {
      this.activeEndpoint = endpoint;
      this.hover = this.points[endpoint];
      this.onPoints(copyPoints(this.points));
    }
    this.canvas.setPointerCapture(event.pointerId);
    this.updateCursor(); this.draw();
  }

  pointerMove(event) {
    if (!this.image) return;
    const local = this.localPoint(event);
    this.hover = viewportToImagePoint(local, this.transform, this.size);
    if (this.drag && this.drag.id === event.pointerId) {
      if (this.drag.endpoint >= 0) {
        const transform = this.transform;
        const point = { x: clamp((local.x - transform.x) / transform.scale, 0, this.size.width), y: clamp((local.y - transform.y) / transform.scale, 0, this.size.height) };
        this.points[this.drag.endpoint] = point;
        this.hover = point;
        this.onPoints(copyPoints(this.points));
      } else {
        this.fitted = false;
        this.pan = { x: this.drag.pan.x + local.x - this.drag.start.x, y: this.drag.pan.y + local.y - this.drag.start.y };
      }
    }
    this.draw();
  }

  pointerUp(event, cancel = false) {
    if (this.drag?.id !== event.pointerId) return;
    if (cancel && this.drag.endpoint >= 0) {
      this.points = this.drag.previous;
      this.onPoints(copyPoints(this.points));
    }
    this.drag = null;
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
    this.updateCursor(); this.draw();
  }

  keyDown(event) {
    if (!this.image) return;
    if (event.code === "Space") { event.preventDefault(); this.space = true; this.updateCursor(); return; }
    if (!this.measuring || !this.enabled) return;
    if (["a", "b"].includes(event.key.toLowerCase())) { this.activeEndpoint = event.key.toLowerCase() === "a" ? 0 : 1; return; }
    const move = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    const point = this.points[this.activeEndpoint];
    if (!move || !point) return;
    event.preventDefault();
    const step = event.shiftKey ? 10 : 1;
    point.x = clamp(point.x + move[0] * step, 0, this.size.width);
    point.y = clamp(point.y + move[1] * step, 0, this.size.height);
    this.hover = { ...point };
    this.onPoints(copyPoints(this.points)); this.draw();
  }

  drawTag(text, x, y, foreground = "#15362b") {
    const ctx = this.ctx;
    ctx.font = '600 14px "Segoe UI", "Microsoft YaHei", sans-serif';
    const width = ctx.measureText(text).width + 16;
    x = clamp(x, 6, Math.max(6, this.viewport.width - width - 6));
    y = clamp(y, 6, Math.max(6, this.viewport.height - 30));
    ctx.fillStyle = "#d1eb83"; ctx.fillRect(x, y, width, 26);
    ctx.fillStyle = foreground; ctx.fillText(text, x + 8, y + 18);
  }

  drawMagnifier(point) {
    const ctx = this.ctx;
    const size = Math.min(160, this.viewport.width * .42);
    const screen = imageToViewportPoint(point, this.transform);
    const x = screen.x > this.viewport.width / 2 ? 12 : this.viewport.width - size - 12;
    const y = 46;
    const scale = Math.max(this.scale * 3, 2);
    ctx.save();
    ctx.fillStyle = "#071412"; ctx.fillRect(x, y, size, size);
    ctx.beginPath(); ctx.rect(x, y, size, size); ctx.clip();
    ctx.filter = this.enhanced ? "contrast(1.5) brightness(1.05)" : "none";
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.image, x + size / 2 - point.x * scale, y + size / 2 - point.y * scale, this.size.width * scale, this.size.height * scale);
    ctx.restore();
    ctx.strokeStyle = "#d1eb83"; ctx.lineWidth = 2; ctx.strokeRect(x, y, size, size);
    ctx.beginPath(); ctx.moveTo(x + size / 2 - 12, y + size / 2); ctx.lineTo(x + size / 2 + 12, y + size / 2);
    ctx.moveTo(x + size / 2, y + size / 2 - 12); ctx.lineTo(x + size / 2, y + size / 2 + 12);
    ctx.strokeStyle = "#000"; ctx.lineWidth = 4; ctx.stroke();
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 1; ctx.stroke();
    this.drawTag(`局部 ${scale.toFixed(1)}×`, x, y + size + 4);
  }

  draw() {
    const { width, height } = this.viewport;
    if (!width || !height) return;
    const ctx = this.ctx;
    ctx.setTransform(this.canvas.width / width, 0, 0, this.canvas.height / height, 0, 0);
    ctx.clearRect(0, 0, width, height);
    if (!this.image) return;
    const transform = this.transform;
    ctx.save();
    ctx.filter = this.enhanced ? "contrast(1.5) brightness(1.05)" : "none";
    ctx.imageSmoothingEnabled = this.scale < 1;
    ctx.drawImage(this.image, transform.x, transform.y, this.size.width * this.scale, this.size.height * this.scale);
    ctx.restore();
    const points = this.points.map((point) => imageToViewportPoint(point, transform));
    const provisional = this.measuring && points.length === 1 && this.hover;
    const end = points[1] || (provisional && imageToViewportPoint(this.hover, transform));
    if (points[0] && end) {
      ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y); ctx.lineTo(end.x, end.y);
      ctx.setLineDash(provisional ? [6, 5] : []);
      ctx.strokeStyle = "#071412"; ctx.lineWidth = 6; ctx.stroke();
      ctx.strokeStyle = "#d1eb83"; ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]);
      const sourceEnd = this.points[1] || this.hover;
      const pixels = Math.hypot(sourceEnd.x - this.points[0].x, sourceEnd.y - this.points[0].y);
      this.drawTag(`${pixels.toFixed(2)} px${provisional ? " · 预览" : ""}`, (points[0].x + end.x) / 2, (points[0].y + end.y) / 2 - 36);
    }
    points.forEach((point, index) => {
      ctx.beginPath(); ctx.arc(point.x, point.y, 7, 0, Math.PI * 2);
      ctx.fillStyle = this.measuring && this.activeEndpoint === index ? "#ffffff" : "#d1eb83"; ctx.fill();
      ctx.strokeStyle = "#071412"; ctx.lineWidth = 3; ctx.stroke();
      this.drawTag(index === 0 ? "A" : "B", point.x + 12, point.y + 12);
    });
    if (this.measuring && this.hover) this.drawMagnifier(this.hover);
    this.onView(this.scale);
  }
}
