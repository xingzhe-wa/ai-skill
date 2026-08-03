#!/usr/bin/env node
/**
 * yunxiao-workflow-router - 工作流分流与项目影响面分析
 *
 * 读取 yunxiao-client.js 生成的 context.json, 结合 config.json 中配置的项目
 * 与关键词, 输出:
 *   - projects.json: 命中项目与模块
 *   - routing.json:  工作流分流评分与推荐
 *   - summary.md:    开发入口摘要 (供模型直接消费)
 *
 * 设计原则:
 *   - 完全独立, 不依赖任何外部 skill
 *   - 仅基于关键词命中, 不做无依据断言
 *   - 评分透明可解释, 便于人类调整
 *
 * CLI:
 *   node scripts/router-analyze.js <serialNumber>
 *   node scripts/router-analyze.js --context <path/to/context.json>
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SKILL_ROOT = path.resolve(__dirname, '..');

function fail(msg) {
  console.error(`[router-analyze] ${msg}`);
  process.exit(1);
}

function loadConfig() {
  const configPath = path.join(SKILL_ROOT, 'config.json');
  if (!fs.existsSync(configPath)) {
    fail('未找到 config.json, 请在 skill 根目录创建该文件 (参考 SKILL.md 中的配置示例)');
  }
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch (e) {
    fail(`config.json 解析失败: ${e.message}`);
  }
}

function resolveOutputDir(config) {
  if (config.output && config.output.dir) {
    return path.resolve(SKILL_ROOT, config.output.dir);
  }
  return path.join(SKILL_ROOT, 'output');
}

function readContext(arg, config) {
  if (arg.startsWith('--context')) {
    const p = arg.split('=')[1] || process.argv[3];
    if (!p) fail('用法: router-analyze.js --context <path>');
    if (!fs.existsSync(p)) fail(`context 文件不存在: ${p}`);
    return { ctx: JSON.parse(fs.readFileSync(p, 'utf-8')), outDir: path.dirname(p) };
  }
  const sn = arg;
  const outDir = path.join(resolveOutputDir(config), sn);
  const ctxPath = path.join(outDir, 'context.json');
  if (!fs.existsSync(ctxPath)) {
    fail(`未找到 ${ctxPath}, 请先运行: node scripts/yunxiao-client.js summary ${sn}`);
  }
  return { ctx: JSON.parse(fs.readFileSync(ctxPath, 'utf-8')), outDir };
}

// ---------- 文本聚合 ----------

function aggregateText(ctx) {
  const parts = [];
  const cw = ctx.currentWorkitem || {};
  parts.push(cw.subject || '');
  parts.push(cw.descriptionText || '');
  for (const c of ctx.currentWorkitemComments || []) {
    parts.push(c.contentText || '');
  }
  for (const t of ctx.testcases || []) {
    parts.push(t.subject || t.title || '');
    parts.push(t.steps || t.description || '');
  }
  for (const r of ctx.relations || []) {
    parts.push(r.subject || '');
  }
  if (ctx.parentWorkitem && !ctx.parentWorkitem.error) {
    parts.push(ctx.parentWorkitem.subject || '');
    parts.push(ctx.parentWorkitem.descriptionText || '');
  }
  // 新增：Git 历史中的提交信息也加入文本聚合
  // 这样可以基于之前的提交内容进行关键词匹配
  if (ctx.gitHistory && ctx.gitHistory.results) {
    for (const result of ctx.gitHistory.results) {
      if (result.status === 'success' && result.commits) {
        for (const commit of result.commits) {
          parts.push(commit.subject || '');
          parts.push(commit.body || '');
        }
      }
    }
  }
  return parts.filter(Boolean).join('\n');
}

function countMatches(text, keywords) {
  if (!text || !keywords?.length) return { hits: [], total: 0 };
  const lower = text.toLowerCase();
  const hits = [];
  for (const kw of keywords) {
    if (!kw) continue;
    const k = String(kw).toLowerCase();
    let idx = 0;
    let count = 0;
    while ((idx = lower.indexOf(k, idx)) !== -1) {
      count += 1;
      idx += k.length;
    }
    if (count > 0) hits.push({ keyword: kw, count });
  }
  return { hits, total: hits.reduce((s, h) => s + h.count, 0) };
}

// ---------- 项目影响面 ----------

function analyzeProjects(text, config) {
  const projects = Array.isArray(config.projects) ? config.projects : [];
  const result = [];
  for (const p of projects) {
    const keywords = [p.name, ...(p.keywords || [])];
    const { hits, total } = countMatches(text, keywords);
    if (total > 0) {
      result.push({
        name: p.name,
        path: p.path || null,
        side: p.side || 'unknown',
        hits,
        score: total,
      });
    }
  }
  result.sort((a, b) => b.score - a.score);
  return result;
}

// ---------- 工作流分流 ----------

const DEFAULT_BUCKETS = {
  bug: ['bug', 'defect', '缺陷', '报错', '异常', '错误', '崩溃', 'crash', 'npe', 'stacktrace', '复现', '修复', '回退'],
  refactor: ['重构', 'refactor', '改造', '迁移', '废弃', '替换实现', '重新设计'],
  feature: ['新增', '新功能', '新需求', '支持', '增加', 'feature', '上线', '迭代'],
  apiChange: ['接口', 'api', 'endpoint', '协议', '字段', '入参', '出参', '兼容', '版本', 'breaking'],
  multiEnd: ['前端', '后端', '客户端', '服务端', 'client', 'server', 'app', '移动端', 'h5', 'admin', '管理后台'],
  smallChange: ['文案', '配置', '样式微调', '小调整', '改字', '修改文字'],
};

function bucketScores(text, config) {
  const buckets = { ...DEFAULT_BUCKETS, ...(config.routingKeywords || {}) };
  const scores = {};
  for (const [name, kws] of Object.entries(buckets)) {
    scores[name] = countMatches(text, kws).total;
  }
  return scores;
}

function decideWorkflow({ projects, scores, ctx }) {
  const reasons = [];
  const projectCount = projects.length;
  const cw = ctx.currentWorkitem || {};
  const category = (cw.categoryName || cw.category || '').toString().toLowerCase();

  // 显式缺陷类
  if (category.includes('bug') || category.includes('defect') || category.includes('缺陷') || scores.bug >= 2) {
    reasons.push(`关键词命中缺陷信号 (bug=${scores.bug}) 或类型为缺陷`);
    return {
      recommended: 'superpowers-debugging',
      reasons,
      nextSteps: [
        '进入 superpowers/systematic-debugging, 先建立证据链与复现路径',
        '必要时再进入 test-driven-development 编写回归用例',
      ],
    };
  }

  // 重构 / 新功能 / 复杂接口改造 -> brainstorming
  if (scores.refactor >= 1 || scores.apiChange >= 2 || scores.feature >= 2 || projectCount >= 2) {
    reasons.push(`命中重构(${scores.refactor}) / 接口改造(${scores.apiChange}) / 新功能(${scores.feature}) / 涉及项目数(${projectCount})`);
    return {
      recommended: 'superpowers-brainstorming',
      reasons,
      nextSteps: [
        '进入 superpowers/brainstorming, 探索 2-3 种实现路径与取舍',
        '若涉及多端 / 数据库 / 长期演进, 在 brainstorming 后转入 openspec-propose 留痕',
      ],
    };
  }

  // 多端协同显著 -> openspec
  if (scores.multiEnd >= 2 || projectCount >= 3) {
    reasons.push(`多端关键词命中(${scores.multiEnd}) 或项目命中数(${projectCount})`);
    return {
      recommended: 'openspec',
      reasons,
      nextSteps: [
        '进入 openspec-propose 生成 proposal/design/tasks',
        '在 tasks 中按端拆分子任务, 便于跨项目协同',
      ],
    };
  }

  // 小调整
  if (scores.smallChange >= 1 && scores.apiChange === 0) {
    reasons.push(`命中小调整关键词(${scores.smallChange}) 且无接口改造信号`);
    return {
      recommended: 'quick-analysis',
      reasons,
      nextSteps: [
        '直接在涉及项目中定位改动点, 给出最小 diff 建议',
        '完成后人工 review 即可, 无需正式 spec',
      ],
    };
  }

  // 默认: 信息不足, 走 brainstorming 做澄清
  reasons.push('未命中明确信号, 建议先澄清需求');
  return {
    recommended: 'superpowers-brainstorming',
    reasons,
    nextSteps: [
      '进入 superpowers/brainstorming, 与产品/测试澄清边界与验收',
      '澄清完成后再决定走 quick-analysis 还是 openspec-propose',
    ],
  };
}

// ---------- 输出 ----------

function buildSummaryMarkdown({ ctx, projects, scores, decision }) {
  const cw = ctx.currentWorkitem || {};
  const lines = [];
  lines.push(`# 云效工作项分析: ${ctx.serialNumber} ${cw.subject || ''}`.trim());
  lines.push('');
  lines.push('## 任务类型');
  lines.push(`- 云效类型: ${cw.categoryName || cw.category || '未知'}`);
  lines.push(`- 当前状态: ${cw.statusName || cw.status || '未知'}`);
  lines.push(`- 负责人: ${cw.assignedToName || cw.assignedTo || '未指定'}`);
  lines.push('');
  lines.push('## 上下文完整性');
  lines.push(`- 描述: ${cw.descriptionText ? '已获取' : '缺失'}`);
  lines.push(`- 评论数: ${(ctx.currentWorkitemComments || []).length}`);
  lines.push(`- 附件数: ${(cw.attachments || []).length}`);
  lines.push(`- 测试用例数: ${(ctx.testcases || []).length}`);
  lines.push(`- 关联工作项数: ${(ctx.relations || []).length}`);
  lines.push(`- 父任务: ${ctx.parentWorkitem && !ctx.parentWorkitem.error ? '已获取' : '无 / 缺失'}`);

  // 新增：Git 历史信息
  if (ctx.gitHistory) {
    lines.push(`- Git 历史提交: ${ctx.gitHistory.totalStats?.totalCommitsFound || 0} 条相关记录`);
    lines.push(`- Git 涉及文件: ${ctx.gitHistory.totalStats?.totalFilesChanged || 0} 个文件`);
  }

  lines.push('');
  lines.push('## 涉及项目');
  if (!projects.length) {
    lines.push('_未在配置的项目列表中命中关键词, 请检查 config.json 中的 projects.keywords_');
  } else {
    for (const p of projects) {
      const hitStr = p.hits.map(h => `${h.keyword}×${h.count}`).join(', ');
      lines.push(`- ${p.name} [${p.side}] (score=${p.score}) → ${p.path || '_未配置路径_'}`);
      lines.push(`  - 命中: ${hitStr}`);
    }
  }
  lines.push('');
  lines.push('## 分流评分');
  const scoreLines = Object.entries(scores).map(([k, v]) => `${k}=${v}`).join(', ');
  lines.push(`- ${scoreLines}`);
  lines.push('');
  lines.push('## 推荐工作流');
  lines.push(`- 推荐: **${decision.recommended}**`);
  lines.push('- 依据:');
  for (const r of decision.reasons) lines.push(`  - ${r}`);
  lines.push('- 下一步:');
  for (const s of decision.nextSteps) lines.push(`  - ${s}`);
  lines.push('');
  lines.push('## 待确认事项 (模型补充)');
  lines.push('- 此处由模型基于描述/评论/图片补充, 不做无依据断言');
  return lines.join('\n');
}

/**
 * 构建项目特定的摘要 Markdown
 * 与全局摘要的区别：
 * 1. 标题强调"本项目命中情况"
 * 2. 涉及项目部分只显示当前项目
 * 3. 添加指向技能目录完整上下文的链接
 */
