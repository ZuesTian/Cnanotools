"use strict";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const state = {
  image: null,
  file: null,
  sourceCanvas: document.createElement("canvas"),
  binaryCanvas: document.createElement("canvas"),
  overlayCanvas: document.createElement("canvas"),
  view: "overlay",
  result: null,
  baseFiles: [],
  experimentFiles: [],
  comparison: null,
};

const els = {
  imageInput: $("#imageInput"),
  dropZone: $("#dropZone"),
  fileSummary: $("#fileSummary"),
  fileName: $("#fileName"),
  fileMeta: $("#fileMeta"),
  clearImage: $("#clearImage"),
  thumbCanvas: $("#thumbCanvas"),
  analysisScope: $("#analysisScope"),
  scaleUm: $("#scaleUm"),
  scalePixels: $("#scalePixels"),
  sensitivity: $("#sensitivity"),
  sensitivityValue: $("#sensitivityValue"),
  minArea: $("#minArea"),
  minAreaValue: $("#minAreaValue"),
  minSlenderness: $("#minSlenderness"),
  minSlendernessValue: $("#minSlendernessValue"),
  darkTarget: $("#darkTarget"),
  analyzeButton: $("#analyzeButton"),
  resetParams: $("#resetParams"),
  canvasStage: $("#canvasStage"),
  emptyState: $("#emptyState"),
  processingState: $("#processingState"),
  processingTitle: $("#processingTitle"),
  processingDetail: $("#processingDetail"),
  imageCanvas: $("#imageCanvas"),
  canvasLegend: $("#canvasLegend"),
  imageDimensions: $("#imageDimensions"),
  downloadOverlay: $("#downloadOverlay"),
  exportMetrics: $("#exportMetrics"),
  histogramCanvas: $("#histogramCanvas"),
  heatmapCanvas: $("#heatmapCanvas"),
  comparisonCanvas: $("#comparisonCanvas"),
  toast: $("#toast"),
  baseInput: $("#baseInput"),
  experimentInput: $("#experimentInput"),
  baseFiles: $("#baseFiles"),
  experimentFiles: $("#experimentFiles"),
  baseCount: $("#baseCount"),
  experimentCount: $("#experimentCount"),
  compareButton: $("#compareButton"),
  compareResults: $("#compareResults"),
  comparisonTableBody: $("#comparisonTableBody"),
  exportComparison: $("#exportComparison"),
};

function showToast(message, type = "info") {
  els.toast.textContent = message;
  els.toast.className = `toast show${type === "error" ? " error" : ""}`;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    els.toast.className = "toast";
  }, 3200);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatNumber(value, digits = 1) {
  return Number.isFinite(value) ? Number(value).toFixed(digits) : "—";
}

function getParameters() {
  return {
    scope: els.analysisScope.value,
    scaleUm: clamp(Number(els.scaleUm.value) || 10, 0.1, 1000),
    scalePixels: clamp(Number(els.scalePixels.value) || 100, 1, 10000),
    sensitivity: Number(els.sensitivity.value),
    minArea: Number(els.minArea.value),
    minSlenderness: Number(els.minSlenderness.value) / 10,
    darkTarget: els.darkTarget.checked,
  };
}

function getRoi(width, height, scope) {
  let ratio = 1;
  if (scope === "center75") ratio = 0.75;
  if (scope === "center50") ratio = 0.5;
  const w = Math.max(1, Math.round(width * ratio));
  const h = Math.max(1, Math.round(height * ratio));
  return {
    x: Math.floor((width - w) / 2),
    y: Math.floor((height - h) / 2),
    width: w,
    height: h,
  };
}

function switchPage(page) {
  const labels = { single: "单图分析", compare: "组间对比", method: "方法说明" };
  $$('[data-page-panel]').forEach((panel) => panel.classList.toggle("active", panel.dataset.pagePanel === page));
  $$('[data-page]').forEach((button) => button.classList.toggle("active", button.dataset.page === page));
  $("#currentSection").textContent = labels[page] || "OptCNT";
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (page === "single") window.setTimeout(drawCharts, 30);
  if (page === "compare" && state.comparison) window.setTimeout(drawComparisonChart, 30);
}

function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith("image/") && !/\.tiff?$/i.test(file.name)) {
      reject(new Error("请选择 JPG、PNG、BMP、WebP 或浏览器可解码的 TIFF 图像。"));
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      reject(new Error("单张图像不能超过 25 MB。"));
      return;
    }
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("浏览器无法解码该图像。TIFF 兼容性因浏览器而异，建议转换为 PNG。"));
    };
    image.src = url;
  });
}

