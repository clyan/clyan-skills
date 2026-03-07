# Multi-AI Router Skill

## 用途
将用户的问题路由到 ChatGPT、Gemini、Grok 等网页端免费 AI，通过 OpenClaw 浏览器自动化完成交互，返回结果。支持 Cookie 持久化，首次手动登录后无需重复认证。

## 触发时机
当用户说以下任何一种时触发此 Skill：
- "用 ChatGPT 帮我..."
- "让 Gemini 回答..."
- "问一下 Grok..."
- "用 [AI名称] 回答这个问题"
- "调用网页版 AI"
- `/ai <platform> <question>` 格式的命令

## 前置要求
- OpenClaw 已安装并运行
- `~/.openclaw/ai-sessions/` 目录已创建（用于存储各平台 Cookie）
- 首次使用某平台时需手动登录一次

---

## 平台配置表

| 平台 | URL | 输入框选择器 | 提交方式 | Session 文件 |
|------|-----|-------------|---------|-------------|
| ChatGPT | https://chatgpt.com | `#prompt-textarea` | `Enter` | `chatgpt.json` |
| Gemini | https://gemini.google.com | `[data-test="chat-input"]` | `Enter` | `gemini.json` |
| Grok | https://x.com/i/grok | `[data-testid="grok-input"]` | `Enter` | `grok.json` |
| Claude | https://claude.ai | `[data-testid="chat-input"]` | `Enter` | `claude.json` |
| Perplexity | https://perplexity.ai | `textarea` | `Enter` | `perplexity.json` |

---

## 执行流程

### Step 1: 解析路由目标
```
从用户消息中提取:
- platform: 目标AI平台名称 (默认: chatgpt)
- question: 要问的问题内容
```

### Step 2: 检查并加载 Session
```bash
# 检查 session 文件是否存在
ls ~/.openclaw/ai-sessions/<platform>.json

# 如果存在，加载 Cookie（跳过登录）
openclaw browser --browser-profile chrome state load ~/.openclaw/ai-sessions/<platform>.json

# 如果不存在，触发首次登录流程（见 Step 2a）
```

### Step 2a: 首次登录流程（仅首次）
```bash
# 打开平台登录页
openclaw browser --browser-profile chrome open <login_url>

# 通知用户手动登录
# [告知用户]: "请在浏览器中完成登录，完成后发送'已登录'继续"

# 用户确认后保存 session
openclaw browser --browser-profile chrome state save ~/.openclaw/ai-sessions/<platform>.json
```

### Step 3: 导航到平台
```bash
openclaw browser --browser-profile chrome open <platform_url>

# 等待页面加载
openclaw browser --browser-profile chrome wait --selector <input_selector> --timeout 10000
```

### Step 4: 验证登录状态
```bash
# 获取页面快照，检查是否已登录
openclaw browser --browser-profile chrome snapshot --json

# 检查快照中是否包含登录按钮（如果有，说明 session 已过期）
# 如果登录失效 → 删除旧 session 文件 → 触发 Step 2a
```

### Step 5: 输入问题并提交
```bash
# 获取最新快照，找到输入框 ref
openclaw browser --browser-profile chrome snapshot -i --json

# 点击并填写输入框
openclaw browser --browser-profile chrome click @<input_ref>
openclaw browser --browser-profile chrome fill @<input_ref> "<question>"

# 提交（按 Enter）
openclaw browser --browser-profile chrome press "Enter"
```

### Step 6: 等待并提取回复
```bash
# 等待回复出现（轮询，最多 60 秒）
openclaw browser --browser-profile chrome wait --selector <response_selector> --timeout 60000

# 等待"停止生成"按钮消失（确认回复完整）
openclaw browser --browser-profile chrome wait-for-hidden --selector <stop_button_selector>

# 重新快照，提取最后一条回复文本
openclaw browser --browser-profile chrome snapshot --json
openclaw browser --browser-profile chrome get text @<last_response_ref> --json
```

### Step 7: 返回结果
```
将提取的文本格式化后返回给用户，注明来源平台。
格式：
---
[来自 <Platform>]
<response_text>
---
```

---

## 平台专属配置

### ChatGPT (chatgpt.com)
```yaml
login_url: https://chatgpt.com/auth/login
input_selector: "#prompt-textarea"
stop_selector: "button[data-testid='stop-button']"
response_selector: "[data-message-author-role='assistant']"
response_last: true  # 取最后一条
session_check: "nav" # 出现导航栏说明已登录
login_check: "button:has-text('Log in')" # 出现说明未登录
```

### Gemini (gemini.google.com)
```yaml
login_url: https://accounts.google.com
input_selector: "rich-textarea"
stop_selector: ".stop-button"  
response_selector: "model-response"
response_last: true
session_check: ".profile-picture"
login_check: "a:has-text('Sign in')"
```

### Grok (x.com/i/grok)
```yaml
login_url: https://x.com/login
input_selector: "[data-testid='grok-input']"
stop_selector: "[aria-label='Stop']"
response_selector: "[data-testid='grok-message']"
response_last: true
session_check: "[data-testid='SideNav_AccountSwitcher_Button']"
login_check: "a[href='/login']"
```

### Perplexity (perplexity.ai)
```yaml
login_url: https://perplexity.ai
input_selector: "textarea[placeholder]"
stop_selector: "button[aria-label='Stop']"
response_selector: ".prose"
response_last: true
session_check: "[data-testid='user-menu']"
login_check: "button:has-text('Sign in')"
```

---

## 错误处理

| 错误情况 | 处理方式 |
|---------|---------|
| Session 过期 | 删除旧 session → 通知用户重新登录 |
| 页面加载超时 | 重试一次，失败则切换到备用平台 |
| 输入框未找到 | 重新 snapshot 获取最新 ref 后重试 |
| 回复超时 (60s) | 返回已获取的部分内容，并提示可能未完整 |
| 平台不可用 | 自动切换到默认备用平台（Gemini） |

---

## Session 持久化管理

```bash
# Session 文件存储位置
~/.openclaw/ai-sessions/
  ├── chatgpt.json      # ChatGPT cookies + localStorage
  ├── gemini.json       # Google session
  ├── grok.json         # X/Twitter session  
  ├── perplexity.json   # Perplexity session
  └── claude.json       # Claude.ai session

# 检查所有 session 状态
ls -la ~/.openclaw/ai-sessions/

# 手动刷新某个平台的 session
openclaw browser --browser-profile chrome open <platform_url>
# [手动操作后]
openclaw browser --browser-profile chrome state save ~/.openclaw/ai-sessions/<platform>.json
```

---

## 使用示例

用户输入：
```
用 ChatGPT 帮我写一首关于秋天的诗
```

Agent 执行：
1. 解析 → platform: `chatgpt`, question: `帮我写一首关于秋天的诗`
2. 加载 `~/.openclaw/ai-sessions/chatgpt.json`
3. 打开 `https://chatgpt.com`
4. 验证登录状态 ✓
5. 找到输入框 ref，填入问题，按 Enter
6. 等待回复完成
7. 提取文本，返回给用户

---

## 注意事项
- **不要**在 session 文件中存储明文密码，只存储 Cookie
- session 文件权限建议设为 `chmod 600`
- 建议不超过合理频率调用，避免账号被风控
- 页面 UI 变动时，重新 snapshot 获取新的 ref 即可自动适配
