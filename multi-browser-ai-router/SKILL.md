---
name: multi-browser-ai-router
description: 将用户问题路由到多个 AI 平台（ChatGPT、Gemini、Grok、Claude、Perplexity）的网页端，使用浏览器自动化完成交互并返回结果。支持 Cookie 持久化，首次登录后无需重复认证。
---

# Multi-Browser AI Router

## 触发时机

当用户请求使用特定 AI 平台回答问题时触发：
- 自然语言：`用 ChatGPT 帮我...`、`让 Gemini 回答...`、`问一下 Grok...`
- 命令格式：`/ai <platform> <question>`
- 平台别名：
  - ChatGPT/GPT/openai → `chatgpt`
  - Gemini/Google AI/谷歌 → `gemini`
  - Grok/X AI/马斯克AI → `grok`
  - Perplexity/搜索AI → `perplexity`
  - Claude/Anthropic → `claude`

## 执行流程

### 1. 解析请求
从用户消息中提取：
- `platform`: 目标 AI 平台名称（默认：chatgpt）
- `question`: 要问的问题内容

### 2. 检查并加载 Session
```bash
# 检查 session 文件
ls ~/.openclaw/ai-sessions/<platform>.json

# 存在则加载
openclaw browser --browser-profile chrome state load ~/.openclaw/ai-sessions/<platform>.json

# 不存在则触发首次登录流程
```

### 2a. 首次登录流程（仅首次）
```bash
# 打开平台登录页
openclaw browser --browser-profile chrome open <login_url>

# 通知用户手动登录，完成后保存 session
openclaw browser --browser-profile chrome state save ~/.openclaw/ai-sessions/<platform>.json
chmod 600 ~/.openclaw/ai-sessions/<platform>.json
```

### 3. 导航到平台
```bash
openclaw browser --browser-profile chrome open <platform_url>
openclaw browser --browser-profile chrome wait --selector <input_selector> --timeout 10000
```

### 4. 验证登录状态
```bash
# 获取页面快照检查登录状态
openclaw browser --browser-profile chrome snapshot --json

# 如果发现登录按钮说明 session 过期
# → 删除旧 session → 触发首次登录流程
```

### 5. 输入问题并提交
```bash
# 获取快照找到输入框
openclaw browser --browser-profile chrome snapshot -i --json

# 点击并填写输入框
openclaw browser --browser-profile chrome click @<input_ref>
openclaw browser --browser-profile chrome fill @<input_ref> "<question>"

# 提交
openclaw browser --browser-profile chrome press "Enter"
```

### 6. 等待并提取回复
```bash
# 等待回复出现（最多 60 秒）
openclaw browser --browser-profile chrome wait --selector <response_selector> --timeout 60000

# 等待停止按钮消失
openclaw browser --browser-profile chrome wait-for-hidden --selector <stop_button_selector>

# 提取最后一条回复
openclaw browser --browser-profile chrome snapshot --json
openclaw browser --browser-profile chrome get text @<last_response_ref> --json
```

### 7. 返回结果
```
─────────────────────────────
📡 来自 <Platform>
─────────────────────────────
<response_text>
─────────────────────────────
```

## 平台配置

| 平台 | URL | 登录 URL | 输入框选择器 | 停止按钮 | 回复选择器 | Session 文件 |
|------|-----|---------|-------------|---------|-----------|-------------|
| ChatGPT | https://chatgpt.com | https://chatgpt.com/auth/login | `#prompt-textarea` | `button[data-testid='stop-button']` | `[data-message-author-role='assistant']` | `chatgpt.json` |
| Gemini | https://gemini.google.com | https://accounts.google.com | `rich-textarea` | `.stop-button` | `model-response` | `gemini.json` |
| Grok | https://grok.com | https://grok.com | `[data-testid='grok-input']` | `[aria-label='Stop']` | `[data-testid='grok-message']` | `grok.json` |
| Claude | https://claude.ai | https://claude.ai/login | `[data-testid='chat-input']` | `[aria-label='Stop generating']` | `[data-is-streaming='false']` | `claude.json` |
| Perplexity | https://perplexity.ai | https://perplexity.ai | `textarea[placeholder]` | `button[aria-label='Stop']` | `.prose` | `perplexity.json` |

## 错误处理

| 错误情况 | 处理方式 |
|---------|---------|
| Session 过期 | 删除旧 session，通知用户重新登录 |
| 页面加载超时 | 重试一次，失败则建议切换平台 |
| 输入框未找到 | 重新 snapshot 获取新 ref 后重试 |
| 回复超时 (60s) | 返回已获取的部分内容并提示可能未完整 |
| 平台不可用 | 建议切换到备用平台（顺序：gemini → perplexity → chatgpt） |

## Session 管理

Session 存储位置：`~/.openclaw/ai-sessions/`
```
├── chatgpt.json      # ChatGPT cookies + localStorage
├── gemini.json       # Google session
├── grok.json         # X/Twitter session
├── claude.json       # Claude.ai session
└── perplexity.json   # Perplexity session
```

安全规则：
- 不存储明文密码，只存储 Cookie/localStorage
- 文件权限保持 `600`（仅所有者可读）
- 避免高频调用（建议每分钟不超过 3-5 次）

## 命令

- `/ai <platform> <question>` - 路由到指定 AI 平台
- `/ai-status` - 查看各平台 session 状态
- `/ai-login <platform>` - 手动刷新某平台登录

## 使用示例

```
用户：用 Gemini 解释一下量子纠缠
用户：/ai chatgpt 写一首关于秋天的诗
用户：让 Grok 搜索今天的科技新闻
```