function buildProjectSummaryMarkdown({ ctx, project, scores, decision, skillContextDir }) {
  const cw = ctx.currentWorkitem || {};
  const lines = [];
  lines.push(`# [${project.name}] ${ctx.serialNumber} ${cw.subject || ''}`.trim());
  lines.push('');
  lines.push('> 本文件由 yunxiao-workflow-router 自动生成');
  lines.push(`> 完整上下文位于: ${skillContextDir}`);
  lines.push('');
  lines.push('## 本项目命中情况');
  const hitStr = project.hits.map(h => `${h.keyword}×${h.count}`).join(', ');
  lines.push(`- 项目名称: ${project.name}`);
  lines.push(`- 项目端: ${project.side}`);
  lines.push(`- 关键词命中: ${hitStr} (总分=${project.score})`);
  lines.push(`- 项目路径: ${project.path || '_未配置_'}`);
  lines.push('');
  lines.push('## 任务基本信息');
  lines.push(`- 云效编号: ${ctx.serialNumber}`);
  lines.push(`- 类型: ${cw.categoryName || cw.category || '未知'}`);
  lines.push(`- 状态: ${cw.statusName || cw.status || '未知'}`);
  lines.push(`- 负责人: ${cw.assignedToName || cw.assignedTo || '未指定'}`);
  lines.push('');
  lines.push('## 推荐工作流');
  lines.push(`- 推荐: **${decision.recommended}**`);
  lines.push('- 依据:');
  for (const r of decision.reasons) lines.push(`  - ${r}`);
  lines.push('- 下一步:');
  for (const s of decision.nextSteps) lines.push(`  - ${s}`);
  lines.push('');
  lines.push('## 本项目待分析点');
  lines.push('> 以下内容需要模型基于描述/评论/图片，结合本项目特点进行分析');
  lines.push('- 疑似改动点 (文件/模块/函数级别): _待分析_');
  lines.push('- 潜在风险点: _待分析_');
  lines.push('- 跨端影响: _待分析_');
  return lines.join('\n');
}

