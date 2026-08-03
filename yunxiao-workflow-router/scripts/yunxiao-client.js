#!/usr/bin/env node
/**
 * yunxiao-workflow-router - 独立云效 API 客户端
 *
 * 设计目标:
 *  1. 完全自包含, 不依赖任何外部 skill 或工程
 *  2. 全部配置 (含 token) 集中在 skill 根目录的 config.json
 *  3. 仅依赖 Node 18+ 内置 fetch / fs / path
 *  4. 所有产物输出到 skill 自身目录下的 output/<workitem-id>/
 *
 * CLI:
 *   node scripts/yunxiao-client.js summary    <serialNumber>
 *   node scripts/yunxiao-client.js detail     <workitemId> [serialNumber]
 *   node scripts/yunxiao-client.js comments   <workitemId>
 *   node scripts/yunxiao-client.js testcases  <workitemId>
 *   node scripts/yunxiao-client.js relations  <workitemId>
 *   node scripts/yunxiao-client.js search     <serialNumber>
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SKILL_ROOT = path.resolve(__dirname, '..');
const DEFAULT_OUTPUT_DIR = path.join(SKILL_ROOT, 'output');

// ---------- 配置与凭证 ----------

function loadConfig() {
  const configPath = path.join(SKILL_ROOT, 'config.json');
  if (!fs.existsSync(configPath)) {
    fail('未找到 config.json, 请在 skill 根目录创建该文件 (参考 SKILL.md 中的配置示例)');
  }
  try {
    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    cfg.__configPath = configPath;
    return cfg;
  } catch (e) {
    fail(`config.json 解析失败: ${e.message}`);
  }
}

function loadToken(config) {
  const token = config.token;
  if (!token || /^<.*>$/.test(String(token))) {
    fail('config.json 中未配置真实 token, 请填写 token 字段并确保该文件已加入 .gitignore');
  }
  return token;
}

function resolveOrgId(config) {
  const orgId = config.organizationId;
  if (!orgId || /^<.*>$/.test(String(orgId))) {
    fail('config.json 中未配置 organizationId');
  }
  return orgId;
}

function resolveApiBaseUrl(config, orgId) {
  const base = config.apiBaseUrl || 'https://openapi-rdc.aliyuncs.com/oapi/v1/projex/organizations';
  return `${base.replace(/\/$/, '')}/${orgId}`;
}

function resolveOutputDir(config) {
  if (config.output && config.output.dir) {
    return path.resolve(SKILL_ROOT, config.output.dir);
  }
  return DEFAULT_OUTPUT_DIR;
}

// ---------- 工具函数 ----------

function fail(msg) {
  console.error(`[yunxiao-client] ${msg}`);
  process.exit(1);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function parseSerialNumber(sn) {
  const m = (sn || '').match(/^([A-Z]+)-(\d+)$/);
  return m ? { prefix: m[1], number: sn } : { prefix: null, number: sn };
}

function htmlToText(html) {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>(?=)/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\r/g, '')
    .trim();
}

async function sendRequest(url, { method = 'GET', body = null, token, timeoutMs = 30000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers: {
        'x-yunxiao-token': token,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const snippet = text ? ` body=${text.slice(0, 200)}` : '';
      throw new Error(`HTTP ${res.status} ${res.statusText}${snippet}`);
    }
    const text = await res.text();
    return safeJsonParse(text) ?? text;
  } finally {
    clearTimeout(timer);
  }
}

// ---------- 附件 ----------

function extractFileIds(html) {
  if (!html) return [];
  const ids = new Set();
  const re = /fileIdentifier=([a-zA-Z0-9]+)/g;
  let m;
  while ((m = re.exec(html)) !== null) ids.add(m[1]);
  return [...ids];
}

function replaceFileLinks(html, idToPath, refDir) {
  if (!html || !Object.keys(idToPath).length) return html;
  return html.replace(
    /https:\/\/devops\.aliyun\.com\/projex\/api\/workitem\/file\/url\?fileIdentifier=([a-zA-Z0-9]+)/g,
    (match, id) => {
      const p = idToPath[id];
      if (!p) return match;
      let rel = path.relative(refDir, p);
      if (process.platform === 'win32') rel = rel.replace(/\\/g, '/');
      return rel;
    },
  );
}

async function downloadAttachment(ctx, workitemId, fileId, outDir) {
  const metaUrl = `${ctx.baseUrl}/workitems/${workitemId}/files/${fileId}`;
  const meta = await sendRequest(metaUrl, { token: ctx.token });
  if (!meta || !meta.url) throw new Error('文件元数据缺少 url');

  const res = await fetch(meta.url);
  if (!res.ok) throw new Error(`下载失败 HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());

  ensureDir(outDir);
  const fileName = meta.suffix ? `${fileId}.${meta.suffix}` : fileId;
  const filePath = path.join(outDir, fileName);
  fs.writeFileSync(filePath, buf);
  return { fileId, filePath, fileSize: buf.length, metadata: meta };
}

async function processAttachmentsInHtml(ctx, html, workitemId, outDir) {
  if (!html) return { html, attachments: [] };
  const ids = extractFileIds(html);
  if (!ids.length) return { html, attachments: [] };

  const idToPath = {};
  const attachments = [];
  for (const id of ids) {
    try {
      const r = await downloadAttachment(ctx, workitemId, id, outDir);
      idToPath[id] = r.filePath;
      attachments.push(r);
    } catch (e) {
      attachments.push({ fileId: id, error: e.message });
    }
  }
  return { html: replaceFileLinks(html, idToPath, outDir), attachments };
}

// ---------- 工作项 API ----------

async function searchWorkitem(ctx, spaceId, serialNumber) {
  const body = {
    spaceId,
    perPage: 10,
    page: 1,
    category: 'Req,Bug,Task,Defect',
    conditions: JSON.stringify({
      conditionGroups: [[
        {
          fieldIdentifier: 'serialNumber',
          format: 'input',
          value: [serialNumber],
          operator: 'EQUALS',
        },
      ]],
    }),
  };
  const r = await sendRequest(`${ctx.baseUrl}/workitems:search`, { method: 'POST', body, token: ctx.token });
  return Array.isArray(r) ? r : r?.data || [];
}

async function getWorkitemRaw(ctx, id) {
  return sendRequest(`${ctx.baseUrl}/workitems/${id}`, { token: ctx.token });
}

async function getWorkitemDetail(ctx, id, outDir) {
  const detail = await getWorkitemRaw(ctx, id);
  if (!detail) throw new Error('工作项详情为空');
  if (detail.description) {
    const { html, attachments } = await processAttachmentsInHtml(ctx, detail.description, id, outDir);
    detail.description = html;
    detail.descriptionText = htmlToText(html);
    detail.attachments = attachments;
  } else {
    detail.descriptionText = '';
    detail.attachments = [];
  }
  return detail;
}

async function getWorkitemComments(ctx, id, outDir) {
  const raw = await sendRequest(`${ctx.baseUrl}/workitems/${id}/comments`, { token: ctx.token });
  const list = Array.isArray(raw) ? raw : raw?.data || raw?.comments || [];
  const out = [];
  for (const c of list) {
    const htmlValue = extractHtmlFromComment(c);
    if (!htmlValue) {
      out.push(c);
      continue;
    }
    const { html, attachments } = await processAttachmentsInHtml(ctx, htmlValue, id, path.join(outDir, 'comments'));
    out.push({
      ...c,
      contentHtml: html,
      contentText: htmlToText(html),
      attachments,
    });
  }
  return out;
}

function extractHtmlFromComment(comment) {
  if (!comment) return null;
  const c = comment.content;
  if (!c) return null;
  if (typeof c === 'string') {
    const obj = safeJsonParse(c);
    return obj?.htmlValue || c;
  }
  if (typeof c === 'object') return c.htmlValue || null;
  return null;
}

// 测试用例 - 云效公共接口可能因租户开通情况不同, 这里采用兼容策略
async function getWorkitemTestCases(ctx, id) {
  const endpoints = [
    `${ctx.baseUrl}/workitems/${id}/testcases`,
    `${ctx.baseUrl}/workitems/${id}/relations/testcases`,
  ];
  for (const url of endpoints) {
    try {
      const r = await sendRequest(url, { token: ctx.token });
      if (r) return Array.isArray(r) ? r : r?.data || r?.testcases || [];
    } catch (e) {
      // 容错: 接口未开通或不存在时跳过
      if (!/HTTP 40[34]/.test(e.message)) {
        // 非鉴权/未找到错误向上抛出可能太激进, 这里保留错误信息但不中断
        continue;
      }
    }
  }
  return [];
}

// 关联任务 - 同样使用兼容策略
async function getWorkitemRelations(ctx, id) {
  const endpoints = [
    `${ctx.baseUrl}/workitems/${id}/relations`,
    `${ctx.baseUrl}/workitems/${id}/related`,
  ];
  for (const url of endpoints) {
    try {
      const r = await sendRequest(url, { token: ctx.token });
      if (r) return Array.isArray(r) ? r : r?.data || r?.relations || [];
    } catch (e) {
      continue;
    }
  }
  return [];
}

// ---------- Git 历史集成 ----------

/**
 * 调用 git-history-analyzer 分析相关提交历史
 * @param {Object} ctx - 上下文对象
 * @param {string} serialNumber - 云效编号
 * @returns {Object|null} Git 历史分析结果，失败时返回 null
 */
