import { MAX_BYTES, QUESTIONS, getScale, scaleMatches, measurePixelDistance, detectImageType, buildRequest, requestAnswer } from "./core.mjs?v=20260911-neutral";
import { ImageViewer } from "./viewer.mjs?v=20260911-neutral";

const $ = (id) => document.getElementById(id);
let image = null;
let history = [];
let activeRequest = null;
let loadingImage = false;
let pickingScale = false;
let scalePoints = [];
let appliedScale = null;
let appliedPoints = [];
const viewer = new ImageViewer($("imageCanvas"), {
  onPoints(points) {
    scalePoints = points;
    $("scalePixels").value = points.length === 2 ? String(Number(Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y).toFixed(6))) : "";
    updateScaleNote(); updatePickerNote(); sync();
  },
  onView(scale) { $("zoomValue").textContent = `${Math.round(scale * 100)}%`; },
});

function readDraftScale() {
  const scale = getScale($("scalePixels").value, $("scaleLength").value, $("scaleUnit").value);
  if (scale && scale.pixels < 1) throw new Error("标尺跨度应至少为 1 个原图像素，请放大图像后重新选择。");
  if (scale && image && scale.pixels > Math.hypot(image.width, image.height) + 1e-6) throw new Error("标尺像素长度大于图像对角线，请检查输入。");
  return scale;
}

function hasScaleChanges() {
  if (pickingScale) return true;
  try { return !scaleMatches(readDraftScale(), appliedScale); }
  catch { return true; }
}

function feedback(message = "", error = false) {
  $("feedback").textContent = message;
  $("feedback").hidden = !message;
  $("feedback").dataset.error = String(error);
}

function sync() {
  const busy = Boolean(activeRequest) || loadingImage;
  const scaleChanged = hasScaleChanges();
  $("sendQuestion").disabled = busy || scaleChanged || !image || !$("question").value.trim();
  $("sendQuestion").textContent = activeRequest ? "正在分析…" : "发送问题 ↑";
  $("stopRequest").hidden = !activeRequest;
  $("removeImage").disabled = busy || !image;
  $("chooseImage").disabled = busy;
  $("imageFile").disabled = busy;
  $("sampleFields").disabled = busy;
  $("pickScale").disabled = busy || !image;
  $("pickScale").textContent = pickingScale ? "重新点选两端" : appliedPoints.length ? "重新标定" : "点选标尺两端";
  $("pickScale").setAttribute("aria-pressed", String(pickingScale));
  $("cancelScale").hidden = !scaleChanged;
  $("clearScale").disabled = busy || (!appliedScale && !scaleChanged);
  let draft;
  try { draft = readDraftScale(); } catch { draft = null; }
  $("applyScale").disabled = busy || !image || !draft || (pickingScale && scalePoints.length !== 2);
  $("scaleState").textContent = scaleChanged ? "待应用" : appliedScale ? "已生效" : "未标定";
  $("scaleState").dataset.state = scaleChanged ? "draft" : appliedScale ? "applied" : "empty";
  viewer.enabled = !busy;
  for (const id of ["zoomOut", "zoomIn", "fitImage", "actualSize", "enhanceImage"]) $(id).disabled = !image;
  $("viewerStatus").hidden = !image;
  $("viewerStatus").textContent = pickingScale ? "标定模式 · 拖动 A / B 微调" : appliedScale ? `已标定 · ${appliedScale.length} ${appliedScale.unit}` : "浏览模式 · 滚轮缩放 / 拖动平移";
  $("dropZone").classList.toggle("picking-scale", pickingScale);
  $("clearChat").disabled = busy || !history.length;
  $("question").disabled = busy;
  document.querySelectorAll("[data-question]").forEach((button) => { button.disabled = busy; });
  $("sendHint").textContent = loadingImage ? "正在读取图像…" : activeRequest ? "图像已发送，等待模型回答" : scaleChanged ? "请应用或取消标定修改" : !image ? "先选择一张图像" : "Ctrl / ⌘ + Enter 发送";
}

