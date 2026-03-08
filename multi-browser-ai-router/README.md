
# 安装与使用指南

## 一、安装 Skill

```bash
# 1. 将此目录复制到 OpenClaw workspace 的 skills 文件夹
cp -r ./multi-browser-ai-router ~/.openclaw/workspace/skills/

# 2. 创建 session 存储目录
mkdir -p ~/.openclaw/ai-sessions
chmod 700 ~/.openclaw/ai-sessions

# 3. 重启 Gateway 使 Skill 生效
openclaw gateway restart
```

---

## 二、首次登录各平台（只需做一次）

> 使用 Chrome 扩展模式（连接你真实的浏览器），所以你平时浏览器里已经登录的账号直接可用。

### 检查你的浏览器是否已登录

打开 Chrome，访问以下网址，确认已登录：
- https://chatgpt.com
- https://gemini.google.com  
- https://grok.com
- https://perplexity.ai

### 保存各平台 session

在 OpenClaw 聊天中发送：
```
/ai-login chatgpt
/ai-login gemini
/ai-login grok
/ai-login perplexity
```

或手动执行：
```bash
# 确保 Chrome 扩展已连接
openclaw browser --browser-profile chrome status

# 依次保存各平台 session
openclaw browser --browser-profile chrome open https://chatgpt.com
openclaw browser --browser-profile chrome state save ~/.openclaw/ai-sessions/chatgpt.json
chmod 600 ~/.openclaw/ai-sessions/chatgpt.json

openclaw browser --browser-profile chrome open https://gemini.google.com
openclaw browser --browser-profile chrome state save ~/.openclaw/ai-sessions/gemini.json
chmod 600 ~/.openclaw/ai-sessions/gemini.json

# ... 其他平台类似
```

---

## 三、日常使用

### 自然语言（推荐）
```
用 Gemini 帮我解释一下黑洞是什么
让 ChatGPT 写一首关于秋天的诗
用 Grok 搜索今天的科技新闻
```

### 命令格式
```
/ai gemini 解释量子纠缠
/ai chatgpt 写一个 Python 爬虫示例
/ai perplexity 今天比特币价格
```

### 查看状态
```
/ai-status
```
输出示例：
```
AI Session 状态:
✅ ChatGPT     — 已登录 (2026-03-01)
✅ Gemini      — 已登录 (2026-03-05)
✅ Grok        — 已登录 (2026-02-28)
❌ Perplexity  — 未登录 (运行 /ai-login perplexity)
❌ Claude      — 未登录
```

---

## 四、Session 过期处理

如果某平台提示"需要重新登录"：

```bash
# 方法1: 通过聊天命令
/ai-login chatgpt

# 方法2: 手动刷新
rm ~/.openclaw/ai-sessions/chatgpt.json
openclaw browser --browser-profile chrome open https://chatgpt.com
# (确认浏览器中登录状态正常)
openclaw browser --browser-profile chrome state save ~/.openclaw/ai-sessions/chatgpt.json
chmod 600 ~/.openclaw/ai-sessions/chatgpt.json
```

---

## 五、Chrome 扩展配置

确保 `~/.openclaw/openclaw.json` 中启用了 Chrome 扩展模式：

```json
{
  "browser": {
    "enabled": true,
    "defaultProfile": "chrome",
    "profiles": {
      "chrome": {
        "mode": "extension",
        "color": "#4285F4"
      },
      "openclaw": {
        "mode": "managed"
      }
    }
  }
}
```

---

## 六、注意事项

| 项目 | 建议 |
|------|------|
| 调用频率 | 每分钟不超过 3-5 次，模拟正常人类使用节奏 |
| Session 安全 | 文件权限保持 600，不要上传到 Git |
| UI 变动适应 | 平台 UI 更新后 snapshot 机制会自动适配，无需手动维护选择器 |
| 账号风险 | 使用个人账号，不建议高频批量调用 |
| 备用方案 | 首选平台不可用时，可用 `/ai gemini <问题>` 切换 |