async function selectSingleFile(file) {
  try {
    const image = await loadImageFile(file);
    state.file = file;
    state.image = image;
    state.result = null;

    const maxAnalysisSide = 1400;
    const scale = Math.min(1, maxAnalysisSide / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    state.sourceCanvas.width = width;
    state.sourceCanvas.height = height;
    const ctx = state.sourceCanvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(image, 0, 0, width, height);

    els.fileName.textContent = file.name;
    els.fileMeta.textContent = `${image.naturalWidth} × ${image.naturalHeight} px · ${formatBytes(file.size)}`;
    els.fileSummary.classList.remove("hidden");
    els.dropZone.classList.add("hidden");
    els.analyzeButton.disabled = false;
    els.imageDimensions.textContent = `${image.naturalWidth} × ${image.naturalHeight} px · 等待分析`;
    drawThumbnail();
    renderCanvas(state.sourceCanvas, false);
    resetResults();
    showToast("图像已载入，原图只保留在当前浏览器内存中。" );
  } catch (error) {
    showToast(error.message || "图像载入失败。", "error");
  } finally {
    els.imageInput.value = "";
  }
}

function drawThumbnail() {
  const ctx = els.thumbCanvas.getContext("2d");
  ctx.clearRect(0, 0, 72, 54);
  const src = state.sourceCanvas;
  const scale = Math.max(72 / src.width, 54 / src.height);
  const w = src.width * scale;
  const h = src.height * scale;
  ctx.drawImage(src, (72 - w) / 2, (54 - h) / 2, w, h);
}

function clearSingleImage() {
  state.image = null;
  state.file = null;
  state.result = null;
  state.sourceCanvas.width = 1;
  state.sourceCanvas.height = 1;
  els.fileSummary.classList.add("hidden");
  els.dropZone.classList.remove("hidden");
  els.analyzeButton.disabled = true;
  els.downloadOverlay.disabled = true;
  els.exportMetrics.disabled = true;
  els.canvasStage.className = "canvas-stage empty";
  els.emptyState.classList.remove("hidden");
  els.processingState.classList.add("hidden");
  els.canvasLegend.classList.add("hidden");
  els.imageCanvas.width = 1;
  els.imageCanvas.height = 1;
  els.imageDimensions.textContent = "尚未载入图像";
  resetResults();
}

function resetResults() {
  const ids = ["uniformityScore", "metricCount", "metricDispersed", "metricGridCv", "metricAggArea", "metricP90Width", "metricMeanLength"];
  ids.forEach((id) => { $(`#${id}`).textContent = "—"; });
  $("#uniformityLabel").textContent = "等待分析";
  $("#uniformityHint").textContent = "导入图像后生成快速判断";
  $("#resultState").textContent = "WAITING";
  $("#resultNarrative").textContent = "浏览器端结果用于快速筛选；正式报告请以 OptCNT 桌面端骨架分析为准。";
  $("#scoreRing").style.background = "conic-gradient(var(--lime) 0deg, rgba(255, 255, 255, .11) 0)";
  $("#histogramMeta").textContent = "—";
  $("#insightList").innerHTML = `
    <li class="neutral"><span>i</span><p>数量多不等于分布均匀；请同时查看分散比例与网格 CV。</p></li>
    <li class="neutral"><span>i</span><p>当前网页采用连通域近似，不能替代桌面端的骨架分支消歧。</p></li>`;
  drawEmptyChart(els.histogramCanvas, "分析后显示长度分布");
  drawEmptyChart(els.heatmapCanvas, "分析后显示空间密度");
}

function renderCanvas(source, showLegend = false) {
  const target = els.imageCanvas;
  target.width = source.width;
  target.height = source.height;
  const ctx = target.getContext("2d");
  ctx.clearRect(0, 0, target.width, target.height);
  ctx.drawImage(source, 0, 0);
  els.emptyState.classList.add("hidden");
  els.processingState.classList.add("hidden");
  els.canvasStage.className = "canvas-stage ready";
  els.canvasLegend.classList.toggle("hidden", !showLegend);
}

function renderCurrentView() {
  if (!state.image) return;
  const source = state.view === "original"
    ? state.sourceCanvas
    : state.view === "binary" && state.result
      ? state.binaryCanvas
      : state.result
        ? state.overlayCanvas
        : state.sourceCanvas;
  renderCanvas(source, state.view === "overlay" && Boolean(state.result));
}

function createBinaryCanvas(imageData, thresholdMask, width, height) {
  state.binaryCanvas.width = width;
  state.binaryCanvas.height = height;
  const output = state.binaryCanvas.getContext("2d").createImageData(width, height);
  for (let i = 0; i < thresholdMask.length; i += 1) {
    const v = thresholdMask[i] ? 244 : 28;
    const index = i * 4;
    output.data[index] = v;
    output.data[index + 1] = v;
    output.data[index + 2] = v;
    output.data[index + 3] = 255;
  }
  state.binaryCanvas.getContext("2d").putImageData(output, 0, 0);
}

function connectedComponents(mask, width, height, roi, minArea, minSlenderness) {
  const visited = new Uint8Array(mask.length);
  const components = [];
  const stack = new Int32Array(Math.max(1024, roi.width * roi.height));
  const offsets = [-width - 1, -width, -width + 1, -1, 1, width - 1, width, width + 1];
  const x0 = roi.x;
  const y0 = roi.y;
  const x1 = roi.x + roi.width;
  const y1 = roi.y + roi.height;

  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const start = y * width + x;
      if (!mask[start] || visited[start]) continue;
      let stackTop = 0;
      stack[stackTop++] = start;
      visited[start] = 1;
      let count = 0;
      let sumX = 0;
      let sumY = 0;
      let sumXX = 0;
      let sumYY = 0;
      let sumXY = 0;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      const pixels = [];

      while (stackTop > 0) {
        const index = stack[--stackTop];
        const py = Math.floor(index / width);
        const px = index - py * width;
        count += 1;
        sumX += px;
        sumY += py;
        sumXX += px * px;
        sumYY += py * py;
        sumXY += px * py;
        minX = Math.min(minX, px);
        maxX = Math.max(maxX, px);
        minY = Math.min(minY, py);
        maxY = Math.max(maxY, py);
        if (count <= 18000) pixels.push(index);

        for (const offset of offsets) {
          const next = index + offset;
          if (next < 0 || next >= mask.length || visited[next] || !mask[next]) continue;
          const ny = Math.floor(next / width);
          const nx = next - ny * width;
          if (nx < x0 || nx >= x1 || ny < y0 || ny >= y1 || Math.abs(nx - px) > 1 || Math.abs(ny - py) > 1) continue;
          visited[next] = 1;
          stack[stackTop++] = next;
        }
      }

      if (count < minArea || count > roi.width * roi.height * 0.22) continue;
      const meanX = sumX / count;
      const meanY = sumY / count;
      const covXX = Math.max(0, sumXX / count - meanX * meanX);
      const covYY = Math.max(0, sumYY / count - meanY * meanY);
      const covXY = sumXY / count - meanX * meanY;
      const trace = covXX + covYY;
      const root = Math.sqrt(Math.max(0, (covXX - covYY) ** 2 + 4 * covXY ** 2));
      const lambda1 = Math.max(0.01, (trace + root) / 2);
      const lambda2 = Math.max(0.01, (trace - root) / 2);
      const major = Math.max(maxX - minX + 1, 4 * Math.sqrt(lambda1));
      const minor = Math.max(1, Math.min(maxY - minY + 1, 4 * Math.sqrt(lambda2)));
      const slenderness = major / minor;
      if (slenderness < minSlenderness && count < minArea * 4) continue;
      const angle = 0.5 * Math.atan2(2 * covXY, covXX - covYY);
      components.push({
        area: count,
        cx: meanX,
        cy: meanY,
        minX,
        maxX,
        minY,
        maxY,
        major,
        minor,
        slenderness,
        angle,
        pixels,
      });
    }
  }
  return components;
}

