# Cnanotools

碳纳米管科学分析工具的统一入口，按分析任务连接各个工作台。本仓库维护导航页、共享页面样式和 OptCNT 浏览器快速分析前端。

**[打开在线工具入口](https://zuestian.github.io/Cnanotools/)**

## 在线工作台

| 分组 | 工具 | 在线入口 | 公开代码 |
| --- | --- | --- | --- |
| 图像与结构 | TEM CNT Analyzer | [打开](https://tem-cnt.47.236.76.214.nip.io/) | [静态前端](https://github.com/ZuesTian/tem-cnt-workbench) |
| 图像与结构 | 碳管视觉问答 | [打开](https://zuestian.github.io/Cnanotools/vision/) | 本仓库 `vision/` |
| 图像与结构 | OptCNT | [打开](https://opt-cnt.47.236.76.214.nip.io/) | [OptCNT](https://github.com/ZuesTian/OptCNT) |
| 图像与结构 | SEM CNT Analyzer | [打开](https://sem.47.236.76.214.nip.io/) | — |
| 粒度与光谱 | GrainPeak | [打开](https://grain-peak.47.236.76.214.nip.io/) | [GrainPeak](https://github.com/ZuesTian/GrainPeak) |
| 粒度与光谱 | UV 光谱积分 | [打开](https://uv-spectrum.47.236.76.214.nip.io/) | [UV](https://github.com/ZuesTian/UV) |
| 粒度与光谱 | RamanFit Pro | [打开](https://raman.47.236.76.214.nip.io/) | — |
| 性质与生产 | CNT-BET | [打开](https://47.236.76.214.nip.io/) | [静态前端](https://github.com/ZuesTian/cnt-bet-workbench) |
| 性质与生产 | CNT 生产数据分析 | [打开](https://cnt-analysis.47.236.76.214.nip.io/) | [cnt-production-analysis](https://github.com/ZuesTian/cnt-production-analysis) |
| 模拟数据 | 仿真数据集归档 | [打开](https://sim-db.47.236.76.214.nip.io/) | — |

## OptCNT 浏览器快速分析

[打开浏览器版](https://zuestian.github.io/Cnanotools/optcnt/)。

这一版本在浏览器内存中处理 OptCNT 原图。桌面和独立 Web 版本的开发说明见 [OptCNT 仓库](https://github.com/ZuesTian/OptCNT)。

## 本地预览

从仓库根目录运行：

```bash
python -m http.server 8080
```

打开 `http://127.0.0.1:8080/` 查看导航页，或打开 `http://127.0.0.1:8080/optcnt/` 进入浏览器快速分析。

## 目录

| 路径 | 内容 |
| --- | --- |
| `index.html`, `app.js`, `styles.css` | 工具导航页 |
| `theme.css`, `theme.js` | 页面主题 |
| `optcnt/` | OptCNT 浏览器快速分析 |
| `assets/` | 页面图片与资源 |
| `deploy/` | 部署配置 |
| `.github/` | GitHub Pages 发布流程 |

各工作台的算法、依赖、输入要求和导出说明由对应项目维护。

## 碳管视觉问答

- 页面：`vision/`，门户“图像与结构分析”分组提供入口。
- 界面统一使用“碳管视觉助手”名称，模型由服务端固定配置；前端不包含供应商品牌或型号信息。
- 支持单张 PNG / JPG / WebP 图像上传、拖放、粘贴、原图预览、分布/长度/宽度快捷问题和多轮追问。限制为 12 MB、每边 8192 px。
- 图像支持滚轮/按钮缩放、拖动平移、适应视野、1:1 和显示对比增强。原图、标尺和点击坐标使用同一 Canvas 变换；显示增强和局部放大均不修改发送给模型的原图。
- 点击“点选标尺两端”，点选 A/B 后可拖动端点精调；局部放大镜帮助定位。画布聚焦时可用 A/B 键选择端点，方向键移动 1 原图像素，Shift + 方向键移动 10 像素，空格 + 拖动平移。
- 选好端点后，明确选择 nm / µm、填写实际长度，检查“像素跨度 = 实际长度”和每像素换算，再点击“应用标定”。不默认猜测单位；草稿与已生效标定分开，存在未确认修改时不能发送。取消修改 / Esc 保留上一份已应用标定，清除标定可回到未标定状态。
- 也可手动填写标尺像素长度。应用不同标定或修改图像类型会清空旧对话；新图像会清空旧标定与对话。无标尺不输出假定的物理尺寸。
- 页面不提供模型或密钥设置入口，浏览器仅请求 `https://cnt-vision.47.236.76.214.nip.io/api/chat`，请求和响应均不包含底层型号信息；密钥由阿里云服务器受限文件读取，不下发浏览器、不进入 GitHub 或 Pages 文件。
- 服务端固定模型、系统指令和输出上限，仅接受单张内联 PNG/JPG/WebP 及文本对话，拒绝任意外部图像 URL。图像和对话不落盘；本地 SQLite 只记录每日共享调用次数，不保存用户内容。
- 共享服务默认最多 2 个并发，每 IP 4 次/分钟、20 次/小时，全站 200 次/UTC 日（计入已经开始的调用尝试，失败或取消也可能计费）。每日次数由 `VISION_DAILY_LIMIT` 管理；来源校验不是身份认证，公开入口的费用由托管密钥账户承担。
- 回答以纯文本渲染，支持复制。请求失败时保留问题，支持取消及 120 秒超时；取消等待不保证终止服务端计费。
- 前端采用原生 ES modules，无新增依赖。可用 `python -m http.server 8789 --bind 127.0.0.1` 预览（不要直接使用 file://）。前端测试：`node --test`；网关测试：`python -m unittest discover -s tests -p test_vision_api.py -v`。
- 网关位于 `server/vision_api.py`，部署配置位于 `deploy/ali/cnt-vision.*` 与 `install-vision.sh`，复用服务器现有 Flask/Gunicorn 运行环境。服务监听 `127.0.0.1:8780`，经独立 Caddy 域名提供 HTTPS。Pages 发布只打包明确列出的前端目录，不发布服务端、测试或部署文件。
- 此页面提供视觉理解和尺寸估算，不运行逐根分割或统计算法。需要计量结果时使用门户中已有的 TEM / SEM 工具。