function updatePickerNote() {
  $("pickScaleNote").textContent = pickingScale
    ? scalePoints.length === 2 ? "已选 A / B，可拖动微调；A/B 键切换端点，方向键移动 1 px（Shift 为 10 px）。填写长度和单位后应用。" : scalePoints.length === 1 ? "已选 A，请点击标尺另一端 B；滚轮可放大，空格 + 拖动平移。" : "请在标尺两端分别点选 A / B。鼠标附近显示局部放大图；Esc 取消修改。"
    : appliedScale ? "标定已生效。重新标定时，修改需要再次应用才会发送给模型。" : "先放大标尺，再点选两端；也可手动输入原图像素长度。";
}

function resetScalePicker() {
  pickingScale = false; scalePoints = []; appliedScale = null; appliedPoints = [];
  viewer.setMeasuring(false); viewer.setPoints([]); updatePickerNote();
}

function cancelScalePicker() {
  pickingScale = false;
  scalePoints = appliedPoints.map((point) => ({ ...point }));
  $("scalePixels").value = appliedScale ? String(appliedScale.pixels) : "";
  $("scaleLength").value = appliedScale ? String(appliedScale.length) : "";
  $("scaleUnit").value = appliedScale?.unit || "";
  viewer.setMeasuring(false); viewer.setPoints(scalePoints);
  updateScaleNote(); updatePickerNote(); sync();
}

function clearChat(notice = "") {
  history = [];
  $("messages").querySelectorAll(".message").forEach((node) => node.remove());
  $("chatEmpty").hidden = false;
  feedback(notice);
  sync();
}

function appendMessage(role, content, pending = false) {
  $("chatEmpty").hidden = true;
  const article = document.createElement("article");
  article.className = `message ${role}${pending ? " pending" : ""}`;
  const heading = document.createElement("div");
  heading.className = "message-role";
  heading.textContent = role === "user" ? "你" : "碳管视觉助手";
  const body = document.createElement("div");
  body.className = "message-body";
  body.textContent = content;
  article.append(heading, body);
  if (role === "assistant" && !pending) {
    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "copy-answer";
    copy.textContent = "复制";
    copy.setAttribute("aria-label", "复制这条回答");
    copy.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(content); feedback("回答已复制。"); }
      catch { feedback("无法访问剪贴板，请选中回答文字后复制。", true); }
    });
    heading.append(copy);
  }
  $("messages").append(article);
  article.scrollIntoView({ block: "nearest" });
  return article;
}

async function loadImage(file) {
  if (!file || activeRequest || loadingImage) return;
  feedback();
  if (file.size > MAX_BYTES) { feedback("图像超过 12 MB，请先导出较小的 PNG / JPG / WebP。", true); return; }
  loadingImage = true;
  sync();
  try {
    const mime = detectImageType(new Uint8Array(await file.slice(0, 12).arrayBuffer()));
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("文件读取失败，请重新选择。"));
      reader.readAsDataURL(new Blob([file], { type: mime }));
    });
    const decoded = new Image();
    decoded.src = dataUrl;
    try { await decoded.decode(); } catch { throw new Error("无法解码这张图像，文件可能损坏。请转换为 PNG 后重试。"); }
    if (!decoded.naturalWidth || !decoded.naturalHeight || Math.max(decoded.naturalWidth, decoded.naturalHeight) > 8192) {
      throw new Error("图像每边必须在 1–8192 px 之间，请调整图像尺寸后重试。");
    }
    image = { dataUrl, width: decoded.naturalWidth, height: decoded.naturalHeight };
    viewer.setImage(decoded);
    $("uploadEmpty").hidden = true;
    $("imageInfo").textContent = `${file.name || "粘贴图像"} · ${image.width} × ${image.height} px`;
    $("scalePixels").value = "";
    $("scaleLength").value = "";
    $("scaleUnit").value = "";
    $("imageType").value = "未指定";
    resetScalePicker();
    updateScaleNote();
    clearChat("图像已就绪，可选择快捷问题或直接输入。");
  } catch (error) { feedback(error.message, true); }
  finally { loadingImage = false; $("imageFile").value = ""; sync(); }
}