function analyzeGitHistory(ctx, serialNumber) {
  try {
    const analyzerPath = path.join(SKILL_ROOT, 'scripts', 'git-history-analyzer.js');

    // 检查 analyzer 是否存在
    if (!fs.existsSync(analyzerPath)) {
      console.warn('[yunxiao-client] git-history-analyzer.js 不存在，跳过 Git 历史分析');
      return null;
    }

    // 调用 analyzer 脚本
    const output = execSync(
      `node "${analyzerPath}" "${serialNumber}"`,
      {
        cwd: SKILL_ROOT,
        stdio: 'pipe',
        encoding: 'utf-8',
        maxBuffer: 50 * 1024 * 1024, // 50MB
        timeout: 30000, // 30 秒超时
      }
    );

    // 解析结果
    const result = JSON.parse(output);
    console.log(`[yunxiao-client] Git 历史分析完成: 找到 ${result.totalStats?.totalCommitsFound || 0} 个相关提交`);
    return result;
  } catch (e) {
    // Git 历史分析失败不影响主流程
    console.warn(`[yunxiao-client] Git 历史分析失败: ${e.message}`);
    return null;
  }
}

// ---------- 汇总 ----------

async function summarize(ctx, serialNumber) {
  const { prefix, number } = parseSerialNumber(serialNumber);
  const spaceId = ctx.config.spaceMap?.[prefix];
  if (!spaceId) {
    fail(`未知工作项前缀: ${prefix || serialNumber}, 当前支持: ${Object.keys(ctx.config.spaceMap || {}).join(', ') || '<空>'}`);
  }

  const items = await searchWorkitem(ctx, spaceId, number);
  if (!items.length) fail(`未找到工作项: ${serialNumber}`);
  const workitemId = items[0].id;

  const outRoot = ensureDir(path.join(ctx.outputDir, serialNumber));

  const current = await getWorkitemDetail(ctx, workitemId, outRoot);
  const comments = await safeRun(() => getWorkitemComments(ctx, workitemId, outRoot), []);
  const testcases = await safeRun(() => getWorkitemTestCases(ctx, workitemId), []);
  const relations = await safeRun(() => getWorkitemRelations(ctx, workitemId), []);

  let parent = null;
  let parentComments = [];
  if (current.parentId && current.parentId !== 'EMPTY_VALUE' && current.parentId !== 'null') {
    try {
      const parentBasic = await getWorkitemRaw(ctx, current.parentId);
      const parentSn = parentBasic?.serialNumber || String(current.parentId);
      const parentDir = ensureDir(path.join(outRoot, 'parent', parentSn));
      parent = await getWorkitemDetail(ctx, current.parentId, parentDir);
      parentComments = await safeRun(() => getWorkitemComments(ctx, current.parentId, parentDir), []);
    } catch (e) {
      parent = { error: e.message, parentId: current.parentId };
    }
  }

  // 调用 Git 历史分析（同步调用，不影响主流程）
  const gitHistory = analyzeGitHistory(ctx, serialNumber);

  const result = {
    serialNumber,
    workitemId,
    fetchedAt: new Date().toISOString(),
    outputDir: outRoot,
    currentWorkitem: current,
    currentWorkitemComments: comments,
    testcases,
    relations,
    parentWorkitem: parent,
    parentWorkitemComments: parentComments,
    gitHistory, // 新增：Git 历史分析结果
  };

  fs.writeFileSync(path.join(outRoot, 'context.json'), JSON.stringify(result, null, 2), 'utf-8');
  writeContextMarkdown(outRoot, result);

  return result;
}

