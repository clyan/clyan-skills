#!/usr/bin/env node
/**
 * multi-browser-ai-router.js
 * OpenClaw Skill — 将问题路由到各大 AI 网页端
 * 
 * 用法:
 *   node multi-browser-ai-router.js --platform chatgpt --question "你的问题"
 *   node multi-browser-ai-router.js --platform gemini  --question "你的问题"
 */

import { execSync, exec } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { promisify } from 'util';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);

// ─── 平台配置 ──────────────────────────────────────────────────────────────

const PLATFORMS = {
  chatgpt: {
    name: 'ChatGPT',
    url: 'https://chatgpt.com',
    loginUrl: 'https://chatgpt.com/auth/login',
    inputSelector: '#prompt-textarea',
    stopSelector: "button[data-testid='stop-button']",
    responseSelector: "[data-message-author-role='assistant']",
    loginCheckText: 'Log in',       // 页面出现这个文字 = 未登录
    sessionCheckSelector: 'nav',    // 页面出现这个 = 已登录
  },
  gemini: {
    name: 'Gemini',
    url: 'https://gemini.google.com',
    loginUrl: 'https://accounts.google.com/ServiceLogin',
    inputSelector: 'rich-textarea',
    stopSelector: '.stop-button',
    responseSelector: 'model-response',
    loginCheckText: 'Sign in',
    sessionCheckSelector: '.profile-picture',
  },
  grok: {
    name: 'Grok',
    url: 'https://grok.com',
    loginUrl: 'https://grok.com',
    inputSelector: "[data-testid='grok-input']",
    stopSelector: "[aria-label='Stop']",
    responseSelector: "[data-testid='grok-message']",
    loginCheckText: 'Sign in',
    sessionCheckSelector: "[data-testid='SideNav_AccountSwitcher_Button']",
  },
  perplexity: {
    name: 'Perplexity',
    url: 'https://perplexity.ai',
    loginUrl: 'https://perplexity.ai',
    inputSelector: 'textarea',
    stopSelector: "button[aria-label='Stop']",
    responseSelector: '.prose',
    loginCheckText: 'Sign in',
    sessionCheckSelector: "[data-testid='user-menu']",
  },
  claude: {
    name: 'Claude',
    url: 'https://claude.ai',
    loginUrl: 'https://claude.ai/login',
    inputSelector: '[data-testid="chat-input"], .ProseMirror',
    stopSelector: "button[aria-label='Stop']",
    responseSelector: '[data-testid="message-content"]',
    loginCheckText: 'Log in',
    sessionCheckSelector: '[data-testid="user-menu"]',
  },
};

// ─── 常量 ───────────────────────────────────────────────────────────────────

const SESSIONS_DIR = path.join(os.homedir(), '.openclaw', 'ai-sessions');
const BROWSER_PROFILE = 'chrome'; // 使用 Chrome 扩展模式（已登录的真实浏览器）
const RESPONSE_TIMEOUT_MS = 60000;
const PAGE_LOAD_TIMEOUT_MS = 10000;

// ─── 工具函数 ────────────────────────────────────────────────────────────────

function log(msg) {
  process.stderr.write(`[router] ${msg}\n`);
}

function browser(args) {
  const cmd = `openclaw browser --browser-profile ${BROWSER_PROFILE} ${args}`;
  log(`> ${cmd}`);
  return execSync(cmd, { encoding: 'utf8' });
}

async function browserAsync(args) {
  const cmd = `openclaw browser --browser-profile ${BROWSER_PROFILE} ${args}`;
  log(`> ${cmd}`);
  return execAsync(cmd);
}

function ensureSessionsDir() {
  if (!existsSync(SESSIONS_DIR)) {
    mkdirSync(SESSIONS_DIR, { recursive: true });
    log(`创建 session 目录: ${SESSIONS_DIR}`);
  }
}

function sessionPath(platform) {
  return path.join(SESSIONS_DIR, `${platform}.json`);
}

// ─── Session 管理 ────────────────────────────────────────────────────────────

function loadSession(platform) {
  const file = sessionPath(platform);
  if (existsSync(file)) {
    try {
      browser(`state load ${file}`);
      log(`✅ 已加载 ${platform} session`);
      return true;
    } catch (e) {
      log(`⚠️  加载 session 失败: ${e.message}`);
      return false;
    }
  }
  log(`未找到 ${platform} session 文件`);
  return false;
}

function saveSession(platform) {
  const file = sessionPath(platform);
  browser(`state save ${file}`);
  // 限制文件权限（仅所有者可读写）
  execSync(`chmod 600 ${file}`);
  log(`✅ ${platform} session 已保存至 ${file}`);
}

// ─── 登录状态检测 ────────────────────────────────────────────────────────────

function checkLoginStatus(platformConfig) {
  try {
    const snapshot = JSON.parse(browser('snapshot --json'));
    const text = JSON.stringify(snapshot);
    
    // 出现"登录"按钮 = 未登录
    if (text.includes(platformConfig.loginCheckText)) {
      return false;
    }
    // 出现用户导航元素 = 已登录
    return true;
  } catch (e) {
    log(`检测登录状态失败: ${e.message}`);
    return false;
  }
}

// ─── 等待工具 ────────────────────────────────────────────────────────────────