function analyzeCanvas(sourceCanvas, parameters, options = {}) {
  const { draw = true } = options;
  const sourceCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  const imageData = sourceCtx.getImageData(0, 0, width, height);
  const pixels = imageData.data;
  const gray = new Uint8Array(width * height);
  const integral = new Float64Array((width + 1) * (height + 1));
  const roi = getRoi(width, height, parameters.scope);

  for (let y = 0; y < height; y += 1) {
    let rowSum = 0;
    const currentRow = (y + 1) * (width + 1);
    const previousRow = y * (width + 1);
    for (let x = 0; x < width; x += 1) {
      const pixelIndex = (y * width + x) * 4;
      const value = Math.round(pixels[pixelIndex] * 0.299 + pixels[pixelIndex + 1] * 0.587 + pixels[pixelIndex + 2] * 0.114);
      gray[y * width + x] = value;
      rowSum += value;
      integral[currentRow + x + 1] = integral[previousRow + x + 1] + rowSum;
    }
  }

  const mask = new Uint8Array(width * height);
  const radius = Math.max(5, Math.round(Math.min(width, height) / 70));
  const offset = 4 + (parameters.sensitivity - 20) * 0.19;
  const xEnd = roi.x + roi.width;
  const yEnd = roi.y + roi.height;
  for (let y = roi.y; y < yEnd; y += 1) {
    const ya = Math.max(0, y - radius);
    const yb = Math.min(height - 1, y + radius);
    for (let x = roi.x; x < xEnd; x += 1) {
      const xa = Math.max(0, x - radius);
      const xb = Math.min(width - 1, x + radius);
      const area = (xb - xa + 1) * (yb - ya + 1);
      const sum = integral[(yb + 1) * (width + 1) + xb + 1]
        - integral[ya * (width + 1) + xb + 1]
        - integral[(yb + 1) * (width + 1) + xa]
        + integral[ya * (width + 1) + xa];
      const localMean = sum / area;
      const value = gray[y * width + x];
      const selected = parameters.darkTarget ? value < localMean - offset : value > localMean + offset;
      if (selected) mask[y * width + x] = 1;
    }
  }

  const components = connectedComponents(mask, width, height, roi, parameters.minArea, parameters.minSlenderness);
  const umPerPixel = parameters.scaleUm / parameters.scalePixels;
  const grid = Array.from({ length: 5 }, () => Array(5).fill(0));
  let totalMaskArea = 0;
  let agglomeratedArea = 0;
  const classified = components.map((component) => {
    const lengthUm = component.major * umPerPixel;
    const widthUm = component.minor * umPerPixel;
    const agglomerated = component.slenderness < 2.6 || component.area > Math.max(150, parameters.minArea * 18) || component.minor > 12;
    totalMaskArea += component.area;
    if (agglomerated) agglomeratedArea += component.area;
    const gx = clamp(Math.floor(((component.cx - roi.x) / roi.width) * 5), 0, 4);
    const gy = clamp(Math.floor(((component.cy - roi.y) / roi.height) * 5), 0, 4);
    grid[gy][gx] += 1;
    return { ...component, lengthUm, widthUm, agglomerated };
  });

  const count = classified.length;
  const dispersed = classified.filter((item) => !item.agglomerated);
  const dispersedRatio = count ? dispersed.length / count * 100 : 0;
  const gridValues = grid.flat();
  const gridMean = gridValues.reduce((sum, value) => sum + value, 0) / gridValues.length;
  const gridVariance = gridValues.reduce((sum, value) => sum + (value - gridMean) ** 2, 0) / gridValues.length;
  const gridCv = gridMean > 0 ? Math.sqrt(gridVariance) / gridMean : 0;
  const agglomeratedAreaRatio = roi.width * roi.height > 0 ? agglomeratedArea / (roi.width * roi.height) * 100 : 0;
  const lengths = classified.map((item) => item.lengthUm).sort((a, b) => a - b);
  const widths = classified.map((item) => item.widthUm).sort((a, b) => a - b);
  const meanLength = lengths.length ? lengths.reduce((sum, value) => sum + value, 0) / lengths.length : 0;
  const p90Width = widths.length ? widths[Math.min(widths.length - 1, Math.floor(widths.length * 0.9))] : 0;
  const distributionScore = 100 / (1 + Math.exp(4 * (gridCv - 0.65) / 0.65));
  const dispersionScore = dispersedRatio;
  const agglomerationPenalty = Math.min(28, agglomeratedAreaRatio * 2.8);
  const uniformityScore = clamp(distributionScore * 0.65 + dispersionScore * 0.35 - agglomerationPenalty, 0, 100);

  if (draw) {
    createBinaryCanvas(imageData, mask, width, height);
    state.overlayCanvas.width = width;
    state.overlayCanvas.height = height;
    const overlayCtx = state.overlayCanvas.getContext("2d");
    overlayCtx.drawImage(sourceCanvas, 0, 0);
    overlayCtx.save();
    overlayCtx.lineWidth = Math.max(1.3, Math.min(width, height) / 650);
    classified.forEach((component) => {
      overlayCtx.save();
      overlayCtx.translate(component.cx, component.cy);
      overlayCtx.rotate(component.angle);
      overlayCtx.strokeStyle = component.agglomerated ? "#ff765f" : "#12d6ab";
      overlayCtx.fillStyle = component.agglomerated ? "rgba(255,118,95,.08)" : "rgba(18,214,171,.045)";
      overlayCtx.beginPath();
      overlayCtx.rect(-component.major / 2, -component.minor / 2, component.major, component.minor);
      overlayCtx.fill();
      overlayCtx.stroke();
      overlayCtx.restore();
    });
    overlayCtx.setLineDash([9, 7]);
    overlayCtx.strokeStyle = "#d9ff80";
    overlayCtx.lineWidth = Math.max(1.5, Math.min(width, height) / 500);
    overlayCtx.strokeRect(roi.x + 1, roi.y + 1, roi.width - 2, roi.height - 2);
    overlayCtx.restore();
  }

  return {
    width,
    height,
    roi,
    count,
    dispersedCount: dispersed.length,
    dispersedRatio,
    gridCv,
    agglomeratedAreaRatio,
    meanLength,
    p90Width,
    uniformityScore,
    lengths,
    widths,
    grid,
    components: classified,
    detectedAreaRatio: roi.width * roi.height ? totalMaskArea / (roi.width * roi.height) * 100 : 0,
  };
}

