# AI Page Assist

[English](./README.md) | **中文**

AI Page Assist 是一个 Chrome MV3 扩展，将 AI 助手嵌入浏览器侧边栏。支持 Anthropic Claude、OpenAI 兼容接口和本地 Ollama 模型。你可以用自然语言检查、分析并自动化操作任意网页。

## 功能特性

### 聊天界面
- 流式 AI 响应，支持 Markdown 渲染
- 多会话管理，自动保存历史记录
- 上下文压缩，管理长对话
- 随时中止进行中的请求
- 原始请求/响应日志查看器（调试用）
- 数据脱敏：敏感信息（邮箱、手机号、身份证、密码等）在发送给 AI 前自动编码，AI 回复后自动还原

### AI 提供商
- **Anthropic Claude** — 可配置模型、扩展思考模式、自定义 Base URL
- **OpenAI 兼容接口** — GPT-4o、本地代理等
- **Ollama** — 通过 `http://localhost:11434` 使用本地模型；如果出现 403 错误，请设置环境变量 `OLLAMA_ORIGINS=*` 后重启 Ollama
- API Key 和配置存储在本地 `chrome.storage.local` 中

### 智能体（Agents）
- 10 个内置智能体：SEO 分析、代码审查、表单自动化、数据提取、无障碍检查、购物助手、浏览器操作、API 文档生成、API 调试、PPT 生成
- 可创建自定义智能体，配置名称、系统提示词和推荐工具
- 在输入框中输入 `@智能体名称` 激活 — 会弹出选择器
- 已激活的智能体以标签形式显示在输入框上方，点击 ✕ 取消激活
- 每个智能体会向 AI 注入专属系统提示词和工具提示
- 使用页面工具的智能体会自动注入页面上下文；纯对话智能体不注入
- 工具栏 ⚡ 按钮打开智能体面板

### 页面上下文
- 页面上下文（URL、标题、可见文本摘要）仅在激活了使用页面工具的智能体时注入，不再每轮对话都携带
- 元素选择模式：点击页面上的任意元素即可选中并检查

### MCP 工具支持
- 在设置中连接外部 MCP 服务器（HTTP/SSE）
- 其工具与内置工具一同暴露给 AI
- 可按会话单独禁用特定工具

### AI 标签页
- AI 通过 `open_tab` 打开新标签页时，会显示在输入框上方的标签栏中
- 点击 ✕ 关闭单个标签，或使用「全部关闭」一键关闭

### HTML 预览页
- 打开独立 Chrome 标签页，用于预览 AI 生成的 HTML
- 左侧：可编辑的 HTML 源码；右侧：iframe 实时渲染
- **工具栏「预览」按钮** — 提取最后一条 AI 消息中的 HTML 代码块，在新标签打开/聚焦预览页
- **「发送到预览」按钮** — AI 回复中每个 HTML 代码块右上角的快捷按钮
- **实时同步** — AI 流式生成时，预览页自动跟随更新（如已打开）

### Ask User（澄清提问）
- 当 AI 在继续执行前需要澄清信息时，会调用 `ask_user` 工具
- 执行暂停，问题以 AI 消息的形式显示
- 是/否类问题会显示快捷回复按钮
- 输入回答并发送后，AI 自动继续执行

### 会话回放
- 将任意会话的工具调用序列导出为 JSON 或 JS 脚本
- 在当前页面重新执行历史会话的操作步骤
- 支持暂停、继续、停止回放

---

## AI 工具列表

