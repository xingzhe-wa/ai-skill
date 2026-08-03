#!/usr/bin/env node
/**
 * yunxiao-workflow-router - 路由执行器
 *
 * 读取 router-analyze.js 生成的 routing.json，根据推荐的工作流，
 * 生成标准化的 skill 调用配置和输入文件。
 *
 * 设计目标:
 *   1. 将云效上下文映射到各 skill 的输入格式
 *   2. 生成可直接消费的 skill 配置
 *   3. 支持模型自动调用或人类手动调用
 *
 * CLI:
 *   node scripts/route-executor.js <serialNumber>
 *
 * 输出:
 *   - skill-invoke.json: 技能调用配置 (含 skill 名称、参数、提示词模板)
 *   - skill-input.md:   人类可读的技能输入摘要
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SKILL_ROOT = path.resolve(__dirname, '..');

function fail(msg) {
  console.error(`[route-executor] ${msg}`);
  process.exit(1);
}

function loadJson(filePath) {
  if (!fs.existsSync(filePath)) {
    fail(`文件不存在: ${filePath}`);
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (e) {
    fail(`解析失败: ${e.message}`);
  }
}

function resolveOutputDir(config) {
  if (config.output && config.output.dir) {
    return path.resolve(SKILL_ROOT, config.output.dir);
  }
  return path.join(SKILL_ROOT, 'output');
}

/**
 * 映射云效上下文到 systematic-debugging skill 的输入格式
 *
 * systematic-debugging 需要的核心信息:
 * 1. 错误信息/问题描述
 * 2. 复现步骤
 * 3. 期望行为 vs 实际行为
 * 4. 环境信息
 * 5. 已尝试的修复 (如有)
 */
