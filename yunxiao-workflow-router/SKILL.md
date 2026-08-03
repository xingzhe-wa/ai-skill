---
name: yunxiao-workflow-router
description: 根据阿里云云效工作项编号 (需求/任务/缺陷) 自动拉取完整上下文 (描述/图片/附件/评论/测试用例/关联任务/父任务), 分析跨项目影响面, 并在快速分析 / superpowers-debugging / superpowers-brainstorming / openspec 之间智能分流。用户输入云效编号 (如 CMSPAL-1439, ABC-123) 时自动触发。
allowed-tools: "Read,Bash,Glob,Grep"
---

# yunxiao-workflow-router

云效工作项 → 跨项目开发入口的智能分流器。本 skill **完全自包含**, 不依赖任何其他 skill, 可整目录复制到其他工作站独立运行。

## 目录结构

```
yunxiao-workflow-router/
├── SKILL.md
├── config.json              # 唯一配置文件 (含 token + 业务配置)
├── scripts/
│   ├── yunxiao-client.js    # 云效 API 客户端 (自动集成 Git 历史分析)
│   ├── git-history-analyzer.js  # Git 历史提交分析器
│   ├── router-analyze.js    # 路由分析器 (基于上下文 + Git 历史)
│   └── route-executor.js    # 路由执行器
└── output/                  # 运行时自动生成
```

## 触发条件

用户消息中出现云效工作项编号, 格式为 `{大写前缀}-{数字}`, 例如 `CMSPAL-1439`、`ABC-123`。前缀需在本 skill 的 `config.json -> spaceMap` 中配置。

**深度集成**: 触发后自动执行完整流程: 拉取上下文 → 分析影响面 → 生成 skill 调用配置 → (可选) 自动调用 superpowers。

## 配置 (唯一文件: config.json)

所有配置集中在 skill 根目录的 `config.json`, 字段说明:

- `token`: 云效 Personal Access Token (敏感, 禁止提交)
- `organizationId`: 云效组织 ID
- `apiBaseUrl`: 可选, 默认 `https://openapi-rdc.aliyuncs.com/oapi/v1/projex/organizations`
- `spaceMap`: 工作项前缀 → spaceId 映射, 例如 `{"CMSPAL": "xxx"}`
- `projects`: 数组, 每项含 `name` / `path` / `side` (client|server|...) / `keywords[]`
  - **`path`**: 项目本地路径 (用于 Git 历史分析, 必须是有效的 Git 仓库)
  - **`side`**: 项目端标识 (如 "frontend", "backend", "mobile")
  - **`keywords`**: 关键词列表 (用于项目匹配和路由分析)
- `routingKeywords`: 可选, 覆盖默认分流关键词桶
- `output.dir`: 可选, 默认 `output`

## 安全前置 (强约束)

- `config.json` 含 token, **必须**加入 `.gitignore`, 禁止提交、禁止分享、禁止粘贴到聊天/issue
- 日志中禁止打印 token / cookie / authorization header
- `output/` 中包含工作项原文与附件, 视为业务敏感数据, 同样不要提交

## Git 历史集成 (新功能)

yunxiao-workflow-router 会自动在分析工作项之前检索相关的 Git 提交历史, 作为额外的上下文信息。

### 功能说明

- **自动检索**: 根据云效编号在配置的项目中搜索包含该编号的 Git 提交
- **文件变更分析**: 提取相关提交的文件变更范围, 按项目分组
- **时间线视图**: 提供最近相关提交的时间线
- **上下文增强**: 将 Git 历史信息添加到 `context.json` 和 `context.md`

### 前置条件

需要在 `config.json` 中正确配置项目路径:

```json
{
  "projects": [
    {
      "name": "my-project",
      "path": "C:/Users/xxx/projects/my-project",  // 必须是有效的 Git 仓库
      "side": "frontend",
      "keywords": ["前端", "页面", "组件"]
    }
  ]
}
```

### 产物说明

`yunxiao-client.js summary` 执行后, `output/<云效编号>/` 目录会额外包含:

- **context.json**: 新增 `gitHistory` 字段, 包含完整的 Git 历史分析结果
- **context.md**: 新增 "Git 历史提交记录" 章节, 人类可读的历史记录摘要

### 容错策略

- 项目路径不存在: 静默跳过
- 非 Git 仓库: 静默跳过
- 未找到相关提交: 保留空结果, 不中断主流程
- Git 命令执行失败: 记录警告, 继续