async function analyzeSingle() {
  if (!state.image) return;
  els.analyzeButton.disabled = true;
  els.canvasStage.className = "canvas-stage empty";
  els.emptyState.classList.add("hidden");
  els.processingState.classList.remove("hidden");
  els.processingTitle.textContent = "正在解析光学结构";
  els.processingDetail.textContent = "构建局部阈值、连通结构与空间网格…";
  await new Promise((resolve) => window.setTimeout(resolve, 70));
  try {
    const parameters = getParameters();
    const sourceScale = state.sourceCanvas.width / state.image.naturalWidth;
    parameters.scalePixels *= sourceScale;
    state.result = analyzeCanvas(state.sourceCanvas, parameters, { draw: true });
    state.view = "overlay";
    $$(".view-tabs button").forEach((button) => button.classList.toggle("active", button.dataset.view === "overlay"));
    renderCurrentView();
    renderResults(state.result);
    els.downloadOverlay.disabled = false;
    els.exportMetrics.disabled = false;
    els.imageDimensions.textContent = `${state.image.naturalWidth} × ${state.image.naturalHeight} px · 分析 ${state.result.roi.width} × ${state.result.roi.height} px`;
    showToast(`快速分析完成：识别 ${state.result.count} 个 CNT 连通候选。`);
  } catch (error) {
    console.error(error);
    showToast("分析时发生错误，请尝试降低图像尺寸或更换格式。", "error");
    renderCanvas(state.sourceCanvas, false);
  } finally {
    els.analyzeButton.disabled = false;
  }
}