async function safeRun(fn, fallback) {
  try {
    return await fn();
  } catch (e) {
    console.error(`[yunxiao-client] 子任务失败: ${e.message}`);
    return fallback;
  }
}

function writeContextMarkdown(outRoot, ctx) {
  const cw = ctx.currentWorkitem || {};
  const lines = [];
  lines.push(`# ${ctx.serialNumber} ${cw.subject || ''}`.trim());
  lines.push('');
  lines.push('## 基本信息');
  lines.push(`- 编号: ${ctx.serialNumber}`);
  lines.push(`- 工作项ID: ${ctx.workitemId}`);
  lines.push(`- 类型: ${cw.categoryName || cw.category || '未知'}`);
  lines.push(`- 状态: ${cw.statusName || cw.status || '未知'}`);
  lines.push(`- 负责人: ${cw.assignedToName || cw.assignedTo || '未指定'}`);
  lines.push(`- 拉取时间: ${ctx.fetchedAt}`);
  lines.push('');
  lines.push('## 描述');
  lines.push(cw.descriptionText || '_无描述_');
  if (cw.attachments?.length) {
    lines.push('');
    lines.push('## 描述附件');
    for (const a of cw.attachments) {
      if (a.error) lines.push(`- ${a.fileId}: 下载失败 ${a.error}`);
      else lines.push(`- ${a.fileId}: ${path.relative(outRoot, a.filePath)}`);
    }
  }
  if (ctx.currentWorkitemComments?.length) {
    lines.push('');
    lines.push('## 评论');
    ctx.currentWorkitemComments.forEach((c, i) => {
      lines.push(`### #${i + 1} ${c.createdByName || c.createdBy || ''} ${c.gmtCreate || ''}`);
      lines.push(c.contentText || htmlToText(c.contentHtml) || '_<非文本评论>_');
    });
  }
  if (ctx.testcases?.length) {
    lines.push('');
    lines.push('## 关联测试用例');
    for (const t of ctx.testcases) {
      lines.push(`- ${t.serialNumber || t.id || ''} ${t.subject || t.title || ''}`);
    }
  }
  if (ctx.relations?.length) {
    lines.push('');
    lines.push('## 关联工作项');
    for (const r of ctx.relations) {
      lines.push(`- [${r.relationType || r.type || 'related'}] ${r.serialNumber || r.id || ''} ${r.subject || ''}`);
    }
  }
  if (ctx.parentWorkitem && !ctx.parentWorkitem.error) {
    const p = ctx.parentWorkitem;
    lines.push('');
    lines.push('## 父任务');
    lines.push(`- ${p.serialNumber || ''} ${p.subject || ''}`);
    lines.push(p.descriptionText || '_无描述_');
  }

  // 新增：Git 历史提交记录
  if (ctx.gitHistory) {
    const gitMarkdown = formatGitHistoryToMarkdown(ctx.gitHistory);
    if (gitMarkdown) {
      lines.push('');
      lines.push(gitMarkdown);
    }
  }

  fs.writeFileSync(path.join(outRoot, 'context.md'), lines.join('\n'), 'utf-8');
}

