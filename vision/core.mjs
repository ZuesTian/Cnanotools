export const API_URL = "https://cnt-vision.47.236.76.214.nip.io/api/chat";
export const MAX_BYTES = 12 * 1024 * 1024;
export const QUESTIONS = {
  distribution: "请分析碳管的空间分布：是否均匀，有无团聚、缠结和明显取向？指出对应图像区域，区分观察事实与推测。",
  length: "请分析可辨认碳管的长度。区分完整可追踪管段与被遮挡或超出视野的管段；有可靠标尺时给出估算范围、单位和依据，不要把可见段长当成完整管长。",
  width: "请分析碳管的宽度。区分单根碳管外径、管束宽度与团聚体尺寸；有可靠标尺时给出可辨认对象的估算范围、单位和依据，无法区分时明确说明。",
};

export function getScale(pixels, length, unit) {
  if (!String(pixels).trim() && !String(length).trim()) return null;
  const p = Number(pixels), l = Number(length);
  if (!Number.isFinite(p) || !Number.isFinite(l) || p <= 0 || l <= 0) {
    throw new Error("请同时填写大于 0 的标尺像素长度和实际长度，或将两项都留空。");
  }
  if (!["nm", "µm"].includes(unit)) throw new Error("请选择标尺单位 nm 或 µm，注意两者相差 1000 倍。");
  const ratio = l / p;
  if (!Number.isFinite(ratio) || ratio <= 0) throw new Error("标定数值超出有效范围，请检查输入。");
  return { pixels: p, length: l, unit, perPixel: ratio };
}

// One transform is shared by image rendering, pointer input and annotations.
// All viewport coordinates are CSS pixels; original-image coordinates never use DPR.
export function getImageTransform(viewport, size, scale, pan) {
  return {
    x: (viewport.width - size.width * scale) / 2 + pan.x,
    y: (viewport.height - size.height * scale) / 2 + pan.y,
    scale,
  };
}

export function viewportToImagePoint(point, transform, size) {
  if (transform.scale <= 0) return null;
  const x = (point.x - transform.x) / transform.scale;
  const y = (point.y - transform.y) / transform.scale;
  if (x < 0 || y < 0 || x > size.width || y > size.height) return null;
  return { x, y };
}

export function imageToViewportPoint(point, transform) {
  return { x: transform.x + point.x * transform.scale, y: transform.y + point.y * transform.scale };
}

export function scaleMatches(draft, applied) {
  if (!draft || !applied) return draft === applied;
  return draft.pixels === applied.pixels && draft.length === applied.length && draft.unit === applied.unit;
}

export function measurePixelDistance(start, end) {
  const pixels = Math.hypot(end.x - start.x, end.y - start.y);
  if (!Number.isFinite(pixels) || pixels < 1) throw new Error("两端距离小于 1 个原图像素，请重新选择第二个端点。");
  return pixels;
}

export function detectImageType(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n)) return "image/png";
  if (String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  throw new Error("请选择真实的 PNG、JPG 或 WebP 图像；TIFF 请先转换为 PNG。");
}

export function buildRequest({ image, imageType, scale, history, question }) {
  if (!image?.dataUrl || !question.trim()) throw new Error("请先选择图像并填写问题。");
  const calibration = scale
    ? `用户标定：原图 ${scale.pixels} px = ${scale.length} ${scale.unit}；每像素 ${scale.perPixel} ${scale.unit}。`
    : "用户未提供像素标定。若图中标尺无法可靠辨认，请勿报告绝对尺寸。";
  return {
    messages: [
      { role: "user", content: [
        { type: "text", text: `待分析图像：${image.width} × ${image.height} px。用户选择图像类型：${imageType}。${calibration}` },
        { type: "image_url", image_url: { url: image.dataUrl, detail: "original" } },
      ] },
      ...history.map(({ role, content }) => ({ role, content })),
      { role: "user", content: question.trim() },
    ],
  };
}

export function apiError(status) {
  if (status === 401) return "视觉服务的密钥无效或已失效，请联系管理员。";
  if (status === 402) return "视觉服务账户余额不足，请联系管理员。";
  if (status === 403) return "视觉服务没有调用权限，请联系管理员。";
  if (status === 413) return "图像请求过大，请选择更小的图像。";
  if (status === 429) return "请求过于频繁，或额度受限，请稍后重试。";
  if (status === 400 || status === 422) return "模型未接受本次图像请求，请检查图像格式、尺寸和模型权限。";
  if (status >= 500) return "视觉服务暂不可用，请稍后重试。";
  return `请求失败（HTTP ${status}），请检查连接后重试。`;
}

export async function requestAnswer({ payload, signal, fetchImpl = fetch }) {
  const response = await fetchImpl(API_URL, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload), signal, credentials: "omit", redirect: "error",
  });
  if (!response.ok) {
    const errors = { daily_limit: "今日共享调用次数已用完，请明天再试。", rate_limit: "请求过于频繁，请稍后再试。", busy: "当前分析任务较多，请稍后再试。", invalid_request: "图像或对话超出服务限制，请检查图像或清空长对话后重试。", unavailable: "视觉服务尚未配置完成，请联系管理员。" };
    let code;
    try { code = (await response.json()).code; } catch { /* Use the status-only message. */ }
    throw new Error(errors[code] || apiError(response.status));
  }
  let data;
  try { data = await response.json(); } catch { throw new Error("模型返回的内容无法读取，请重试。"); }
  const choice = data.choices?.[0];
  const content = choice?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new Error("模型未返回有效回答，请重试或调整问题。");
  return { content, truncated: choice.finish_reason === "length" };
}