// ---------- 主流程 ----------

/**
 * 将摘要输出到各项目的 output 目录
 * @param {Object} params - 参数对象
 * @param {Object} params.ctx - 上下文数据
 * @param {Array} params.projects - 命中的项目列表
 * @param {Object} params.scores - 分流评分
 * @param {Object} params.decision - 路由决策
 * @param {string} params.skillContextDir - 技能目录中的上下文路径 (用于引用)
 */
function writeToProjectDirectories({ ctx, projects, scores, decision, skillContextDir }) {
  const results = [];
  for (const project of projects) {
    // 跳过未配置路径的项目
    if (!project.path) {
      results.push({ project: project.name, status: 'skipped', reason: '未配置项目路径' });
      continue;
    }

    // 检查项目路径是否存在
    if (!fs.existsSync(project.path)) {
      results.push({ project: project.name, status: 'skipped', reason: '项目路径不存在' });
      continue;
    }

    // 创建项目的 output/<云效编号> 目录
    const projectOutDir = path.join(project.path, 'output', ctx.serialNumber);
    try {
      fs.mkdirSync(projectOutDir, { recursive: true });

      // 写入项目特定的摘要
      const projectMd = buildProjectSummaryMarkdown({
        ctx,
        project,
        scores,
        decision,
        skillContextDir,
      });
      const projectMdPath = path.join(projectOutDir, 'summary.md');
      fs.writeFileSync(projectMdPath, projectMd, 'utf-8');

      // 可选：也写入 routing.json (便于项目内自动化脚本使用)
      const routingPath = path.join(projectOutDir, 'routing.json');
      fs.writeFileSync(routingPath, JSON.stringify({ scores, decision }, null, 2), 'utf-8');

      results.push({ project: project.name, status: 'success', path: projectMdPath });
    } catch (e) {
      results.push({ project: project.name, status: 'error', reason: e.message });
    }
  }
  return results;
}

