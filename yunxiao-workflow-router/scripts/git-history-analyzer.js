#!/usr/bin/env node
/**
 * git-history-analyzer.js - Git 历史提交分析器
 *
 * 功能：根据云效编号检索相关 Git 提交历史，为后续分析提供上下文
 *
 * 核心能力：
 * 1. 搜索包含指定云效编号的提交
 * 2. 提取文件变更范围
 * 3. 按项目分组展示影响
 * 4. 提供时间线视图
 *
 * 设计原则：
 * - 容错优先：项目路径不存在或非 git 仓库时静默跳过
 * - 性能优先：使用高效的 git log 命令，限制输出范围
 * - 可追溯：记录每条记录的来源和置信度
 *
 * CLI:
 *   node scripts/git-history-analyzer.js <云效编号>
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SKILL_ROOT = path.resolve(__dirname, '..');

/**
 * Git 操作类
 * 封装所有 git 命令调用，提供统一的错误处理
 */
class GitClient {
  constructor(repoPath) {
    this.repoPath = repoPath;
    this.isValidRepo = this._validateRepo();
  }

  /**
   * 验证目录是否为有效的 Git 仓库
   * @returns {boolean} 是否为有效仓库
   * @private
   */
  _validateRepo() {
    try {
      // 检查 .git 目录是否存在
      const gitDir = path.join(this.repoPath, '.git');
      if (!fs.existsSync(gitDir)) {
        return false;
      }

      // 验证 git rev-parse 是否成功
      execSync('git rev-parse --git-dir', {
        cwd: this.repoPath,
        stdio: 'pipe',
      });
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * 执行 git 命令并返回结果
   * @param {string[]} args - git 命令参数
   * @param {Object} options - 执行选项
   * @returns {string} 命令输出
   * @private
   */
  _exec(args, options = {}) {
    if (!this.isValidRepo) {
      throw new Error(`不是有效的 Git 仓库: ${this.repoPath}`);
    }

    const defaultOptions = {
      cwd: this.repoPath,
      stdio: 'pipe',
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024, // 10MB
    };

    try {
      return execSync(`git ${args.join(' ')}`, { ...defaultOptions, ...options });
    } catch (e) {
      // 静默失败，返回空字符串
      return '';
    }
  }

  /**
   * 检查远程仓库 URL（可选用于验证仓库来源）
   * @returns {string|null} 远程仓库 URL
   */
  getRemoteUrl() {
    try {
      const output = this._exec(['remote', '-v']);
      const match = output.match(/origin\s+(.+?)\s+\(fetch\)/);
      return match ? match[1].trim() : null;
    } catch {
      return null;
    }
  }

  /**
   * 获取当前分支名
   * @returns {string|null} 分支名
   */
  getCurrentBranch() {
    try {
      return this._exec(['rev-parse', '--abbrev-ref', 'HEAD']).trim();
    } catch {
      return null;
    }
  }

  /**
   * 搜索包含指定关键词的提交
   * @param {string} keyword - 搜索关键词（如 CMSPAL-1439）
   * @param {Object} options - 搜索选项
   * @param {number} options.maxCount - 最大返回数量，默认 20
   * @param {string[]} options.branches - 限制搜索的分支，默认全部分支
   * @returns {Array<Object>} 提交列表
   */
  searchCommits(keyword, options = {}) {
    if (!this.isValidRepo) {
      return [];
    }

    const { maxCount = 20, branches = ['--all'] } = options;

    try {
      // 构建搜索命令：
      // --grep: 搜索提交信息
      // --format: 自定义输出格式（哈希、作者、日期、提交信息）
      // -n: 显示行号（实际是显示相对时间）
      const args = [
        'log',
        `--max-count=${maxCount}`,
        '--grep=' + keyword,
        '--format=%H|%an|%ae|%ad|%s|%b',
        '--date=iso',
        ...branches,
      ];

      const output = this._exec(args);
      if (!output.trim()) {
        return [];
      }

      return this._parseCommitLog(output);
    } catch (e) {
      console.error(`[git-history-analyzer] 搜索提交失败: ${e.message}`);
      return [];
    }
  }

  /**
   * 解析 git log 输出
   * @param {string} output - git log 原始输出
   * @returns {Array<Object>} 解析后的提交列表
   * @private
   */
  _parseCommitLog(output) {
    const commits = [];
    const lines = output.split('\n').filter(Boolean);

    for (const line of lines) {
      // 格式：哈希|作者|邮箱|日期|标题|正文
      const parts = line.split('|');
      if (parts.length < 5) continue;

      const [hash, author, email, date, subject, body] = parts;

      commits.push({
        hash,
        shortHash: hash.substring(0, 8),
        author,
        email,
        date,
        subject,
        body: body || '',
      });
    }

    return commits;
  }

  /**
   * 获取指定提交的文件变更
   * @param {string} commitHash - 提交哈希
   * @param {Object} options - 选项
   * @param {boolean} options.stats - 是否包含统计信息，默认 true
   * @returns {Object} 文件变更信息 { added, modified, deleted, renamed, files }
   */
  getCommitChanges(commitHash, options = {}) {
    if (!this.isValidRepo) {
      return { files: [], added: 0, modified: 0, deleted: 0, renamed: 0 };
    }

    const { stats = true } = options;

    try {
      // 获取变更文件列表
      const diffArgs = [
        'diff-tree',
        '-r',
        '--no-commit-id',
        '--name-status',
        stats ? '-M' : '', // 检测重命名
        commitHash,
      ].filter(Boolean);

      const output = this._exec(diffArgs);
      if (!output.trim()) {
        return { files: [], added: 0, modified: 0, deleted: 0, renamed: 0 };
      }

      return this._parseDiffOutput(output);
    } catch (e) {
      console.error(`[git-history-analyzer] 获取文件变更失败: ${e.message}`);
      return { files: [], added: 0, modified: 0, deleted: 0, renamed: 0 };
    }
  }

  /**
   * 解析 git diff-tree 输出
   * @param {string} output - git diff-tree 原始输出
   * @returns {Object} 解析后的变更信息
   * @private
   */
  _parseDiffOutput(output) {
    const files = [];
    let added = 0, modified = 0, deleted = 0, renamed = 0;

    const lines = output.split('\n').filter(Boolean);

    for (const line of lines) {
      // 格式：状态码\t文件路径
      const parts = line.split('\t');
      if (parts.length < 2) continue;

      const [status, ...fileParts] = parts;
      const filePath = fileParts.join('\t');

      // 解析状态码（可能包含相似度百分比，如 R100）
      let changeType = status.charAt(0);
      let score = null;

      if (status.length > 1 && !isNaN(parseInt(status.substring(1)))) {
        score = parseInt(status.substring(1));
      }

      // 统计变更类型
      switch (changeType) {
        case 'A':
          added++;
          break;
        case 'M':
          modified++;
          break;
        case 'D':
          deleted++;
          break;
        case 'R':
          renamed++;
          break;
      }

      files.push({
        path: filePath,
        changeType,
        score, // 重命名相似度
        // 可读的变更类型描述
        changeTypeName: this._getChangeTypeName(changeType),
      });
    }

    return { files, added, modified, deleted, renamed };
  }

  /**
   * 获取变更类型的中文名称
   * @param {string} type - 变更类型代码
   * @returns {string} 中文名称
   * @private
   */
  _getChangeTypeName(type) {
    const typeMap = {
      'A': '新增',
      'M': '修改',
      'D': '删除',
      'R': '重命名',
      'C': '复制',
      'T': '类型变更',
    };
    return typeMap[type] || '未知';
  }
}

/**
 * 分析多个项目的 Git 历史
 * @param {string} serialNumber - 云效编号
 * @param {Array<Object>} projects - 项目配置列表
 * @param {Object} options - 分析选项
 * @returns {Object} 分析结果
 */
function analyzeGitHistory(serialNumber, projects, options = {}) {
  const {
    maxCommitsPerProject = 10, // 每个项目最多返回的提交数
    includeFileChanges = true, // 是否包含文件变更详情
  } = options;

  const results = [];
  const totalStats = {
    projectsSearched: 0,
    validReposFound: 0,
    totalCommitsFound: 0,
    totalFilesChanged: 0,
  };

  for (const project of projects) {
    totalStats.projectsSearched++;

    // 跳过未配置路径的项目
    if (!project.path) {
      results.push({
        project: project.name,
        status: 'skipped',
        reason: '未配置项目路径',
      });
      continue;
    }

    // 检查项目路径是否存在
    if (!fs.existsSync(project.path)) {
      results.push({
        project: project.name,
        status: 'skipped',
        reason: '项目路径不存在',
      });
      continue;
    }

    // 创建 Git 客户端并搜索
    const git = new GitClient(project.path);
    if (!git.isValidRepo) {
      results.push({
        project: project.name,
        status: 'skipped',
        reason: '不是有效的 Git 仓库',
      });
      continue;
    }

    totalStats.validReposFound++;

    // 搜索包含云效编号的提交
    const commits = git.searchCommits(serialNumber, {
      maxCount: maxCommitsPerProject,
    });

    if (commits.length === 0) {
      results.push({
        project: project.name,
        status: 'no_commits',
        path: project.path,
        branch: git.getCurrentBranch(),
        remote: git.getRemoteUrl(),
      });
      continue;
    }

    // 获取每个提交的文件变更
    const commitsWithChanges = commits.map(commit => {
      const changes = includeFileChanges
        ? git.getCommitChanges(commit.hash)
        : { files: [], added: 0, modified: 0, deleted: 0, renamed: 0 };

      return {
        ...commit,
        changes,
      };
    });

    // 统计该项目的总变更
    const projectStats = {
      added: 0,
      modified: 0,
      deleted: 0,
      renamed: 0,
      totalFiles: new Set(),
    };

    for (const commit of commitsWithChanges) {
      projectStats.added += commit.changes.added;
      projectStats.modified += commit.changes.modified;
      projectStats.deleted += commit.changes.deleted;
      projectStats.renamed += commit.changes.renamed;
      commit.changes.files.forEach(f => projectStats.totalFiles.add(f.path));
    }

    totalStats.totalCommitsFound += commits.length;
    totalStats.totalFilesChanged += projectStats.totalFiles.size;

    results.push({
      project: project.name,
      status: 'success',
      path: project.path,
      side: project.side,
      branch: git.getCurrentBranch(),
      remote: git.getRemoteUrl(),
      commits: commitsWithChanges,
      stats: {
        commitCount: commits.length,
        added: projectStats.added,
        modified: projectStats.modified,
        deleted: projectStats.deleted,
        renamed: projectStats.renamed,
        uniqueFilesChanged: projectStats.totalFiles.size,
      },
    });
  }

  return {
    serialNumber,
    timestamp: new Date().toISOString(),
    options: {
      maxCommitsPerProject,
      includeFileChanges,
    },
    totalStats,
    results,
  };
}

/**
 * 将 Git 历史分析结果转换为 Markdown 格式
 * @param {Object} analysis - analyzeGitHistory 的返回结果
 * @returns {string} Markdown 文本
 */
function toMarkdown(analysis) {
  const lines = [];

  lines.push('## Git 历史提交记录');
  lines.push('');

  if (analysis.totalStats.validReposFound === 0) {
    lines.push('_未找到有效的 Git 仓库_');
    lines.push('');
    return lines.join('\n');
  }

  if (analysis.totalStats.totalCommitsFound === 0) {
    lines.push(`_已检查 ${analysis.totalStats.validReposFound} 个仓库，但未找到包含此编号的提交_`);
    lines.push('');
    return lines.join('\n');
  }

  // 总体统计
  lines.push('### 总体概况');
  lines.push(`- 搜索项目数: ${analysis.totalStats.projectsSearched}`);
  lines.push(`- 有效仓库数: ${analysis.totalStats.validReposFound}`);
  lines.push(`- 找到提交数: ${analysis.totalStats.totalCommitsFound}`);
  lines.push(`- 涉及文件数: ${analysis.totalStats.totalFilesChanged}`);
  lines.push('');

  // 按项目展示
  for (const result of analysis.results) {
    if (result.status !== 'success') continue;

    lines.push(`### ${result.project} [${result.side || '未知端'}]`);
    lines.push(`- 路径: \`${result.path}\``);
    lines.push(`- 分支: ${result.branch || '未知'}`);
    if (result.remote) {
      lines.push(`- 远程: ${result.remote}`);
    }
    lines.push(`- 提交数: ${result.stats.commitCount}`);
    lines.push(`- 文件变更: ${result.stats.uniqueFilesChanged} 个文件 (${result.stats.modified} 修改, ${result.stats.added} 新增, ${result.stats.deleted} 删除, ${result.stats.renamed} 重命名)`);
    lines.push('');

    // 时间线
    lines.push('#### 提交时间线');
    for (const commit of result.commits) {
      lines.push(`- **${commit.date.substring(0, 10)}** - ${commit.shortHash} - ${commit.subject}`);
      lines.push(`  - 作者: ${commit.author}`);

      // 文件变更摘要
      if (commit.changes.files.length > 0) {
        const fileSummary = commit.changes.files.slice(0, 5).map(f => {
          return `\`${f.path}\` (${f.changeTypeName})`;
        }).join(', ');

        if (commit.changes.files.length > 5) {
          lines.push(`  - 变更: ${fileSummary} ... 还有 ${commit.changes.files.length - 5} 个文件`);
        } else {
          lines.push(`  - 变更: ${fileSummary}`);
        }
      }

      // 提交正文（如果有）
      if (commit.body && commit.body.trim()) {
        const bodyPreview = commit.body.trim().split('\n')[0].substring(0, 100);
        lines.push(`  - 摘要: ${bodyPreview}${commit.body.trim().length > 100 ? '...' : ''}`);
      }

      lines.push('');
    }

    // 变更文件清单（去重）
    const allFiles = new Set();
    for (const commit of result.commits) {
      commit.changes.files.forEach(f => allFiles.add(f.path));
    }

    if (allFiles.size > 0) {
      lines.push('#### 所有变更文件');
      for (const file of Array.from(allFiles).sort()) {
        lines.push(`- \`${file}\``);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

// ---------- CLI ----------

function main() {
  const [, , serialNumber] = process.argv;

  if (!serialNumber) {
    console.error('用法: node scripts/git-history-analyzer.js <云效编号>');
    console.error('示例: node scripts/git-history-analyzer.js CMSPAL-1439');
    process.exit(1);
  }

  // 加载配置
  const configPath = path.join(SKILL_ROOT, 'config.json');
  if (!fs.existsSync(configPath)) {
    console.error('[错误] 未找到 config.json，请在 skill 根目录创建该文件');
    process.exit(1);
  }

  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch (e) {
    console.error(`[错误] config.json 解析失败: ${e.message}`);
    process.exit(1);
  }

  // 获取项目配置
  const projects = Array.isArray(config.projects) ? config.projects : [];
  if (projects.length === 0) {
    console.warn('[警告] config.json 中未配置 projects，将跳过 Git 历史分析');
    console.log(JSON.stringify({ serialNumber, results: [] }, null, 2));
    return;
  }

  // 执行分析
  const analysis = analyzeGitHistory(serialNumber, projects, {
    maxCommitsPerProject: 10,
    includeFileChanges: true,
  });

  // 输出结果
  console.log(JSON.stringify(analysis, null, 2));
}

if (require.main === module) {
  main();
}

// 导出供其他模块使用
module.exports = {
  GitClient,
  analyzeGitHistory,
  toMarkdown,
};