function renderResults(result) {
  const score = Math.round(result.uniformityScore);
  let label = "分布待优化";
  let hint = "空间密度差异较明显";
  if (score >= 80) { label = "均匀性良好"; hint = "网格密度与分散状态较稳定"; }
  else if (score >= 62) { label = "均匀性中等"; hint = "可重点复核局部热点区域"; }
  else if (score >= 45) { label = "存在局部聚集"; hint = "建议检查团聚候选与边缘区域"; }

  $("#uniformityScore").textContent = String(score);
  $("#uniformityLabel").textContent = label;
  $("#uniformityHint").textContent = hint;
  $("#resultState").textContent = "COMPLETE";
  $("#scoreRing").style.background = `conic-gradient(var(--lime) ${score * 3.6}deg, rgba(255, 255, 255, .11) 0)`;
  $("#metricCount").textContent = result.count.toLocaleString("zh-CN");
  $("#metricDispersed").textContent = `${formatNumber(result.dispersedRatio, 1)}%`;
  $("#metricGridCv").textContent = formatNumber(result.gridCv, 2);
  $("#metricAggArea").textContent = `${formatNumber(result.agglomeratedAreaRatio, 1)}%`;
  $("#metricP90Width").textContent = formatNumber(result.p90Width, 2);
  $("#metricMeanLength").textContent = formatNumber(result.meanLength, 1);
  $("#histogramMeta").textContent = `${result.count} 个候选`;

  const narrative = result.count === 0
    ? "当前参数未识别到有效候选，请提高识别灵敏度或确认深/浅目标模式。"
    : `本图快速识别 ${result.count} 个连通候选，其中分散候选占 ${formatNumber(result.dispersedRatio, 1)}%；网格 CV 为 ${formatNumber(result.gridCv, 2)}。请结合桌面端骨架结果复核。`;
  $("#resultNarrative").textContent = narrative;

  const insights = [];
  if (result.count === 0) {
    insights.push(["danger", "!", "没有识别到候选结构，请提高灵敏度或检查目标明暗模式。"]);
  } else {
    insights.push([result.dispersedRatio >= 65 ? "good" : "warn", result.dispersedRatio >= 65 ? "✓" : "!", `分散候选比例为 ${formatNumber(result.dispersedRatio, 1)}%，反映数量维度的分散程度。`]);
    insights.push([result.gridCv <= 0.55 ? "good" : "warn", result.gridCv <= 0.55 ? "✓" : "!", `网格 CV 为 ${formatNumber(result.gridCv, 2)}，${result.gridCv <= 0.55 ? "空间占据相对均匀" : "存在较明显密度差异"}。`]);
    if (result.agglomeratedAreaRatio > 6) insights.push(["danger", "!", `团聚候选面积约占 ${formatNumber(result.agglomeratedAreaRatio, 1)}%，建议复核局部大连通网络。`]);
    else insights.push(["neutral", "i", "数量多不等于分布均匀；组间结论应同时看分散比例和网格 CV。"]);
  }
  $("#insightList").innerHTML = insights.map(([kind, icon, text]) => `<li class="${kind}"><span>${icon}</span><p>${text}</p></li>`).join("");
  drawCharts();
}

function prepareCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.max(10, Math.floor(rect.width * ratio));
  const height = Math.max(10, Math.floor(rect.height * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);
  return { ctx, width: rect.width, height: rect.height };
}

function drawEmptyChart(canvas, label) {
  const { ctx, width, height } = prepareCanvas(canvas);
  ctx.fillStyle = "#f7f9f6";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#dce3de";
  ctx.setLineDash([4, 5]);
  ctx.strokeRect(12, 12, Math.max(0, width - 24), Math.max(0, height - 24));
  ctx.setLineDash([]);
  ctx.fillStyle = "#899692";
  ctx.font = '10px "Segoe UI", sans-serif';
  ctx.textAlign = "center";
  ctx.fillText(label, width / 2, height / 2 + 3);
}

function drawHistogram(result) {
  const { ctx, width, height } = prepareCanvas(els.histogramCanvas);
  const pad = { left: 36, right: 12, top: 14, bottom: 30 };
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  if (!result || !result.lengths.length) {
    drawEmptyChart(els.histogramCanvas, "暂无长度候选");
    return;
  }
  const binCount = 10;
  const maxValue = Math.max(1, Math.min(result.lengths[result.lengths.length - 1], percentile(result.lengths, .96) * 1.2));
  const bins = Array(binCount).fill(0);
  result.lengths.forEach((value) => {
    const index = clamp(Math.floor(value / maxValue * binCount), 0, binCount - 1);
    bins[index] += 1;
  });
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const maxCount = Math.max(...bins, 1);
  ctx.strokeStyle = "#e5eae6";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 3; i += 1) {
    const y = pad.top + plotH * i / 3;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(width - pad.right, y); ctx.stroke();
  }
  const slot = plotW / binCount;
  bins.forEach((count, index) => {
    const barH = count / maxCount * (plotH - 2);
    const x = pad.left + index * slot + 2;
    const y = pad.top + plotH - barH;
    const gradient = ctx.createLinearGradient(0, y, 0, pad.top + plotH);
    gradient.addColorStop(0, "#56b8a6");
    gradient.addColorStop(1, "#0b716a");
    ctx.fillStyle = gradient;
    roundedRect(ctx, x, y, Math.max(2, slot - 4), barH, 3);
    ctx.fill();
  });
  ctx.fillStyle = "#768680";
  ctx.font = '8px "Segoe UI", sans-serif';
  ctx.textAlign = "center";
  [0, 2, 4, 6, 8, 10].forEach((tick) => {
    const x = pad.left + plotW * tick / 10;
    ctx.fillText(formatNumber(maxValue * tick / 10, 0), x, height - 12);
  });
  ctx.textAlign = "left";
  ctx.fillText("μm", width - 24, height - 12);
}