/**
 * 将 Git 历史分析结果格式化为 Markdown
 * @param {Object} gitHistory - Git 历史分析结果
 * @returns {string} Markdown 文本
 */
function formatGitHistoryToMarkdown(gitHistory) {
  if (!gitHistory || !gitHistory.totalStats) {
    return '';
  }

  const lines = [];

  if (gitHistory.totalStats.validReposFound === 0) {
    lines.push('## Git 历史提交记录');
    lines.push('');
    lines.push('_未找到有效的 Git 仓库_');
    return lines.join('\n');
  }

  if (gitHistory.totalStats.totalCommitsFound === 0) {
    lines.push('## Git 历史提交记录');
    lines.push('');
    lines.push(`_已检查 ${gitHistory.totalStats.validReposFound} 个仓库，但未找到包含此编号的提交_`);
    return lines.join('\n');
  }

  lines.push('## Git 历史提交记录');
  lines.push('');
  lines.push('### 总体概况');
  lines.push(`- 搜索项目数: ${gitHistory.totalStats.projectsSearched}`);
  lines.push(`- 有效仓库数: ${gitHistory.totalStats.validReposFound}`);
  lines.push(`- 找到提交数: ${gitHistory.totalStats.totalCommitsFound}`);
  lines.push(`- 涉及文件数: ${gitHistory.totalStats.totalFilesChanged}`);
  lines.push('');

  // 按项目展示
  for (const result of gitHistory.results || []) {
    if (result.status !== 'success') continue;

    lines.push(`### ${result.project} [${result.side || '未知端'}]`);
    lines.push(`- 路径: \`${result.path}\``);
    lines.push(`- 分支: ${result.branch || '未知'}`);
    if (result.remote) {
      lines.push(`- 远程: ${result.remote}`);
    }
    lines.push(`- 提交数: ${result.stats.commitCount}`);
    lines.push(`- 文件变更: ${result.stats.uniqueFilesChanged} 个文件 (${result.stats.modified} 修改, ${result.stats.added} 新增, ${result.stats.deleted} 删除)`);
    lines.push('');

    // 时间线（最近 5 条）
    lines.push('#### 最近提交');
    const recentCommits = (result.commits || []).slice(0, 5);
    for (const commit of recentCommits) {
      lines.push(`- **${commit.date.substring(0, 10)}** - ${commit.shortHash} - ${commit.subject}`);
      if (commit.changes && commit.changes.files.length > 0) {
        const fileSummary = commit.changes.files.slice(0, 3).map(f => {
          return `\`${f.path}\` (${f.changeTypeName})`;
        }).join(', ');
        lines.push(`  - 变更: ${fileSummary}${commit.changes.files.length > 3 ? ' ...' : ''}`);
      }
    }

    if (recentCommits.length === 0) {
      lines.push('_无提交记录_');
    }

    lines.push('');
  }

  return lines.join('\n');
}