function updateScaleNote() {
  try {
    const scale = readDraftScale();
    $("scaleEquation").textContent = scale ? `${Number(scale.pixels.toFixed(3))} px = ${scale.length} ${scale.unit}` : "未设置标尺";
    $("scaleNote").textContent = scale ? `1 px = ${Number(scale.perPixel.toPrecision(6))} ${scale.unit} = ${Number((scale.perPixel * (scale.unit === "µm" ? 1000 : 1)).toPrecision(6))} nm。${hasScaleChanges() ? "点击“应用标定”后生效。" : "此换算将发送给模型。"}` : "例如图中标尺为 10 µm：填入 10，并明确选择 µm。";
  } catch (error) { $("scaleEquation").textContent = "标定信息未完整"; $("scaleNote").textContent = error.message; }
}

$("chooseImage").addEventListener("click", () => $("imageFile").click());
$("pickScale").addEventListener("click", () => {
  if (!image || activeRequest || loadingImage) return;
  pickingScale = true; scalePoints = [];
  $("scalePixels").value = "";
  viewer.setPoints([]); viewer.setMeasuring(true);
  updateScaleNote(); updatePickerNote(); sync();
  $("dropZone").scrollIntoView({ block: "nearest" });
  $("imageCanvas").focus({ preventScroll: true });
});
$("cancelScale").addEventListener("click", cancelScalePicker);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && pickingScale) { event.preventDefault(); cancelScalePicker(); $("pickScale").focus(); }
});
$("applyScale").addEventListener("click", () => {
  if (!image || activeRequest || loadingImage) return;
  try {
    if (pickingScale) {
      if (scalePoints.length !== 2) throw new Error("请先选择标尺的两个端点。");
      measurePixelDistance(...scalePoints);
    }
    const scale = readDraftScale();
    if (!scale) throw new Error("请先填写标尺信息。");
    const changed = !scaleMatches(scale, appliedScale);
    appliedScale = scale;
    appliedPoints = scalePoints.map((point) => ({ ...point }));
    pickingScale = false; viewer.setMeasuring(false);
    if (changed && history.length) clearChat("新标定已生效，旧对话已清空，请重新提问。");
    else feedback("标定已生效，发送时将使用此换算。");
    updateScaleNote(); updatePickerNote(); sync();
  } catch (error) { feedback(error.message, true); }
});
$("clearScale").addEventListener("click", () => {
  const wasApplied = Boolean(appliedScale);
  $("scalePixels").value = ""; $("scaleLength").value = ""; $("scaleUnit").value = "";
  resetScalePicker(); updateScaleNote();
  if (wasApplied && history.length) clearChat("已清除标定和对应旧对话，图像已保留。");
  sync();
});
$("zoomIn").addEventListener("click", () => viewer.zoom(1.4));
$("zoomOut").addEventListener("click", () => viewer.zoom(1 / 1.4));
$("fitImage").addEventListener("click", () => viewer.fit());
$("actualSize").addEventListener("click", () => viewer.zoom(1 / viewer.scale));
$("enhanceImage").addEventListener("change", () => { viewer.enhanced = $("enhanceImage").checked; viewer.draw(); });
$("imageFile").addEventListener("change", (event) => loadImage(event.target.files[0]));
$("dropZone").addEventListener("dragover", (event) => { event.preventDefault(); if (!activeRequest && !loadingImage) $("dropZone").classList.add("dragging"); });
$("dropZone").addEventListener("dragleave", () => $("dropZone").classList.remove("dragging"));
$("dropZone").addEventListener("drop", (event) => {
  event.preventDefault(); $("dropZone").classList.remove("dragging");
  if (event.dataTransfer.files.length !== 1) { feedback("每轮分析一张图像，请只拖入一个文件。", true); return; }
  loadImage(event.dataTransfer.files[0]);
});
// Prevent the browser from navigating away if a file lands outside the image panel.
document.addEventListener("dragover", (event) => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); });
document.addEventListener("drop", (event) => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); });
document.addEventListener("paste", (event) => {
  const files = Array.from(event.clipboardData?.files || []);
  if (!files.length) return;
  event.preventDefault();
  if (files.length > 1) { feedback("每轮分析一张图像，请一次粘贴一张。", true); return; }
  loadImage(files[0]);
});
$("removeImage").addEventListener("click", () => {
  image = null;
  viewer.setImage(null); $("uploadEmpty").hidden = false; $("zoomValue").textContent = "—";
  $("imageInfo").textContent = "尚未选择图像";
  $("scalePixels").value = ""; $("scaleLength").value = ""; $("scaleUnit").value = "";
  resetScalePicker();
  updateScaleNote(); clearChat("已移除图像和对应对话。");
});
$("clearChat").addEventListener("click", () => clearChat("对话已清空，当前图像与标定已保留。"));
for (const id of ["scalePixels", "scaleLength", "scaleUnit"]) {
  $(id).addEventListener("input", () => {
    if (id === "scalePixels") { pickingScale = false; scalePoints = []; viewer.setPoints([]); viewer.setMeasuring(false); }
    updateScaleNote(); updatePickerNote(); sync();
  });
}
$("imageType").addEventListener("change", () => { if (history.length) clearChat("图像类型已改变，旧对话已清空，请重新提问。"); });
$("question").addEventListener("input", sync);
document.querySelectorAll("[data-question]").forEach((button) => button.addEventListener("click", () => {
  $("question").value = QUESTIONS[button.dataset.question]; sync(); $("question").focus();
}));
$("question").addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !event.isComposing) {
    event.preventDefault(); $("questionForm").requestSubmit();
  }
});
$("stopRequest").addEventListener("click", () => activeRequest?.abort());
$("questionForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (activeRequest || loadingImage) return;
  if (hasScaleChanges()) { feedback("标定修改尚未生效，请点击“应用标定”或取消修改后再发送。", true); return; }
  feedback();
  const question = $("question").value.trim();
  if (!image || !question) { feedback("请先选择图像并填写问题。", true); return; }
  let payload;
  try {
    payload = buildRequest({ image, imageType: $("imageType").value, scale: appliedScale, history, question });
  } catch (error) { feedback(error.message, true); return; }
  const userMessage = appendMessage("user", question);
  const pending = appendMessage("assistant", "正在读取图像并分析，请稍候…", true);
  const controller = new AbortController();
  activeRequest = controller;
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 120000);
  sync();
  try {
    const answer = await requestAnswer({ payload, signal: controller.signal });
    if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
    pending.remove();
    appendMessage("assistant", answer.content);
    history.push({ role: "user", content: question }, { role: "assistant", content: answer.content });
    $("question").value = "";
    if (answer.truncated) feedback("回答达到输出上限。你可以继续提问“请接着回答”。");
  } catch (error) {
    pending.remove(); userMessage.remove();
    $("chatEmpty").hidden = history.length > 0;
    const message = controller.signal.aborted
      ? timedOut ? "等待超过 2 分钟，已停止等待。问题已保留，可重试。" : "已停止等待，问题已保留。"
      : error instanceof TypeError ? "无法连接视觉服务，请检查网络后重试；问题和图像已保留。" : error.message;
    feedback(message + (controller.signal.aborted ? " 已发送的请求仍可能在服务端完成并计费。" : ""), true);
  } finally {
    clearTimeout(timeout); activeRequest = null; sync(); $("question").focus();
  }
});
window.addEventListener("pagehide", () => activeRequest?.abort());
window.addEventListener("pageshow", sync);
sync();
