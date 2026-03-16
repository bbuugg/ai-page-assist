# AI Page Inspector

[English](./README.md) | **中文**

AI Page Inspector 是一个 Chrome MV3 扩展，将 AI 助手嵌入浏览器侧边栏。支持 Anthropic Claude、OpenAI 兼容接口和本地 Ollama 模型。你可以用自然语言检查、分析并操作任意网页。

## 功能特性

### 聊天界面
- 流式 AI 响应，支持 Markdown 渲染
- 多会话管理，自动保存历史记录
- 随时中止进行中的请求
- 原始请求/响应日志查看器（调试用）

### AI 提供商
- **Anthropic Claude** — 可配置模型和自定义 Base URL
- **OpenAI 兼容接口** — GPT-4o、本地代理等
- **Ollama** — 通过 `http://localhost:11434` 使用本地模型；如果出现 403 错误，请设置环境变量 `OLLAMA_ORIGINS=*` 后重启 Ollama
- API Key 和配置存储在本地 `chrome.storage.local` 中

### 页面上下文
- 每轮对话自动注入当前页面 HTML（截断至 20000 字符）
- AI 在注入 HTML 不完整时会使用 `query_page` 查找特定元素
- 元素选择模式：点击页面上的任意元素即可选中并检查

### MCP 工具支持
- 在设置中连接外部 MCP 服务器（HTTP/SSE）
- 其工具与内置工具一同暴露给 AI
- 可按会话单独禁用特定工具

### Ask User（澄清提问）
- 当 AI 在继续执行前需要澄清信息时，会调用 `ask_user` 工具
- 执行暂停，问题以 AI 消息的形式显示
- 输入回答并发送后，AI 自动继续执行

---

## AI 工具列表

| 工具 | 说明 |
|------|------|
| `get_element_html` | 获取当前选中元素的外层 HTML |
| `get_element_css` | 获取当前选中元素的计算 CSS |
| `get_full_page_html` | 获取整个页面的完整 HTML |
| `query_page` | 通过 CSS 选择器或关键词查询元素 |
| `highlight_element` | 通过 CSS 选择器高亮元素 |
| `execute_js` | 在页面上下文中执行任意 JavaScript |
| `screenshot` | 截取视口或整页截图 |
| `fill_input` | 填写输入框/文本域（触发 React/Vue 事件） |
| `click_element` | 通过 CSS 选择器点击元素 |
| `open_url` | 将标签页导航到指定 URL |
| `scroll_page` | 滚动页面或特定元素 |
| `get_current_datetime` | 获取当前本地日期、时间和时区 |
| `fetch_url` | 获取外部 URL 的内容 |
| `modify_element` | 通过 AI 生成的 JS 修改 DOM 元素 |
| `undo_last_modification` | 撤销上一次 `modify_element` 的修改 |
| `upload_file_to_input` | 向文件输入框上传 base64 文件 |
| `ask_user` | 暂停执行并向用户提问 |

---

## 项目结构

```
src/
  background/        # Service Worker — 消息路由、截图、fetch 代理
  content/           # Content Script — DOM 高亮/选中、工具执行
  overlay/           # React 18 侧边栏 UI
    components/
      ChatPanel.tsx  # 主聊天界面，流式渲染，ask_user 处理
      SettingsPanel.tsx
      HistoryPanel.tsx
  lib/
    ai/
      anthropic.ts   # Anthropic 智能体循环
      openai.ts      # OpenAI 兼容智能体循环
      prompt.ts      # 系统提示词
      types.ts       # StreamCallbacks 接口
    tools.ts         # 工具定义（TOOL_DEFINITIONS）和 executeTool()
    storage.ts       # chrome.storage 工具函数（会话、设置、MCP 服务器）
    mcp.ts           # MCP 服务器客户端（获取工具、调用工具）
overlay.html         # 侧边栏 iframe 的入口 HTML
manifest.json        # Chrome 扩展清单
vite.config.ts       # 构建配置（多入口）
```

---

## 安装

### 从源码构建

```bash
npm install
npm run build
```

在 Chrome 中加载：打开 `chrome://extensions/` → 开启开发者模式 → 加载已解压的扩展 → 选择项目根目录（`manifest.json` 所在位置，即 `plugin/` 目录）。

### 开发模式

```bash
npm run dev   # 监听文件变化并自动重新构建
```

修改后在 `chrome://extensions/` 中点击刷新按钮重新加载扩展。

---

## 配置

点击扩展侧边栏右上角的设置图标：

1. 选择 AI 提供商（Anthropic / OpenAI / Ollama）
2. 输入 API Key（Ollama 不需要）
3. 可选：设置自定义 Base URL
4. 选择模型
5. 可选：在 MCP 设置中添加 MCP 服务器

---

## 常见问题

**Ollama 出现 403 错误**
设置环境变量 `OLLAMA_ORIGINS=*` 后重启 Ollama。这是因为浏览器扩展的 origin 不在 Ollama 的默认允许列表中。

**页面 HTML 被截断**
注入的 HTML 最多 20000 字符。对于大型页面，AI 会自动使用 `query_page` 工具查找特定元素。
