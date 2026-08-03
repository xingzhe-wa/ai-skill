# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

yunxiao-workflow-router 是一个**完全自包含**的云效工作项智能分流器。根据用户输入的云效编号（如 `CMSPAL-1439`），自动拉取完整上下文（描述/评论/附件/测试用例/关联任务/父任务），分析跨项目影响面，并推荐合适的工作流路径（quick-analysis / superpowers-debugging / superpowers-brainstorming / openspec）。

## 常用命令

所有命令在技能根目录执行：

```bash
# 完整工作流：拉取上下文 + 生成分析报告
node scripts/yunxiao-client.js summary <云效编号>
node scripts/router-analyze.js <云效编号>

# 单步调试命令
node scripts/yunxiao-client.js search    <云效编号>    # 搜索工作项
node scripts/yunxiao-client.js detail    <workitemId>  # 获取详情（含附件下载）
node scripts/yunxiao-client.js comments  <workitemId>  # 获取评论
node scripts/yunxiao-client.js testcases <workitemId>  # 获取测试用例
node scripts/yunxiao-client.js relations <workitemId>  # 获取关联任务

# 分析已有上下文（跳过网络请求）
node scripts/router-analyze.js --context <path/to/context.json>
```

## 代码架构

### 设计原则

1. **完全独立**：不依赖任何其他 skill，整目录复制即可独立运行
2. **配置集中**：所有配置（含 token）在 `config.json`
3. **关键词驱动**：基于关键词命中进行项目匹配和路由决策，不做无依据断言
4. **容错优先**：测试用例/关联任务接口 403/404 时静默跳过，不中断主流程

### 核心组件

#### 0. git-history-analyzer.js（Git 历史分析器）

**职责**：检索相关的 Git 提交历史，为后续分析提供上下文。

**关键函数**：
- `GitClient`: Git 操作类，封装所有 git 命令调用
- `analyzeGitHistory()`: 分析多个项目的 Git 历史，搜索包含指定云效编号的提交
- `toMarkdown()`: 将分析结果转换为人类可读的 Markdown 格式

**数据流**：
```
云效编号 → analyzeGitHistory() → 搜索各项目 Git 历史 → 提取文件变更 → 输出分析结果
```

**集成方式**：
- 被 `yunxiao-client.js` 在 `summarize()` 中自动调用
- 结果添加到 `context.json` 的 `gitHistory` 字段
- 在 `context.md` 中生成 "Git 历史提交记录" 章节

#### 1. yunxiao-client.js（云效 API 客户端）

**职责**：封装云效 OpenAPI 调用，处理认证、分页、附件下载、HTML 解析，并集成 Git 历史分析。

**关键函数**：
- `summarize(ctx, serialNumber)`: 主入口，拉取工作项全量上下文并输出 `context.json` + `context.md`
- `getWorkitemDetail()`: 获取工作项详情，自动下载附件并将 HTML 内链接替换为本地相对路径
- `processAttachmentsInHtml()`: 从 HTML 中提取 `fileIdentifier`，下载附件到 `output/<编号>/`，返回替换后的 HTML
- `getWorkitemTestCases()` / `getWorkitemRelations()`: 兼容策略，尝试多个端点，失败时返回空数组

**数据流**：
```
云效编号 → searchWorkitem() → workitemId → getWorkitemDetail() + comments/testcases/relations + gitHistory → context.json
```

#### 2. router-analyze.js（路由分析器）

**职责**：读取 `context.json`，结合 `config.json` 中的项目配置，输出影响面分析和路由推荐。

**关键函数**：
- `aggregateText()`: 将描述、评论、测试用例、关联任务、父任务的文本聚合为单一字符串
- `analyzeProjects()`: 基于 `config.projects[].keywords` 匹配项目，返回命中列表及评分
- `bucketScores()`: 计算各类信号（bug/refactor/feature/apiChange/multiEnd/smallChange）的关键词命中数
- `decideWorkflow()`: 根据评分和工作项类型，返回推荐工作流及理由

**路由决策逻辑**：
```
缺陷类型或 bug>=2 → superpowers-debugging
重构/接口改造/新功能 或 多项目 → superpowers-brainstorming  
多端协同显著(>=2) 或 项目>=3 → openspec
小调整且无接口改造 → quick-analysis
默认 → superpowers-brainstorming（澄清需求）
```

**产物**：
- `projects.json`: 命中的项目列表（含命中关键词及评分）
- `routing.json`: 各类信号评分 + 推荐工作流 + 推荐理由
- `summary.md`: 人类可读的摘要报告
- `skill-invoke.json`: 技能调用配置（自动生成）
- `skill-input.md`: 技能输入摘要（自动生成）

