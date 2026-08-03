# Git 历史集成说明

## 功能概述

yunxiao-workflow-router 现已集成 Git 历史检索功能。在分析云效工作项之前，会自动搜索相关的 Git 提交记录，为后续分析提供更多上下文。

## 使用方式

### 1. 配置项目路径

在 `config.json` 中正确配置项目路径：

```json
{
  "projects": [
    {
      "name": "前端项目",
      "path": "D:/WorkFile/projects/frontend",
      "side": "frontend",
      "keywords": ["前端", "页面", "组件"]
    }
  ]
}
```

**重要**：`path` 字段必须是有效的 Git 仓库本地路径。

### 2. 执行分析

```bash
# 自动执行：拉取上下文 + Git 历史分析
node scripts/yunxiao-client.js summary CMSPAL-1439
node scripts/router-analyze.js CMSPAL-1439
```

### 3. 查看结果

Git 历史信息会包含在以下位置：

- `output/<云效编号>/context.json` - 结构化数据（`gitHistory` 字段）
- `output/<云效编号>/context.md` - 人类可读摘要（"Git 历史提交记录" 章节）

## 输出示例

### context.json 格式

```json
{
  "serialNumber": "CMSPAL-1439",
  "gitHistory": {
    "serialNumber": "CMSPAL-1439",
    "timestamp": "2026-05-19T03:22:11.113Z",
    "totalStats": {
      "projectsSearched": 2,
      "validReposFound": 2,
      "totalCommitsFound": 5,
      "totalFilesChanged": 12
    },
    "results": [
      {
        "project": "前端项目",
        "status": "success",
        "path": "D:/WorkFile/projects/frontend",
        "side": "frontend",
        "branch": "main",
        "commits": [
          {
            "hash": "abc123...",
            "shortHash": "abc12345",
            "author": "张三",
            "date": "2026-05-15T10:30:00+08:00",
            "subject": "修复 CMSPAL-1439 页面显示问题",
            "changes": {
              "files": [
                {
                  "path": "src/pages/Home.vue",
                  "changeType": "M",
                  "changeTypeName": "修改"
                }
              ],
              "added": 0,
              "modified": 1,
              "deleted": 0
            }
          }
        ],
        "stats": {
          "commitCount": 5,
          "uniqueFilesChanged": 8
        }
      }
    ]
  }
}
```

### context.md 格式

```markdown
## Git 历史提交记录

### 总体概况
- 搜索项目数: 2
- 有效仓库数: 2
- 找到提交数: 5
- 涉及文件数: 12

### 前端项目 [frontend]
- 路径: `D:/WorkFile/projects/frontend`
- 分支: main
- 提交数: 5
- 文件变更: 8 个文件 (5 修改, 2 新增, 1 删除)

#### 最近提交
- **2026-05-15** - abc12345 - 修复 CMSPAL-1439 页面显示问题
  - 变更: `src/pages/Home.vue` (修改), `src/utils/helper.js` (修改)
- **2026-05-14** - def67890 - 添加 CMSPAL-1439 相关注释
  - 变更: `README.md` (修改)

#### 所有变更文件
- `src/pages/Home.vue`
- `src/utils/helper.js`
- `src/components/Header.vue`
- `README.md`
```

## 独立调用

如需单独测试 Git 历史分析：

```bash
node scripts/git-history-analyzer.js CMSPAL-1439
```

## 使用场景

### 1. 重构任务

查看之前的改动范围，确保不会遗漏相关文件：

```bash
# 执行分析
node scripts/yunxiao-client.js summary CMSPAL-2000
node scripts/router-analyze.js CMSPAL-2000

# 查看 Git 历史中的文件变更
cat output/CMSPAL-2000/context.md | grep -A 50 "Git 历史提交记录"
```

### 2. 缺陷修复

了解历史修复尝试，找到根本原因：

- 查看之前的提交信息，了解已经尝试过的修复方案
- 分析相关文件的变更历史，定位可能的问题点
- 避免重复之前失败的修复路径

### 3. 影响分析

基于历史变更预测当前改动的影响范围：

- 如果某个文件之前频繁变更，可能需要特别关注
- 如果某些模块总是一起变更，可能存在隐式依赖
- 跨项目的变更历史可以帮助识别潜在的跨端影响

## 注意事项

1. **路径配置**：确保 `config.json` 中的项目路径正确且是有效的 Git 仓库
2. **提交信息规范**：Git 提交信息中包含云效编号才会被检索到
3. **容错策略**：Git 历史分析失败不会中断主流程，会在日志中记录警告
4. **性能考虑**：每个项目最多搜索 10 条相关提交，避免影响性能

## 扩展配置

可以在 `config.json` 中调整 Git 历史分析的行为（未来功能）：

```json
{
  "gitHistory": {
    "enabled": true,
    "maxCommitsPerProject": 20,
    "searchBranches": ["main", "develop", "master"],
    "includeFileChanges": true
  }
}
```

## 故障排查

### 未找到 Git 仓库

**错误**：`项目路径不存在` 或 `不是有效的 Git 仓库`

**解决**：
1. 检查 `config.json` 中的 `path` 字段是否正确
2. 确认目标目录包含 `.git` 子目录
3. 尝试在该目录执行 `git status` 验证

### 未找到相关提交

**现象**：`validReposFound` > 0 但 `totalCommitsFound` = 0

**可能原因**：
1. Git 提交信息中没有包含该云效编号
2. 提交在未被搜索的分支上
3. 提交已被删除或仓库被重置

**解决**：
1. 检查 Git 提交信息规范，确保包含云效编号
2. 使用 `git log --all --grep=<云效编号>` 手动验证

### 性能问题

**现象**：分析耗时过长

**解决**：
1. 减少 `maxCommitsPerProject` 参数
2. 限制搜索的分支范围
3. 检查是否有大型二进制文件影响 Git 性能