function buildSystematicDebuggingInput(ctx, project) {
  const cw = ctx.currentWorkitem || {};
  const comments = ctx.currentWorkitemComments || [];

  // 从描述和评论中提取关键信息
  const description = cw.descriptionText || '';
  const commentText = comments.map(c => c.contentText || '').join('\n');

  // 尝试提取错误信息 (stacktrace, error, 报错, 异常等)
  const errorPatterns = [
    /(?:error|exception|错误|异常)[^:]*:[\s\S]{0,500}/i,
    /stacktrace|stack trace|堆栈/i,
    /undefined (is not|isn't)/i,
    /cannot read|cannot read property/i,
    /is not defined|null pointer/i,
  ];
  let errorInfo = '';
  for (const pattern of errorPatterns) {
    const match = (description + '\n' + commentText).match(pattern);
    if (match) {
      errorInfo = match[0];
      break;
    }
  }

  // 尝试提取复现步骤
  const stepPatterns = [
    /(?:复现|重现|步骤|step)[^:]*:[\s\S]{0,800}/i,
    /(?:操作|operation)[^:]*:[\s\S]{0,500}/i,
  ];
  let reproduceSteps = '';
  for (const pattern of stepPatterns) {
    const match = (description + '\n' + commentText).match(pattern);
    if (match) {
      reproduceSteps = match[0];
      break;
    }
  }

  return {
    skill: 'superpowers:systematic-debugging',
    params: {
      workitemSerial: ctx.serialNumber,
      project: project?.name || '未指定',
      projectPath: project?.path || null,
    },
    promptTemplate: `
## 云效工作项: ${ctx.serialNumber} ${cw.subject || ''}

### 问题描述
${errorInfo || description || '_详见上下文_'}

${reproduceSteps ? `### 复现步骤\n${reproduceSteps}\n` : ''}

### 期望行为
_请从描述/评论中提取_

### 实际行为
_请从描述/评论中提取_

### 环境信息
- 项目: ${project?.name || '未指定'} (${project?.side || 'unknown'})
- 云效编号: ${ctx.serialNumber}
- 工作项类型: ${cw.categoryName || cw.category || '未知'}
- 状态: ${cw.statusName || cw.status || '未知'}

### 附件信息
- 附件数: ${(cw.attachments || []).length}
- 测试用例数: ${(ctx.testcases || []).length}

### 完整上下文位置
${project?.path ? `${project.path}/output/${ctx.serialNumber}/summary.md` : '_技能目录 output/' + ctx.serialNumber + '/_'}

---
请使用 systematic-debugging 流程:
1. Phase 1: 根因调查 - 仔细阅读错误信息，确保可复现
2. Phase 2: 模式分析 - 找到类似工作的代码对比
3. Phase 3: 假设与测试 - 形成单一假设并最小化测试
4. Phase 4: 实现 - 创建失败用例，实现修复

注意: 在修复前必须找到根本原因。禁止无依据猜测。
    `.trim(),
  };
}

/**
 * 映射云效上下文到 brainstorming skill 的输入格式
 *
 * brainstorming 需要的核心信息:
 * 1. 需求概述
 * 2. 约束条件
 * 3. 涉及的项目/模块
 * 4. 相关上下文链接
 */
function buildBrainstormingInput(ctx, projects, decision) {
  const cw = ctx.currentWorkitem || {};
  const comments = ctx.currentWorkitemComments || [];

  // 提取需求描述
  const description = cw.descriptionText || '';

  // 尝试提取约束条件 (deadline, 限制, 必须, 禁止等)
  const constraintPatterns = [
    /(?:constraint|限制|约束|必须|禁止|不能|不允许)[^:：]*[:：][\s\S]{0,300}/gi,
    /(?:deadline|截止|时间|交付)[^:：]*[:：][\s\S]{0,200}/gi,
  ];
  const constraints = [];
  for (const pattern of constraintPatterns) {
    const matches = (description + '\n' + comments.map(c => c.contentText || '').join('\n')).match(pattern);
    if (matches) constraints.push(...matches);
  }

  // 项目列表摘要
  const projectSummary = projects.map(p => {
    const hits = p.hits.map(h => h.keyword).join(', ');
    return `- ${p.name} [${p.side}] - 命中关键词: ${hits}`;
  }).join('\n');

  return {
    skill: 'superpowers:brainstorming',
    params: {
      workitemSerial: ctx.serialNumber,
      projects: projects.map(p => ({ name: p.name, path: p.path, side: p.side })),
    },
    promptTemplate: `
## 云效工作项: ${ctx.serialNumber} ${cw.subject || ''}

### 需求概述
${description || '_详见上下文_'}

### 推荐工作流依据
${decision.reasons.map(r => `- ${r}`).join('\n')}

### 涉及项目
${projectSummary || '_未命中具体项目_'}

${constraints.length ? `### 约束条件\n${constraints.map(c => `- ${c}`).join('\n')}\n` : ''}

### 上下文信息
- 测试用例数: ${(ctx.testcases || []).length}
- 关联任务数: ${(ctx.relations || []).length}
- 父任务: ${ctx.parentWorkitem && !ctx.parentWorkitem.error ? '存在' : '无'}

### 项目上下文位置
${projects.map(p => p.path ? `${p.path}/output/${ctx.serialNumber}/summary.md` : null).filter(Boolean).join('\n') || '_技能目录 output/' + ctx.serialNumber + '/_'}

---
请使用 brainstorming 流程:
1. 探索项目上下文 - 检查项目文件、文档、最近提交
2. 询问澄清问题 - 一次一个问题，理解目的/约束/验收标准
3. 提出 2-3 种方案 - 包含权衡和推荐
4. 展示设计 - 分段展示，每段后确认
5. 编写设计文档 - 保存到 docs/superpowers/specs/

注意: 这是复杂需求/重构/新功能，需要充分探索方案后再进入实现。
    `.trim(),
  };
}

/**
 * 映射云效上下文到 quick-analysis 的输入格式
 *
 * quick-analysis 是轻量级分析，直接在项目中定位改动点
 */
function buildQuickAnalysisInput(ctx, project) {
  const cw = ctx.currentWorkitem || {};
  const description = cw.descriptionText || '';

  return {
    skill: 'quick-analysis', // 内嵌分析，非外部 skill
    params: {
      workitemSerial: ctx.serialNumber,
      project: project?.name || '未指定',
      projectPath: project?.path || null,
    },
    promptTemplate: `
## 云效工作项: ${ctx.serialNumber} ${cw.subject || ''}

### 快速分析 (小改动)
${description}

### 目标项目
${project ? `
- 名称: ${project.name}
- 端: ${project.side}
- 路径: ${project.path || '_未配置_'}
- 命中关键词: ${project.hits.map(h => `${h.keyword}×${h.count}`).join(', ')}
` : '_未命中具体项目_'}

### 分析任务
1. 定位疑似改动点 (文件/函数/组件级别)
2. 分析最小 diff 思路
3. 识别风险点
4. 列出待确认事项

### 输出位置
${project?.path ? `${project.path}/output/${ctx.serialNumber}/quick-analysis.md` : 'output/' + ctx.serialNumber + '/quick-analysis.md'}

---
注意: 这是小范围改动 (文案/配置/单页面调整)，直接分析给出建议，不进入完整 brainstorming 流程。
    `.trim(),
  };
}

/**
 * 主流程
 */
function main() {
  const serialNumber = process.argv[2];
  if (!serialNumber) fail('用法: node scripts/route-executor.js <serialNumber>');

  // 加载配置和上下文
  const configPath = path.join(SKILL_ROOT, 'config.json');
  const config = loadJson(configPath);
  const outputDir = path.join(resolveOutputDir(config), serialNumber);

  const routingPath = path.join(outputDir, 'routing.json');
  const contextPath = path.join(outputDir, 'context.json');
  const projectsPath = path.join(outputDir, 'projects.json');

  const { decision } = loadJson(routingPath);
  const ctx = loadJson(contextPath);
  const projects = loadJson(projectsPath);

  // 根据推荐工作流构建输入
  let skillInvoke = null;
  const workflow = decision.recommended;

  switch (workflow) {
    case 'superpowers-debugging':
      // 选择评分最高的项目
      const targetProject = projects[0] || null;
      skillInvoke = buildSystematicDebuggingInput(ctx, targetProject);
      break;

    case 'superpowers-brainstorming':
      skillInvoke = buildBrainstormingInput(ctx, projects, decision);
      break;

    case 'quick-analysis':
      skillInvoke = buildQuickAnalysisInput(ctx, projects[0] || null);
      break;

    case 'openspec':
      // 跳过 openspec，降级为 brainstorming
      skillInvoke = buildBrainstormingInput(ctx, projects, decision);
      skillInvoke.fallback = true;
      skillInvoke.fallbackReason = 'openspec skill 未安装，降级为 brainstorming';
      break;

    default:
      fail(`未知工作流: ${workflow}`);
  }

  // 输出技能调用配置
  const invokePath = path.join(outputDir, 'skill-invoke.json');
  fs.writeFileSync(invokePath, JSON.stringify(skillInvoke, null, 2), 'utf-8');

  // 输出人类可读的技能输入摘要
  const inputMdPath = path.join(outputDir, 'skill-input.md');
  const inputMd = [
    `# ${workflow.toUpperCase()} 输入摘要`,
    '',
    `**云效编号:** ${ctx.serialNumber}`,
    `**工作项:** ${ctx.currentWorkitem?.subject || ''}`,
    `**推荐工作流:** ${workflow}`,
    '',
    skillInvoke.fallback ? `> ⚠️ ${skillInvoke.fallbackReason}` : '',
    '',
    '## 技能调用配置',
    '',
    '```json',
    JSON.stringify({ skill: skillInvoke.skill, params: skillInvoke.params }, null, 2),
    '```',
    '',
    '## 提示词模板',
    '',
    '```',
    skillInvoke.promptTemplate,
    '```',
    '',
    '## 下一步操作',
    '',
    '### 模型自动调用',
    '',
    '如果当前会话支持，可以直接调用对应的 skill:',
    '',
    `\`\`\``,
    `/skill ${skillInvoke.skill}`,
    skillInvoke.promptTemplate,
    `\`\`\``,
    '',
    '### 人类手动调用',
    '',
    '1. 复制上面的提示词模板',
    '2. 调用对应的 skill:',
    `   - 在 Claude Code 中输入: /skill ${skillInvoke.skill}`,
    '   - 粘贴提示词内容',
    '',
  ].filter(Boolean).join('\n');

  fs.writeFileSync(inputMdPath, inputMd, 'utf-8');

  console.log(JSON.stringify({
    serialNumber,
    outputDir,
    workflow,
    skill: skillInvoke.skill,
    skillInvoke: invokePath,
    skillInput: inputMdPath,
    fallback: skillInvoke.fallback || null,
  }, null, 2));
}

main();