function drawHeatmap(result) {
  const { ctx, width, height } = prepareCanvas(els.heatmapCanvas);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  if (!result) {
    drawEmptyChart(els.heatmapCanvas, "暂无空间数据");
    return;
  }
  const pad = 18;
  const size = Math.min(width - pad * 2, height - pad * 2);
  const startX = (width - size) / 2;
  const startY = (height - size) / 2;
  const cell = size / 5;
  const values = result.grid.flat();
  const max = Math.max(1, ...values);
  result.grid.forEach((row, y) => row.forEach((value, x) => {
    const t = value / max;
    const hue = 167 - t * 150;
    const light = 94 - t * 38;
    ctx.fillStyle = `hsl(${hue} 58% ${light}%)`;
    ctx.fillRect(startX + x * cell + 1, startY + y * cell + 1, cell - 2, cell - 2);
    ctx.fillStyle = t > .55 ? "rgba(255,255,255,.88)" : "#3f5c56";
    ctx.font = '8px "Segoe UI", sans-serif';
    ctx.textAlign = "center";
    ctx.fillText(String(value), startX + (x + .5) * cell, startY + (y + .5) * cell + 3);
  }));
}

function drawCharts() {
  drawHistogram(state.result);
  drawHeatmap(state.result);
}

function percentile(sortedValues, fraction) {
  if (!sortedValues.length) return 0;
  return sortedValues[Math.min(sortedValues.length - 1, Math.floor((sortedValues.length - 1) * fraction))];
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportSingleMetrics() {
  if (!state.result) return;
  const r = state.result;
  const rows = [
    ["指标", "数值", "单位/说明"],
    ["CNT候选数", r.count, "连通结构"],
    ["分散候选数", r.dispersedCount, "连通结构"],
    ["分散比例", formatNumber(r.dispersedRatio, 3), "%"],
    ["网格CV", formatNumber(r.gridCv, 4), "越低越均匀"],
    ["团聚面积占比", formatNumber(r.agglomeratedAreaRatio, 3), "%"],
    ["P90宽度", formatNumber(r.p90Width, 4), "μm（浏览器近似）"],
    ["平均长度", formatNumber(r.meanLength, 4), "μm（浏览器近似）"],
    ["综合均匀性", formatNumber(r.uniformityScore, 2), "0-100 快速预览"],
  ];
  const csv = `\ufeff${rows.map((row) => row.map(csvEscape).join(",")).join("\r\n")}`;
  downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `${baseFilename(state.file?.name || "optcnt")}_快速指标.csv`);
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function baseFilename(name) {
  return name.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]/g, "_");
}