| 工具 | 说明 |
|------|------|
| `get_element_html` | 获取当前选中元素的外层 HTML |
| `get_element_css` | 获取当前选中元素的计算 CSS |
| `get_full_page_html` | 获取整个页面的完整 HTML |
| `get_page_context` | 获取当前页面 URL、标题和可见文本摘要 |
| `get_dom_state` | 获取页面结构化摘要：标题、URL 及可交互元素列表 |
| `query_page` | 通过 CSS 选择器或关键词查询元素 |
| `extract_page_elements` | 按选择器/关键词提取结构化元素信息（标签、id、class、文本、HTML 片段）|
| `execute_js` | 在页面上下文中执行任意 JavaScript |
| `click_element` | 通过 CSS 选择器点击元素 |
| `fill_input` | 填写输入框/文本域（自动触发 React/Vue 事件） |
| `clear_input` | 清空输入框或文本域 |
| `select_option` | 选择 `<select>` 元素中的选项 |
| `send_keys` | 向元素或当前焦点元素发送键盘事件 |
| `hover_element` | 通过 CSS 选择器悬停元素 |
| `drag_and_drop` | 将一个元素拖拽到另一个元素上 |
| `scroll_page` | 滚动页面或特定元素 |
| `scroll_to_element` | 将指定元素滚动到可视区域 |
| `wait_for_element` | 等待元素出现在 DOM 中 |
| `open_url` | 将当前标签页导航到指定 URL |
| `open_tab` | 打开新浏览器标签页 |
| `close_tab` | 关闭浏览器标签页 |
| `switch_tab` | 通过 ID 切换到指定标签页 |
| `list_tabs` | 列出所有已打开的标签页（ID、标题、URL）|
| `go_back` | 在浏览器历史中后退一步 |
| `go_forward` | 在浏览器历史中前进一步 |
| `refresh` | 重新加载当前标签页 |
| `fetch_url` | 获取外部 URL 的内容 |
| `get_current_datetime` | 获取当前本地日期、时间和时区 |
| `preview_get_html` | 获取 HTML 预览页当前的 HTML 源码 |
| `preview_exec_js` | 在 HTML 预览页 iframe 中执行 JavaScript |
| `ask_user` | 暂停执行并向用户提问 |

---

## 项目结构

```
src/
  background/
    background.ts      # Service Worker — CDP、脚本注入、AI 标签页追踪
  content/
    content.ts         # 内容脚本 — DOM 高亮、工具执行、AI 特效
    ai-effects.ts      # 扫描边框特效 + 虚拟 AI 光标动画
    tool-handlers.ts   # 浏览器工具实现（点击、填写等）
    dom-utils.ts       # CSS 选择器解析
  overlay/
    App.tsx            # 会话管理、aiTabs 状态、消息路由
    store.ts           # Zustand 状态管理（会话级 + 全局状态）
    components/
      ChatPanel.tsx    # 聊天 UI、流式输出、@mention 选择器、智能体标签
      SettingsPanel.tsx
      SkillsPanel.tsx  # 智能体面板
      Toolbar.tsx
      HtmlPreview.tsx
  lib/
    ai/
      anthropic.ts     # Anthropic 智能体循环
      openai.ts        # OpenAI 兼容智能体循环
      prompt.ts        # 系统提示词
      types.ts         # StreamCallbacks 接口
      compress.ts      # 上下文压缩
    tools/
      definitions/     # 各工具定义文件
      registry.ts      # 工具注册表（ALL_TOOLS）
      index.ts         # TOOL_DEFINITIONS + executeTool()
    agents/
      index.ts         # Agent 接口、BUILTIN_AGENTS、buildAgentSystemPrompt()
      builtin/         # 内置智能体定义
    storage.ts         # chrome.storage 工具函数
    mcp.ts             # MCP 服务器客户端
    desensitize.ts     # 数据脱敏（编码/解码）
overlay.html           # 侧边栏 iframe 入口 HTML
preview.html           # HTML 预览页入口
manifest.json          # Chrome 扩展清单
vite.config.ts         # 构建配置（多入口 → plugin/）
```

---

## 安装

### 从源码构建

```bash
npm install
npm run build       # 输出到 plugin/
npm run dev         # 监听文件变化并自动重新构建
```

在 Chrome 中加载：打开 `chrome://extensions/` → 开启开发者模式 → 加载已解压的扩展 → 选择项目根目录（`manifest.json` 所在位置）。

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
