#!/usr/bin/env node
/**
 * test-git-history.js - Git 历史集成功能测试脚本
 *
 * 用途：验证 Git 历史分析器与主流程的集成是否正常工作
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SKILL_ROOT = path.resolve(__dirname, '..');

function log(msg) {
  console.log(`[test-git-history] ${msg}`);
}

function fail(msg) {
  console.error(`[test-git-history] ${msg}`);
  process.exit(1);
}

/**
 * 检查配置文件是否存在
 */
function checkConfig() {
  const configPath = path.join(SKILL_ROOT, 'config.json');
  if (!fs.existsSync(configPath)) {
    fail('config.json 不存在，请先创建配置文件');
  }

  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

    // 检查基本配置
    if (!config.projects || !Array.isArray(config.projects) || config.projects.length === 0) {
      fail('config.json 中未配置 projects 数组');
    }

    // 检查是否至少有一个项目配置了 path
    const hasValidProject = config.projects.some(p => p.path);
    if (!hasValidProject) {
      fail('config.json 中所有项目都未配置 path 字段');
    }

    log('✓ 配置文件检查通过');
    return config;
  } catch (e) {
    fail(`config.json 解析失败: ${e.message}`);
  }
}

/**
 * 测试 git-history-analyzer.js 是否存在并可执行
 */
function testGitHistoryAnalyzer() {
  const analyzerPath = path.join(SKILL_ROOT, 'scripts', 'git-history-analyzer.js');
  if (!fs.existsSync(analyzerPath)) {
    fail('git-history-analyzer.js 不存在');
  }

  log('✓ git-history-analyzer.js 存在');

  // 测试执行（使用一个假设的编号）
  try {
    const testSerial = 'TEST-9999';
    const output = execSync(
      `node "${analyzerPath}" "${testSerial}"`,
      {
        cwd: SKILL_ROOT,
        stdio: 'pipe',
        encoding: 'utf-8',
        timeout: 10000,
      }
    );

    const result = JSON.parse(output);
    if (result.serialNumber !== testSerial) {
      fail('git-history-analyzer.js 输出格式异常');
    }

    log(`✓ git-history-analyzer.js 可执行 (搜索了 ${result.totalStats?.projectsSearched || 0} 个项目)`);
  } catch (e) {
    // 如果是因为未找到测试编号，这是正常的
    if (e.message.includes('未找到工作项')) {
      log('✓ git-history-analyzer.js 可执行');
    } else {
      fail(`git-history-analyzer.js 执行失败: ${e.message}`);
    }
  }
}

/**
 * 测试 Git 客户端功能
 */
function testGitClient() {
  const config = checkConfig();
  const { GitClient } = require('./git-history-analyzer.js');

  let validRepos = 0;
  for (const project of config.projects) {
    if (!project.path) continue;
    if (!fs.existsSync(project.path)) {
      log(`⚠ 项目路径不存在: ${project.path}`);
      continue;
    }

    const git = new GitClient(project.path);
    if (git.isValidRepo) {
      validRepos++;
      const branch = git.getCurrentBranch();
      log(`✓ ${project.name}: 有效仓库 (分支: ${branch || 'unknown'})`);
    } else {
      log(`⚠ ${project.name}: 不是有效的 Git 仓库`);
    }
  }

  if (validRepos === 0) {
    fail('没有找到有效的 Git 仓库，请检查项目路径配置');
  }

  log(`✓ 共找到 ${validRepos} 个有效 Git 仓库`);
}

/**
 * 主测试流程
 */
function main() {
  log('开始测试 Git 历史集成功能...\n');

  try {
    // 1. 检查配置
    log('1. 检查配置文件');
    const config = checkConfig();
    log('');

    // 2. 测试 git-history-analyzer.js
    log('2. 测试 git-history-analyzer.js');
    testGitHistoryAnalyzer();
    log('');

    // 3. 测试 Git 客户端
    log('3. 测试 Git 客户端功能');
    testGitClient();
    log('');

    // 4. 总结
    log('=== 测试通过 ===');
    log('');
    log('Git 历史集成功能已就绪！');
    log('');
    log('使用方式:');
    log(`  node scripts/yunxiao-client.js summary <云效编号>`);
    log(`  node scripts/router-analyze.js <云效编号>`);
    log('');
    log('查看结果:');
    log('  cat output/<云效编号>/context.md | grep -A 50 "Git 历史"');
  } catch (e) {
    fail(e.message);
  }
}

main();