// ---------- CLI ----------

function buildContext() {
  const config = loadConfig();
  const token = loadToken(config);
  const orgId = resolveOrgId(config);
  return {
    config,
    token,
    orgId,
    baseUrl: resolveApiBaseUrl(config, orgId),
    outputDir: ensureDir(resolveOutputDir(config)),
  };
}

async function main() {
  const [, , command, ...args] = process.argv;
  if (!command) {
    console.error('用法: node scripts/yunxiao-client.js <summary|detail|comments|testcases|relations|search> ...');
    process.exit(1);
  }
  const ctx = buildContext();
  try {
    switch (command) {
      case 'summary': {
        const sn = args[0];
        if (!sn) fail('用法: summary <serialNumber>');
        const r = await summarize(ctx, sn);
        console.log(JSON.stringify({ serialNumber: r.serialNumber, outputDir: r.outputDir, contextJson: path.join(r.outputDir, 'context.json') }, null, 2));
        break;
      }
      case 'detail': {
        const id = args[0];
        const sn = args[1];
        if (!id) fail('用法: detail <workitemId> [serialNumber]');
        const outDir = ensureDir(path.join(ctx.outputDir, sn || String(id)));
        const r = await getWorkitemDetail(ctx, id, outDir);
        console.log(JSON.stringify(r, null, 2));
        break;
      }
      case 'comments': {
        const id = args[0];
        if (!id) fail('用法: comments <workitemId>');
        const outDir = ensureDir(path.join(ctx.outputDir, String(id)));
        const r = await getWorkitemComments(ctx, id, outDir);
        console.log(JSON.stringify(r, null, 2));
        break;
      }
      case 'testcases': {
        const id = args[0];
        if (!id) fail('用法: testcases <workitemId>');
        const r = await getWorkitemTestCases(ctx, id);
        console.log(JSON.stringify(r, null, 2));
        break;
      }
      case 'relations': {
        const id = args[0];
        if (!id) fail('用法: relations <workitemId>');
        const r = await getWorkitemRelations(ctx, id);
        console.log(JSON.stringify(r, null, 2));
        break;
      }
      case 'search': {
        const sn = args[0];
        if (!sn) fail('用法: search <serialNumber>');
        const { prefix, number } = parseSerialNumber(sn);
        const spaceId = ctx.config.spaceMap?.[prefix];
        if (!spaceId) fail(`未知前缀: ${prefix}`);
        const r = await searchWorkitem(ctx, spaceId, number);
        console.log(JSON.stringify(r, null, 2));
        break;
      }
      default:
        fail(`未知命令: ${command}`);
    }
  } catch (e) {
    fail(`执行失败: ${e.message}`);
  }
}

main();