function main() {
  const arg = process.argv[2];
  if (!arg) fail('用法: node scripts/router-analyze.js <serialNumber> | --context <path>');

  const config = loadConfig();
  const { ctx, outDir } = readContext(arg, config);

  const text = aggregateText(ctx);
  const projects = analyzeProjects(text, config);
  const scores = bucketScores(text, config);
  const decision = decideWorkflow({ projects, scores, ctx });

  // 1. 在技能目录输出完整数据
  fs.writeFileSync(path.join(outDir, 'projects.json'), JSON.stringify(projects, null, 2), 'utf-8');
  fs.writeFileSync(path.join(outDir, 'routing.json'), JSON.stringify({ scores, decision }, null, 2), 'utf-8');
  const md = buildSummaryMarkdown({ ctx, projects, scores, decision });
  const mdPath = path.join(outDir, 'summary.md');
  fs.writeFileSync(mdPath, md, 'utf-8');

  // 2. 将摘要输出到各项目的 output 目录
  const skillContextDir = outDir;
  const projectResults = writeToProjectDirectories({ ctx, projects, scores, decision, skillContextDir });

  // 3. 自动调用 route-executor 生成 skill 调用配置
  const executorPath = path.join(SKILL_ROOT, 'scripts', 'route-executor.js');
  try {
    require('child_process').execSync(
      `node "${executorPath}" ${ctx.serialNumber}`,
      { cwd: SKILL_ROOT, stdio: 'pipe' }
    );
  } catch (e) {
    // route-executor 失败不中断主流程，只记录错误
    console.error(`[router-analyze] route-executor 执行失败: ${e.message}`);
  }

  console.log(JSON.stringify({
    serialNumber: ctx.serialNumber,
    skillOutputDir: outDir,
    skillSummary: mdPath,
    skillInvokeConfig: path.join(outDir, 'skill-invoke.json'),
    skillInputSummary: path.join(outDir, 'skill-input.md'),
    recommended: decision.recommended,
    projects: projects.map(p => p.name),
    projectOutputs: projectResults,
  }, null, 2));
}

main();