function updateFileGroup(kind, files) {
  const limited = [...files].slice(0, 20);
  state[`${kind}Files`] = limited;
  const list = kind === "base" ? els.baseFiles : els.experimentFiles;
  const count = kind === "base" ? els.baseCount : els.experimentCount;
  count.textContent = `${limited.length} 张`;
  list.innerHTML = limited.length
    ? limited.map((file) => `<li><span>${escapeHtml(file.name)}</span><b>${formatBytes(file.size)}</b></li>`).join("")
    : '<li class="placeholder">尚未选择图像</li>';
  els.compareButton.disabled = !state.baseFiles.length || !state.experimentFiles.length;
  if (files.length > 20) showToast("每组最多处理 20 张，已自动保留前 20 张。", "error");
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

async function analyzeFileForGroup(file, parameters) {
  const image = await loadImageFile(file);
  const canvas = document.createElement("canvas");
  const maxSide = 760;
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
  const scaledParameters = { ...parameters, scalePixels: parameters.scalePixels * scale };
  return analyzeCanvas(canvas, scaledParameters, { draw: false });
}

function summarizeGroup(results) {
  const valid = results.filter(Boolean);
  const mean = (key) => valid.length ? valid.reduce((sum, result) => sum + result[key], 0) / valid.length : 0;
  return {
    n: valid.length,
    count: mean("count"),
    dispersedRatio: mean("dispersedRatio"),
    gridCv: mean("gridCv"),
    agglomeratedAreaRatio: mean("agglomeratedAreaRatio"),
    p90Width: mean("p90Width"),
    uniformityScore: mean("uniformityScore"),
  };
}

async function runComparison() {
  if (!state.baseFiles.length || !state.experimentFiles.length) return;
  els.compareButton.disabled = true;
  els.compareButton.querySelector("span").textContent = "正在分析 0%";
  const parameters = getParameters();
  const all = [
    ...state.baseFiles.map((file) => ({ kind: "base", file })),
    ...state.experimentFiles.map((file) => ({ kind: "experiment", file })),
  ];
  const results = { base: [], experiment: [] };
  let failures = 0;
  for (let index = 0; index < all.length; index += 1) {
    const item = all[index];
    try {
      results[item.kind].push(await analyzeFileForGroup(item.file, parameters));
    } catch (error) {
      console.warn("Group image skipped", item.file.name, error);
      failures += 1;
    }
    const progress = Math.round((index + 1) / all.length * 100);
    els.compareButton.querySelector("span").textContent = `正在分析 ${progress}%`;
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  }

  state.comparison = {
    base: summarizeGroup(results.base),
    experiment: summarizeGroup(results.experiment),
    failures,
  };
  renderComparison();
  els.compareButton.disabled = false;
  els.compareButton.querySelector("span").textContent = "重新组间对比";
  showToast(`组间对比完成，共分析 ${state.comparison.base.n + state.comparison.experiment.n} 张图像${failures ? `，跳过 ${failures} 张` : ""}。`);
}

function renderComparison() {
  const { base, experiment, failures } = state.comparison;
  els.compareResults.classList.remove("hidden");
  $("#baseAnalyzed").textContent = `${base.n} 张`;
  $("#experimentAnalyzed").textContent = `${experiment.n} 张`;
  $("#baseStatus").textContent = `均匀性 ${formatNumber(base.uniformityScore, 1)}`;
  $("#experimentStatus").textContent = `均匀性 ${formatNumber(experiment.uniformityScore, 1)}`;

  const scoreDelta = experiment.uniformityScore - base.uniformityScore;
  const dispersionDelta = experiment.dispersedRatio - base.dispersedRatio;
  const gridDelta = base.gridCv - experiment.gridCv;
  let title = "两组整体表现接近";
  if (scoreDelta > 5 && dispersionDelta > 0 && gridDelta > 0) title = "实验组呈现更好的快速均匀性";
  else if (scoreDelta < -5) title = "实验组快速均匀性低于基准";
  $("#compareVerdictTitle").textContent = title;
  $("#compareVerdictText").textContent = `综合均匀性变化 ${signed(scoreDelta, 1)} 分；分散比例变化 ${signed(dispersionDelta, 1)} 个百分点；网格 CV ${gridDelta >= 0 ? "改善" : "升高"} ${formatNumber(Math.abs(gridDelta), 2)}。${failures ? `另有 ${failures} 张无法解码。` : ""}`;

  const metrics = comparisonMetrics(base, experiment);
  els.comparisonTableBody.innerHTML = metrics.map((metric) => {
    const delta = metric.base === 0 ? 0 : (metric.experiment - metric.base) / Math.abs(metric.base) * 100;
    const deltaClass = delta > 0 ? "delta-up" : delta < 0 ? "delta-down" : "";
    return `<tr><td>${metric.label}</td><td>${metric.format(metric.base)}</td><td>${metric.format(metric.experiment)}</td><td class="${deltaClass}">${signed(delta, 1)}%</td><td>${metric.direction}</td></tr>`;
  }).join("");
  drawComparisonChart();
  els.compareResults.scrollIntoView({ behavior: "smooth", block: "start" });
}

function signed(value, digits = 1) {
  if (!Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function comparisonMetrics(base, experiment) {
  return [
    { key: "count", label: "CNT 候选数", base: base.count, experiment: experiment.count, direction: "仅比较数量", format: (v) => formatNumber(v, 1) },
    { key: "dispersedRatio", label: "分散比例", base: base.dispersedRatio, experiment: experiment.dispersedRatio, direction: "越高越好", format: (v) => `${formatNumber(v, 1)}%` },
    { key: "gridCv", label: "网格 CV", base: base.gridCv, experiment: experiment.gridCv, direction: "越低越好", format: (v) => formatNumber(v, 3) },
    { key: "agglomeratedAreaRatio", label: "团聚面积占比", base: base.agglomeratedAreaRatio, experiment: experiment.agglomeratedAreaRatio, direction: "越低越好", format: (v) => `${formatNumber(v, 2)}%` },
    { key: "p90Width", label: "P90 宽度", base: base.p90Width, experiment: experiment.p90Width, direction: "越低越细", format: (v) => `${formatNumber(v, 3)} μm` },
  ];
}

function drawComparisonChart() {
  if (!state.comparison || $("#page-compare").classList.contains("active") === false) return;
  const { ctx, width, height } = prepareCanvas(els.comparisonCanvas);
  const { base, experiment } = state.comparison;
  const metrics = comparisonMetrics(base, experiment);
  const pad = { left: Math.min(110, width * .23), right: 20, top: 18, bottom: 26 };
  const plotW = width - pad.left - pad.right;
  const rowH = (height - pad.top - pad.bottom) / metrics.length;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  const normalizePair = (metric) => {
    const max = Math.max(Math.abs(metric.base), Math.abs(metric.experiment), .0001);
    if (["gridCv", "agglomeratedAreaRatio", "p90Width"].includes(metric.key)) {
      const b = metric.base > 0 ? Math.min(1, Math.min(metric.base, metric.experiment) / metric.base) : 0;
      const e = metric.experiment > 0 ? Math.min(1, Math.min(metric.base, metric.experiment) / metric.experiment) : 0;
      return [b, e];
    }
    return [metric.base / max, metric.experiment / max];
  };
  metrics.forEach((metric, index) => {
    const y = pad.top + index * rowH;
    const [baseValue, experimentValue] = normalizePair(metric);
    ctx.fillStyle = "#f0f3f0";
    roundedRect(ctx, pad.left, y + rowH * .15, plotW, rowH * .24, 4); ctx.fill();
    roundedRect(ctx, pad.left, y + rowH * .52, plotW, rowH * .24, 4); ctx.fill();
    ctx.fillStyle = "#0b716a";
    roundedRect(ctx, pad.left, y + rowH * .15, plotW * baseValue, rowH * .24, 4); ctx.fill();
    ctx.fillStyle = "#ee765f";
    roundedRect(ctx, pad.left, y + rowH * .52, plotW * experimentValue, rowH * .24, 4); ctx.fill();
    ctx.fillStyle = "#334b47";
    ctx.font = '9px "Segoe UI", sans-serif';
    ctx.textAlign = "right";
    ctx.fillText(metric.label, pad.left - 11, y + rowH * .5 + 3);
  });
}

function exportComparison() {
  if (!state.comparison) return;
  const metrics = comparisonMetrics(state.comparison.base, state.comparison.experiment);
  const rows = [["指标", "base组均值", "实验组均值", "相对变化%", "方向"]];
  metrics.forEach((metric) => {
    const delta = metric.base === 0 ? 0 : (metric.experiment - metric.base) / Math.abs(metric.base) * 100;
    rows.push([metric.label, metric.base, metric.experiment, formatNumber(delta, 3), metric.direction]);
  });
  const csv = `\ufeff${rows.map((row) => row.map(csvEscape).join(",")).join("\r\n")}`;
  downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), "OptCNT_base_实验组_快速对比.csv");
}

function bindEvents() {
  $$('[data-page]').forEach((button) => button.addEventListener("click", () => switchPage(button.dataset.page)));
  $("#helpButton").addEventListener("click", () => switchPage("method"));
  els.imageInput.addEventListener("change", () => els.imageInput.files[0] && selectSingleFile(els.imageInput.files[0]));
  els.clearImage.addEventListener("click", clearSingleImage);
  ["dragenter", "dragover"].forEach((eventName) => els.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    els.dropZone.classList.add("dragover");
  }));
  ["dragleave", "drop"].forEach((eventName) => els.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    els.dropZone.classList.remove("dragover");
  }));
  els.dropZone.addEventListener("drop", (event) => event.dataTransfer.files[0] && selectSingleFile(event.dataTransfer.files[0]));

  els.sensitivity.addEventListener("input", () => { els.sensitivityValue.textContent = els.sensitivity.value; });
  els.minArea.addEventListener("input", () => { els.minAreaValue.textContent = `${els.minArea.value} px²`; });
  els.minSlenderness.addEventListener("input", () => { els.minSlendernessValue.textContent = (Number(els.minSlenderness.value) / 10).toFixed(1); });
  els.resetParams.addEventListener("click", () => {
    els.analysisScope.value = "center75";
    els.scaleUm.value = "10";
    els.scalePixels.value = "100";
    els.sensitivity.value = "52";
    els.minArea.value = "12";
    els.minSlenderness.value = "20";
    els.darkTarget.checked = true;
    els.sensitivity.dispatchEvent(new Event("input"));
    els.minArea.dispatchEvent(new Event("input"));
    els.minSlenderness.dispatchEvent(new Event("input"));
    showToast("分析参数已恢复默认值。" );
  });
  els.analyzeButton.addEventListener("click", analyzeSingle);
  $$(".view-tabs button").forEach((button) => button.addEventListener("click", () => {
    state.view = button.dataset.view;
    $$(".view-tabs button").forEach((item) => item.classList.toggle("active", item === button));
    renderCurrentView();
  }));
  $("#fitView").addEventListener("click", () => {
    els.imageCanvas.style.maxWidth = "100%";
    els.imageCanvas.style.maxHeight = "calc(66vh - 36px)";
    $("#zoomLabel").textContent = "适应";
  });
  els.downloadOverlay.addEventListener("click", () => {
    if (!state.result) return;
    state.overlayCanvas.toBlob((blob) => blob && downloadBlob(blob, `${baseFilename(state.file.name)}_OptCNT快速标注.png`), "image/png");
  });
  els.exportMetrics.addEventListener("click", exportSingleMetrics);
  els.baseInput.addEventListener("change", () => updateFileGroup("base", els.baseInput.files));
  els.experimentInput.addEventListener("change", () => updateFileGroup("experiment", els.experimentInput.files));
  els.compareButton.addEventListener("click", runComparison);
  els.exportComparison.addEventListener("click", exportComparison);
  window.addEventListener("resize", () => {
    window.clearTimeout(bindEvents.resizeTimer);
    bindEvents.resizeTimer = window.setTimeout(() => {
      drawCharts();
      drawComparisonChart();
    }, 120);
  });
}

bindEvents();
resetResults();