async function waitForElement(selector, timeoutMs = PAGE_LOAD_TIMEOUT_MS) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      browser(`wait --selector "${selector}" --timeout 2000`);
      return true;
    } catch {
      await new Promise(r => setTimeout(r, 500));
    }
  }
  throw new Error(`等待元素超时: ${selector}`);
}

async function waitForStopButtonGone(stopSelector, timeoutMs = RESPONSE_TIMEOUT_MS) {
  const start = Date.now();
  log('等待 AI 回复完成...');
  
  // 先等停止按钮出现
  await new Promise(r => setTimeout(r, 2000));
  
  // 再等停止按钮消失（代表回复完毕）
  while (Date.now() - start < timeoutMs) {
    try {
      browser(`wait-for-hidden --selector "${stopSelector}" --timeout 2000`);
      return true;
    } catch {
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  log('⚠️  回复可能未完整（超时）');
  return false;
}

// ─── 提取回复 ────────────────────────────────────────────────────────────────

function extractLastResponse(responseSelector) {
  try {
    // 重新快照，获取最新 DOM
    const snapshot = JSON.parse(browser('snapshot --json'));
    
    // 找到所有匹配的回复元素，取最后一个的 ref
    const allRefs = findRefsBySelector(snapshot, responseSelector);
    if (allRefs.length === 0) {
      throw new Error('未找到回复元素');
    }
    
    const lastRef = allRefs[allRefs.length - 1];
    const result = JSON.parse(browser(`get text @${lastRef} --json`));
    return result.text || result.value || '';
  } catch (e) {
    log(`提取回复失败: ${e.message}`);
    return null;
  }
}

function findRefsBySelector(snapshot, selector) {
  // 简单递归搜索 snapshot 树，找到匹配 selector 的节点 ref
  const refs = [];
  function walk(node) {
    if (!node) return;
    // 按 role 或 testId 匹配（简化实现）
    if (node.ref && nodeMatchesSelector(node, selector)) {
      refs.push(node.ref);
    }
    if (node.children) node.children.forEach(walk);
  }
  walk(snapshot);
  return refs;
}

function nodeMatchesSelector(node, selector) {
  // 简化的选择器匹配，支持 data-testid 和 class
  if (selector.includes('data-testid=')) {
    const testId = selector.match(/data-testid=['"]([^'"]+)['"]/)?.[1];
    return node.attributes?.['data-testid'] === testId;
  }
  if (selector.startsWith('.')) {
    const cls = selector.slice(1);
    return node.attributes?.class?.includes(cls);
  }
  if (selector.startsWith('#')) {
    return node.attributes?.id === selector.slice(1);
  }
  // tag name 匹配
  return node.role === selector || node.tag === selector;
}

// ─── 主路由逻辑 ──────────────────────────────────────────────────────────────

async function routeToAI(platform, question) {
  const config = PLATFORMS[platform];
  if (!config) {
    throw new Error(`未知平台: ${platform}。可用: ${Object.keys(PLATFORMS).join(', ')}`);
  }

  ensureSessionsDir();
  log(`🚀 路由到 ${config.name}: "${question.slice(0, 50)}..."`);

  // Step 1: 加载已有 session
  const sessionLoaded = loadSession(platform);

  // Step 2: 打开平台页面
  log(`打开 ${config.url}`);
  browser(`open ${config.url}`);
  await waitForElement(config.inputSelector);

  // Step 3: 验证登录状态
  const isLoggedIn = checkLoginStatus(config);
  
  if (!isLoggedIn) {
    if (sessionLoaded) {
      log('Session 已过期，需要重新登录');
    }
    // 通知需要手动登录
    return {
      status: 'login_required',
      platform: config.name,
      message: `请在浏览器中登录 ${config.name}，登录完成后发送"已登录"继续。`,
      loginUrl: config.loginUrl,
    };
  }

  // Step 4: 如果是首次成功登录，保存 session
  if (!sessionLoaded) {
    saveSession(platform);
  }

  // Step 5: 找到输入框并输入问题
  log('获取页面快照，定位输入框...');
  const snapshot = JSON.parse(browser('snapshot -i --json'));
  const inputRef = findRefsBySelector(snapshot, config.inputSelector)[0];
  
  if (!inputRef) {
    throw new Error(`未找到输入框 (${config.inputSelector})，页面可能已更新`);
  }

  browser(`click @${inputRef}`);
  browser(`fill @${inputRef} ${JSON.stringify(question)}`);
  browser(`press "Enter"`);
  log('✅ 问题已提交');

  // Step 6: 等待回复完成
  await waitForStopButtonGone(config.stopSelector);

  // Step 7: 提取回复
  const responseText = extractLastResponse(config.responseSelector);
  
  if (!responseText) {
    throw new Error('无法提取回复内容');
  }

  log(`✅ 获取到回复 (${responseText.length} 字符)`);

  return {
    status: 'success',
    platform: config.name,
    question,
    response: responseText,
  };
}

// ─── CLI 入口 ────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  
  let platform = 'chatgpt';
  let question = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--platform' && args[i + 1]) platform = args[++i];
    if (args[i] === '--question' && args[i + 1]) question = args[++i];
  }

  if (!question) {
    console.error('用法: node multi-browser-ai-router.js --platform <name> --question "<问题>"');
    process.exit(1);
  }

  try {
    const result = await routeToAI(platform, question);
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(JSON.stringify({ status: 'error', message: err.message }));
    process.exit(1);
  }
}

main();