### 使用场景

1. **重构任务**: 查看之前的改动范围, 避免遗漏相关文件
2. **缺陷修复**: 了解历史修复尝试, 找到根本原因
3. **代码审查**: 快速定位相关代码变更
4. **影响分析**: 基于历史变更预测当前改动的影响范围

### CLI 独立调用

```bash
# 单独测试 Git 历史分析
node scripts/git-history-analyzer.js CMSPAL-1439
```

## 执行流程

按顺序完成以下步骤, 全部命令在本 skill 根目录执行 (PowerShell / bash 通用)。

### 1. 拉取云效完整上下文

```bash
node scripts/yunxiao-client.js summary <云效编号>
```

脚本会自动: 搜索工作项 → 拉取详情/评论/测试用例/关联任务/父任务 → **检索 Git 历史提交** → 下载附件并将 HTML 内链接替换为本地相对路径 → 输出标准化产物。

产物位于**技能目录** `output/<云效编号>/`:
- `context.json`: 全量结构化数据 (包含 `gitHistory` 字段)
- `context.md`: 人类可读摘要 (描述/评论/附件/测试用例/关联/父任务/**Git 历史记录**)
- 各级附件文件 (图片直接可被 Read 工具读取)

### 2. 读取上下文并视觉分析图片

- 用 Read 工具打开 `output/<云效编号>/context.md`
- 如果附件中存在图片 (png/jpg/webp), **必须**用 Read 工具读取图片做视觉分析, 不要仅凭文字推断
- 等待用户对工作项理解确认后再进入下一步

### 3. 执行分流分析

```bash
node scripts/router-analyze.js <云效编号>
```

脚本会输出:

**技能目录** `output/<云效编号>/`:
- `projects.json`: 命中的项目列表 (基于 `config.json -> projects.keywords`)
- `routing.json`: 各类信号评分 + 推荐工作流 + 推荐理由
- `summary.md`: 全局开发入口摘要 (包含所有项目概况)
- `skill-invoke.json`: **[NEW]** 技能调用配置 (自动生成)
- `skill-input.md`: **[NEW]** 技能输入摘要 (人类可读)

**各项目目录** `<项目路径>/output/<云效编号>/` (仅对命中且已配置路径的项目):
- `summary.md`: 项目特定摘要 (包含本项目命中情况、关键词分析、待分析点)
- `routing.json`: 路由决策 (便于项目内自动化脚本使用)

**自动集成**: router-analyze.js 会自动调用 route-executor.js，生成标准化的 skill 调用配置。

### 4. 按推荐工作流推进

router-analyze.js 已自动生成 `skill-invoke.json` 和 `skill-input.md`，包含标准化的 skill 调用配置。

#### 4a. `quick-analysis` — 快速分析

适用: 文案、配置、单页面 UI、明确字段调整等小范围改动。

**自动生成的输入** (`skill-input.md`):
- 目标项目及命中关键词
- 快速分析任务清单
- 输出位置指引

**执行方式**:
```bash
# 模型直接基于 skill-input.md 执行分析
# 或手动查看: output/<云效编号>/skill-input.md
```

#### 4b. `superpowers-debugging` — 系统化调试

适用: 缺陷、线上问题、行为不一致, 已有复现路径或报错信息。

**自动生成的输入** (`skill-input.md`):
- 错误信息/问题描述
- 复现步骤 (已从描述/评论中提取)
- 期望 vs 实际行为
- 环境信息
- systematic-debugging 完整流程提示

**执行方式**:
```bash
# 在 Codex 中
/skill superpowers:systematic-debugging
# 然后粘贴 skill-input.md 中的提示词模板

# 或查看完整配置
cat output/<云效编号>/skill-invoke.json
```

**流程** (systematic-debugging 四阶段):
1. Phase 1: 根因调查 - 仔细阅读错误信息，确保可复现
2. Phase 2: 模式分析 - 找到类似工作的代码对比
3. Phase 3: 假设与测试 - 形成单一假设并最小化测试
4. Phase 4: 实现 - 创建失败用例，实现修复

#### 4c. `superpowers-brainstorming` — 方案探索

适用: **重构 / 新功能 / 复杂接口改造 / 复杂业务规则调整 / 影响范围不确定的模块演进**。

**自动生成的输入** (`skill-input.md`):
- 需求概述
- 推荐工作流依据
- 涉及项目及命中关键词
- 约束条件 (已从描述/评论中提取)
- brainstorming 完整流程提示

**执行方式**:
```bash
# 在 Codex 中
/skill superpowers:brainstorming
# 然后粘贴 skill-input.md 中的提示词模板

# 或查看完整配置
cat output/<云效编号>/skill-invoke.json
```

**流程** (brainstorming):
1. 探索项目上下文 - 检查项目文件、文档、最近提交
2. 询问澄清问题 - 一次一个问题，理解目的/约束/验收标准
3. 提出 2-3 种方案 - 包含权衡和推荐
4. 展示设计 - 分段展示，每段后确认
5. 编写设计文档 - 保存到 `docs/superpowers/specs/`
6. 调用 writing-plans - 创建实现计划

#### 4d. `openspec` — 正式变更提案 (已跳过)

**说明**: openspec skill 未安装，自动降级为 brainstorming。

若需要正式变更提案，在 brainstorming 完成后，手动创建 proposal/design/tasks 文档。

## 输出模板

**技能目录产物** (`output/<云效编号>/`):
- 完整上下文 (context.json, context.md, 附件)
- 全局分析 (projects.json, routing.json, summary.md)
- **[NEW]** 技能调用配置 (skill-invoke.json, skill-input.md)

**项目目录产物** (`<项目路径>/output/<云效编号>/`):
- 项目特定摘要 (summary.md)
- 路由决策 (routing.json)

推荐在最终给用户的回复中包含:

```
## 工作项摘要
[一句话概括]

## 涉及项目
- <项目名> [<端>] → <路径>
- 本项目摘要已输出到: <项目路径>/output/<云效编号>/summary.md

## 推荐工作流
<quick-analysis | superpowers-debugging | superpowers-brainstorming | openspec-propose>
依据: ...
下一步: ...

## 技能调用配置
已生成: output/<云效编号>/skill-input.md
执行: /skill <superpowers:xxx>
```

## 自动化调用

`router-analyze.js` 执行完成后，会自动调用 `route-executor.js` 生成标准化的 skill 调用配置。

查看生成的配置:
```bash
cat output/<云效编号>/skill-invoke.json   # JSON 格式配置
cat output/<云效编号>/skill-input.md      # 人类可读摘要
```

在 Codex 中调用:
```
/skill superpowers:systematic-debugging
# 粘贴 skill-input.md 的内容
```

## CLI 速查

```bash
# 完整工作流 (推荐): 拉取 + 分析 + 生成 skill 调用配置
node scripts/yunxiao-client.js summary <serialNumber>
node scripts/router-analyze.js <serialNumber>

# 分步执行
node scripts/yunxiao-client.js summary <serialNumber>  # 步骤1: 拉取上下文 (含 Git 历史)
node scripts/router-analyze.js <serialNumber>          # 步骤2: 分析 + 自动生成 skill 配置
node scripts/route-executor.js <serialNumber>          # 步骤3: 手动生成 skill 配置 (可选)

# Git 历史独立分析
node scripts/git-history-analyzer.js <serialNumber>    # 单独测试 Git 历史检索

# 单点调试用
node scripts/yunxiao-client.js detail    <workitemId> [serialNumber]
node scripts/yunxiao-client.js comments  <workitemId>
node scripts/yunxiao-client.js testcases <workitemId>
node scripts/yunxiao-client.js relations <workitemId>
node scripts/yunxiao-client.js search    <serialNumber>

# 使用已有上下文分析
node scripts/router-analyze.js --context <path/to/context.json>
```

## 失败处理

- `config.json 中未配置真实 token`: 在 `config.json` 中填入 token, 并确保该文件已 gitignore
- `未知工作项前缀`: 提示用户在 `config.json -> spaceMap` 中补充该前缀对应的 spaceId
- 测试用例 / 关联任务接口 403/404: 视为该租户未开通对应接口, 静默跳过, 不中断主流程
- 图片读取失败: 仍然进行文本分析, 并在"上下文完整性"中标注缺失

## 独立性约束 (必须遵守)

- 本 skill 不引用、不读取任何外部 skill 目录下的文件
- 本 skill 不假设任何宿主项目路径, 所有项目路径都来自本目录的 `config.json`
- 整目录 (`SKILL.md` + `config.json` + `scripts/`) 复制到其他工作站后, 填好 `config.json` 即可独立运行
- 如需修改逻辑, 仅编辑本目录内文件, 不影响其他 skill
