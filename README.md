# Cnanotools

碳纳米管科学分析工具的统一入口，按分析任务连接各个工作台。本仓库维护导航页、共享页面样式和 OptCNT 浏览器快速分析前端。

**[打开在线工具入口](https://zuestian.github.io/Cnanotools/)**

## 在线工作台

| 分组 | 工具 | 在线入口 | 公开代码 |
| --- | --- | --- | --- |
| 图像与结构 | TEM CNT Analyzer | [打开](https://tem-cnt.47.236.76.214.nip.io/) | [静态前端](https://github.com/ZuesTian/tem-cnt-workbench) |
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
