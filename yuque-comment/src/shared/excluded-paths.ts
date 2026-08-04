/**
 * 自定义排除路径管理。
 *
 * 存储在 chrome.storage.local，content-script 和 background 启动时加载。
 * 默认排除路径（/hangzhewa, /dashboard）始终生效，用户可以追加自定义路径。
 */

/** chrome.storage.local key */
export const EXCLUDED_PATHS_STORAGE_KEY = 'excluded-paths';

/** 默认排除路径（始终生效，用户不可删除） */
export const DEFAULT_EXCLUDED_PATHS: string[] = ['/hangzhewa', '/dashboard'];

/**
 * 将用户输入的路径标准化。
 * - 去除首尾空白
 * - 确保以 / 开头
 * - 去除尾部斜杠（除了根路径 /）
 * - 过滤空值
 */
export function normalizePath(input: string): string {
  let path = input.trim();
  if (!path) return '';
  if (!path.startsWith('/')) path = '/' + path;
  // 去除尾部斜杠（但保留根路径 /）
  if (path.length > 1 && path.endsWith('/')) {
    path = path.slice(0, -1);
  }
  return path;
}

/**
 * 从未知值中标准化排除路径数组。
 * 合并默认路径 + 用户路径，去重。
 */
export function normalizeExcludedPaths(userPaths: unknown): string[] {
  let paths: string[] = [...DEFAULT_EXCLUDED_PATHS];
  if (Array.isArray(userPaths)) {
    const cleaned = userPaths
      .map((p) => normalizePath(typeof p === 'string' ? p : ''))
      .filter(Boolean);
    paths = [...paths, ...cleaned];
  }
  // 去重
  return [...new Set(paths)];
}

/**
 * 获取仅用户自定义的排除路径（不含默认路径）。
 * 用于设置页显示——默认路径单独展示、不可删除。
 */
export function getUserExcludedPaths(allPaths: string[]): string[] {
  return allPaths.filter((p) => !DEFAULT_EXCLUDED_PATHS.includes(p));
}

/**
 * 判断给定 pathname 是否匹配某个排除路径。
 * 规则：pathname === excludedPath 或 pathname 以 excludedPath + '/' 开头。
 */
export function matchesExcludedPath(pathname: string, excludedPaths: string[]): boolean {
  return excludedPaths.some(
    (root) => pathname === root || pathname.startsWith(root + '/'),
  );
}

/**
 * 从 chrome.storage.local 加载排除路径（含默认）。
 */
export async function loadExcludedPaths(): Promise<string[]> {
  try {
    const result = await chrome.storage.local.get(EXCLUDED_PATHS_STORAGE_KEY);
    return normalizeExcludedPaths(result[EXCLUDED_PATHS_STORAGE_KEY]);
  } catch {
    return [...DEFAULT_EXCLUDED_PATHS];
  }
}

/**
 * 保存用户自定义排除路径到 chrome.storage.local。
 * 只保存用户路径，默认路径在 normalizeExcludedPaths 中自动合并。
 */
export async function saveUserExcludedPaths(userPaths: string[]): Promise<void> {
  const cleaned = userPaths
    .map((p) => normalizePath(p))
    .filter((p) => p && !DEFAULT_EXCLUDED_PATHS.includes(p));
  await chrome.storage.local.set({ [EXCLUDED_PATHS_STORAGE_KEY]: [...new Set(cleaned)] });
}
