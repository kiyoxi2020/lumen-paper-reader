# Lumen · 论文助读

一个纯前端的学术论文 AI 辅助阅读工具，无需后端服务器，直接在浏览器中运行。

## 功能特性

- **论文库管理** — 添加、筛选、排序、搜索论文，支持 NLP / CV / 生成模型 / 强化学习等分类
- **PDF 内嵌阅读** — 上传 PDF 后直接在页面内阅读，支持点击上传和拖拽上传
- **AI 深度分析** — 自动生成五维度结构化分析（核心贡献、方法概述、关键实验、研究意义、局限）
- **交互式问答** — 7 个快捷提问 + 自由对话，AI 自动注入论文上下文
- **多模型支持** — Anthropic Claude / OpenAI GPT / DeepSeek / 自定义 OpenAI 兼容接口
- **流式输出** — SSE 实时流式响应，逐字呈现 AI 分析结果
- **对话导出** — 一键导出对话记录为 Markdown 文件
- **零依赖** — 纯 Vanilla HTML / CSS / JS，无需构建工具，打开即用

## 技术栈

| 层面 | 技术 |
|------|------|
| 前端 | Vanilla HTML / CSS / JavaScript |
| 数据存储 | localStorage（论文元数据 + 配置） + IndexedDB（PDF 文件） |
| AI 接口 | 原生 fetch SSE 流式调用 |
| 字体 | Google Fonts（DM Serif Display + DM Sans） |

## 快速开始

1. 克隆仓库
   ```bash
   git clone https://github.com/kiyoxi2020/lumen-paper-reader.git
   cd lumen-paper-reader
   ```

2. 用任意 HTTP 服务器打开（或直接打开 `index.html`）
   ```bash
   python3 -m http.server 8765
   ```

3. 浏览器访问 `http://localhost:8765`

4. 在「模型配置」页面设置 API Key，即可使用 AI 分析功能

## 项目结构

```
├── index.html        # 主页 — 论文库
├── reader.html       # 阅读页 — PDF 阅读 + AI 对话
├── settings.html     # 设置页 — 模型 / API 配置
├── css/
│   ├── base.css      # 全局设计系统（变量、重置、通用组件）
│   ├── index.css     # 主页样式
│   ├── reader.css    # 阅读页样式
│   └── settings.css  # 设置页样式
└── js/
    ├── store.js      # 数据层（localStorage CRUD + IndexedDB PDF 存储 + AI 调用 + Markdown 渲染）
    ├── index.js      # 主页逻辑
    ├── reader.js     # 阅读页逻辑（PDF 上传/查看/删除 + 聊天）
    └── settings.js   # 设置页逻辑
```

## 支持的 AI 模型

| 服务商 | 模型 |
|--------|------|
| Anthropic | Claude Opus 4.7 / Sonnet 4.6 / Haiku 4.5 / Sonnet 4 / 3.5 Sonnet |
| OpenAI | GPT-4o / GPT-4o Mini / GPT-4 Turbo / GPT-4 / o1-preview |
| DeepSeek | DeepSeek-V3 / DeepSeek-R1 |
| 自定义 | 任何兼容 OpenAI 接口的服务 |

## 数据存储说明

- **论文元数据**（标题、作者、摘要、对话记录等）存储在 `localStorage`
- **PDF 文件**存储在 `IndexedDB`（上限 100MB/文件），与论文通过 `paperId` 关联
- 所有数据仅存在于浏览器本地，不会上传到任何服务器
- API Key 仅存储在浏览器 `localStorage`，仅用于本地发起 API 请求

## License

MIT