**自动集成**：router-analyze.js 完成分析后自动调用 route-executor.js，生成标准化的 skill 调用配置。

#### 3. route-executor.js（路由执行器）

**职责**：读取 router-analyze.js 生成的 routing.json，根据推荐工作流生成标准化的 skill 调用配置。

**关键函数**：
- `buildSystematicDebuggingInput()`: 映射云效上下文到 systematic-debugging 输入格式（错误信息、复现步骤、期望/实际行为）
- `buildBrainstormingInput()`: 映射云效上下文到 brainstorming 输入格式（需求概述、约束条件、涉及项目）
- `buildQuickAnalysisInput()`: 映射云效上下文到 quick-analysis 输入格式（目标项目、分析任务清单）

**产物**：
- `skill-invoke.json`: 技能调用配置（skill 名称、参数、提示词模板）
- `skill-input.md`: 人类可读的技能输入摘要

### 配置文件（config.json）

**必填字段**：
- `token`: 云效 Personal Access Token（敏感，禁止提交）
- `organizationId`: 云效组织 ID
- `spaceMap`: 工作项前缀 → spaceId 映射，如 `{"CMSPAL": "xxx"}`

**可选字段**：
- `projects[]`: 项目影响面分析配置，每项含 `name` / `path` / `side` / `keywords[]`
- `routingKeywords`: 覆盖默认分流关键词桶
- `output.dir`: 输出目录，默认 `output`

### 输出目录结构

**技能目录** (完整上下文):
```
output/<云效编号>/
├── context.json              # 全量结构化数据 (包含 gitHistory 字段)
├── context.md                # 人类可读摘要 (包含 Git 历史记录)
├── projects.json             # 命中项目列表
├── routing.json              # 路由评分与决策
├── summary.md                # 全局开发入口摘要
├── skill-invoke.json         # 技能调用配置
├── skill-input.md            # 技能输入摘要
├── <fileId>.png              # 附件文件
└── parent/                   # 父任务上下文（如存在）
    └── <父任务编号>/
        ├── context.json
        └── ...
```

**项目目录** (项目特定摘要):
```
<项目路径>/output/<云效编号>/
├── summary.md                # 项目特定摘要（含本项目命中情况、待分析点）
└── routing.json              # 路由决策（便于项目内自动化脚本使用）
```

**设计说明**：
- 技能目录保留完整上下文，作为单一数据源
- 项目目录只放入针对该项目定制的摘要，避免冗余
- 项目摘要中包含指向技能目录完整上下文的引用路径

## Superpowers 深度集成

本技能已与 superpowers 集成，支持自动生成标准化输入：

### 工作流映射

| 推荐工作流 | Superpowers Skill | 核心流程 |
|-----------|------------------|---------|
| `superpowers-debugging` | `superpowers:systematic-debugging` | 四阶段根因分析 (根因调查 → 模式分析 → 假设测试 → 实现) |
| `superpowers-brainstorming` | `superpowers:brainstorming` | 需求探索 → 方案对比 → 设计确认 → 编写规范 → 创建计划 |
| `quick-analysis` | 内嵌轻量分析 | 直接定位改动点，输出 diff 建议 |

### 使用方式

1. **自动生成配置**：运行 `router-analyze.js` 后自动生成 `skill-invoke.json` 和 `skill-input.md`
2. **模型调用**：在 Claude Code 中使用 `/skill superpowers:systematic-debugging` 或 `/skill superpowers:brainstorming`，粘贴 `skill-input.md` 内容
3. **执行流程**：各 skill 有完整的流程约束和检查清单，确保不跳过关键步骤

### openspec 降级

当推荐 `openspec` 时，由于 skill 未安装，自动降级为 `brainstorming`。如需正式变更提案，在 brainstorming 完成后手动创建 proposal/design/tasks。

## 安全约束

- `config.json` 含 token，**必须**加入 `.gitignore`
- 日志中禁止打印 token / cookie / authorization header
- `output/` 包含工作项原文与附件，视为业务敏感数据，禁止提交

## 失败处理

- **token 未配置**：提示用户填写 `config.json` 并 gitignore
- **未知工作项前缀**：提示用户补充 `spaceMap`
- **测试用例/关联任务接口 403/404**：静默跳过（视为租户未开通）
- **图片读取失败**：继续文本分析，在"上下文完整性"中标注缺失
