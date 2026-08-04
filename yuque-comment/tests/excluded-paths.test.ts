import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EXCLUDED_PATHS,
  normalizePath,
  normalizeExcludedPaths,
  getUserExcludedPaths,
  matchesExcludedPath,
} from '../src/shared/excluded-paths';
import { isExcludedYuqueUrl, isNormalYuqueDocumentUrl } from '../src/shared/model';

describe('排除路径工具函数', () => {
  it('normalizePath 确保以 / 开头、去除尾部斜杠', () => {
    expect(normalizePath('my-docs')).toBe('/my-docs');
    expect(normalizePath('/my-docs/')).toBe('/my-docs');
    expect(normalizePath('  /my-docs/  ')).toBe('/my-docs');
    expect(normalizePath('/')).toBe('/');
    expect(normalizePath('')).toBe('');
    expect(normalizePath('   ')).toBe('');
  });

  it('DEFAULT_EXCLUDED_PATHS 包含 hangzhewa 和 dashboard', () => {
    expect(DEFAULT_EXCLUDED_PATHS).toContain('/hangzhewa');
    expect(DEFAULT_EXCLUDED_PATHS).toContain('/dashboard');
  });

  it('normalizeExcludedPaths 合并默认 + 用户路径并去重', () => {
    const result = normalizeExcludedPaths(['/custom', '/hangzhewa', '/another/']);
    expect(result).toContain('/hangzhewa');
    expect(result).toContain('/dashboard');
    expect(result).toContain('/custom');
    expect(result).toContain('/another');
    // 去重：hangzhewa 只出现一次
    expect(result.filter((p) => p === '/hangzhewa')).toHaveLength(1);
  });

  it('normalizeExcludedPaths 对非数组返回默认路径', () => {
    expect(normalizeExcludedPaths(null)).toEqual(DEFAULT_EXCLUDED_PATHS);
    expect(normalizeExcludedPaths(undefined)).toEqual(DEFAULT_EXCLUDED_PATHS);
    expect(normalizeExcludedPaths('not-an-array')).toEqual(DEFAULT_EXCLUDED_PATHS);
  });

  it('getUserExcludedPaths 过滤掉默认路径', () => {
    const all = ['/hangzhewa', '/dashboard', '/custom1', '/custom2'];
    const userPaths = getUserExcludedPaths(all);
    expect(userPaths).toEqual(['/custom1', '/custom2']);
  });

  it('matchesExcludedPath 精确匹配和前缀匹配', () => {
    const paths = ['/hangzhewa', '/dashboard'];
    expect(matchesExcludedPath('/hangzhewa', paths)).toBe(true);
    expect(matchesExcludedPath('/hangzhewa/sub', paths)).toBe(true);
    expect(matchesExcludedPath('/hangzhewa/sub/deep', paths)).toBe(true);
    expect(matchesExcludedPath('/dashboard', paths)).toBe(true);
    expect(matchesExcludedPath('/dashboard/settings', paths)).toBe(true);
    // 不匹配相似前缀
    expect(matchesExcludedPath('/hangzhewa-other', paths)).toBe(false);
    expect(matchesExcludedPath('/dashboarding', paths)).toBe(false);
    expect(matchesExcludedPath('/other', paths)).toBe(false);
  });
});

describe('isExcludedYuqueUrl 自定义路径支持', () => {
  it('默认排除路径仍然有效', () => {
    expect(isExcludedYuqueUrl('https://www.yuque.com/hangzhewa')).toBe(true);
    expect(isExcludedYuqueUrl('https://www.yuque.com/dashboard')).toBe(true);
  });

  it('传入自定义路径列表', () => {
    const customPaths = ['/hangzhewa', '/dashboard', '/my-secret'];
    expect(isExcludedYuqueUrl('https://www.yuque.com/my-secret', customPaths)).toBe(true);
    expect(isExcludedYuqueUrl('https://www.yuque.com/my-secret/doc', customPaths)).toBe(true);
    // 不在自定义列表中的路径不受影响
    expect(isExcludedYuqueUrl('https://www.yuque.com/normal/doc', customPaths)).toBe(false);
  });

  it('空列表不排除任何页面', () => {
    expect(isExcludedYuqueUrl('https://www.yuque.com/hangzhewa', [])).toBe(false);
    expect(isExcludedYuqueUrl('https://www.yuque.com/dashboard', [])).toBe(false);
  });
});

describe('isNormalYuqueDocumentUrl 自定义路径支持', () => {
  it('默认排除路径不影响正常文档', () => {
    expect(isNormalYuqueDocumentUrl('https://www.yuque.com/team/book/doc')).toBe(true);
    expect(isNormalYuqueDocumentUrl('https://www.yuque.com/dashboard')).toBe(false);
  });

  it('自定义排除路径生效', () => {
    const customPaths = ['/hangzhewa', '/dashboard', '/private'];
    expect(isNormalYuqueDocumentUrl('https://www.yuque.com/private/doc', customPaths)).toBe(false);
    expect(isNormalYuqueDocumentUrl('https://www.yuque.com/normal/doc', customPaths)).toBe(true);
  });
});
