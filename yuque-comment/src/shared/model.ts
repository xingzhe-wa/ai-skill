/**
 * 私有评论的数据模型与纯函数。
 *
 * 该模块不依赖浏览器 API，便于在 Vitest 中直接验证 key、schema 和 CRUD。
 * 所有从 JSON 进入应用的数据都必须经过本文件的 schema 校验。
 */

import { matchesExcludedPath, DEFAULT_EXCLUDED_PATHS } from './excluded-paths';

export const COMMENT_SCHEMA_VERSION = 1 as const;
export const COMMENT_AUTHOR = '我' as const;

/**
 * 块内的归一化文本位置。
 *
 * start/end 针对 normalizeLocatorText(block.textContent) 的结果，而不是
 * 某一个具体 Text 节点的 offset，因此 DOM 重新拆分行内节点后仍可恢复。
 */
export interface TextPosition {
  start: number;
  end: number;
}

/**
 * TextQuote + TextPosition + 结构指纹组成的新评论定位器。
 *
 * exact/prefix/suffix 用于内容匹配；块和容器指纹用于重复文本消歧；
 * position 是上下文变化时的第二层恢复依据。所有字段均可 JSON 持久化。
 */
export interface QuoteSelector {
  exact: string;
  prefix: string;
  suffix: string;
  containerFingerprint: string;
  blockFingerprint: string;
  blockIndex?: number;
  position: TextPosition;
}

/**
 * 旧版 path + offset 定位数据。
 *
 * 新评论仍可同时保存它作为兼容性兜底；历史评论只有这个字段时，
 * content script 会在新定位方案失败后继续按原路径尝试恢复。
 */
export interface RangeAnchor {
  startPath: number[];
  startOffset: number;
  endPath: number[];
  endOffset: number;
  prefix: string;
  suffix: string;
}

/** 保留旧名称，避免已有调用方和历史数据迁移时发生类型断裂。 */
export type CommentRangeAnchor = RangeAnchor;

export interface PrivateComment {
  id: string;
  documentKey: string;
  selectedText: string;
  anchor: string;
  rangeAnchor?: CommentRangeAnchor;
  quoteSelector?: QuoteSelector;
  body: string;
  author: typeof COMMENT_AUTHOR;
  createdAt: string;
  updatedAt: string;
}

export interface CommentLibrary {
  version: typeof COMMENT_SCHEMA_VERSION;
  comments: PrivateComment[];
}

export interface CommentDraft {
  documentKey: string;
  selectedText: string;
  anchor: string;
  rangeAnchor?: CommentRangeAnchor;
  quoteSelector?: QuoteSelector;
  body: string;
}

export interface CommentPatch {
  selectedText?: string;
  anchor?: string;
  rangeAnchor?: CommentRangeAnchor;
  quoteSelector?: QuoteSelector;
  body?: string;
}

export const HISTORY_SCHEMA_VERSION = 1 as const;

export interface HistoryEntry {
  url: string;
  documentKey: string;
  title: string;
  visitedAt: string;
  visitCount: number;
}

export interface HistoryLibrary {
  version: typeof HISTORY_SCHEMA_VERSION;
  entries: HistoryEntry[];
}

export interface HistoryVisitDraft {
  url: string;
  documentKey: string;
  title: string;
}

export function emptyCommentLibrary(): CommentLibrary {
  return { version: COMMENT_SCHEMA_VERSION, comments: [] };
}

export function emptyHistoryLibrary(): HistoryLibrary {
  return { version: HISTORY_SCHEMA_VERSION, entries: [] };
}

function parseUrl(input: string | URL): URL {
  return input instanceof URL ? new URL(input.href) : new URL(input);
}

function isYuqueHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === 'yuque.com' || host.endsWith('.yuque.com');
}

/**
 * 判断地址是否属于语雀，供后台拒绝伪造消息和内容脚本做注入前置判断。
 * 这里保留 http/https 两种协议，以兼容评论模型原有的 URL 规范化行为；
 * 浏览历史和 MV3 content script 进一步只接受 HTTPS 地址。
 */
export function isYuqueUrl(input: string | URL): boolean {
  try {
    const url = parseUrl(input);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      isYuqueHost(url.hostname)
    );
  } catch {
    return false;
  }
}

/**
 * 规则必须匹配完整根路径，避免把 /hangzhewa-other 或 /dashboarding 误判为排除页。
 * 查询参数和 hash 不影响排除判断，端口和协议仍需符合给定的 HTTPS 地址。
 *
 * @param input URL 字符串或 URL 对象
 * @param excludedPaths 排除路径列表，默认为 ['/hangzhewa', '/dashboard']
 */
export function isExcludedYuqueUrl(
  input: string | URL,
  excludedPaths: string[] = DEFAULT_EXCLUDED_PATHS,
): boolean {
  try {
    const url = parseUrl(input);
    if (
      url.protocol !== 'https:' ||
      url.hostname.toLowerCase() !== 'www.yuque.com' ||
      url.port
    ) {
      return false;
    }
    return matchesExcludedPath(url.pathname, excludedPaths);
  } catch {
    return false;
  }
}

/**
 * 正常文档页是 HTTPS 语雀页面且不属于明确排除的入口页。
 * manifest 的 matches 只是第一层过滤，真正注入和记录前仍调用此纯函数。
 *
 * @param excludedPaths 排除路径列表，默认为 ['/hangzhewa', '/dashboard']
 */
export function isNormalYuqueDocumentUrl(
  input: string | URL,
  excludedPaths: string[] = DEFAULT_EXCLUDED_PATHS,
): boolean {
  try {
    const url = parseUrl(input);
    return (
      url.protocol === 'https:' &&
      isYuqueHost(url.hostname) &&
      !isExcludedYuqueUrl(url, excludedPaths)
    );
  } catch {
    return false;
  }
}

/**
 * 以当前页面 URL 生成稳定的文档 key。
 * hash 通常只代表页面内定位，不应让同一篇文档被拆成多个评论库。
 */
export function getDocumentKey(input: string | URL): string {
  const url = parseUrl(input);
  if (!isYuqueUrl(url)) {
    throw new Error('只支持 yuque.com 页面');
  }
  url.hash = '';
  return url.href;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isDateString(value: unknown): value is string {
  return isNonEmptyString(value) && !Number.isNaN(Date.parse(value));
}

function isCanonicalYuqueDocumentKey(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  try {
    return getDocumentKey(value) === value;
  } catch {
    return false;
  }
}

function isCommentRangeAnchor(value: unknown): value is CommentRangeAnchor {
  if (!isRecord(value)) return false;
  const isPath = (path: unknown): path is number[] => Array.isArray(path) && path.every(
    (index) => Number.isInteger(index) && index >= 0,
  );
  return isPath(value.startPath) && isPath(value.endPath) &&
    typeof value.startOffset === 'number' && Number.isInteger(value.startOffset) && value.startOffset >= 0 &&
    typeof value.endOffset === 'number' && Number.isInteger(value.endOffset) && value.endOffset >= 0 &&
    typeof value.prefix === 'string' && typeof value.suffix === 'string';
}

function isQuoteSelector(value: unknown): value is QuoteSelector {
  if (!isRecord(value)) return false;
  const position = value.position;
  return (
    typeof value.exact === 'string' &&
    typeof value.prefix === 'string' &&
    typeof value.suffix === 'string' &&
    isNonEmptyString(value.containerFingerprint) &&
    isNonEmptyString(value.blockFingerprint) &&
    (value.blockIndex === undefined ||
      (typeof value.blockIndex === 'number' &&
        Number.isInteger(value.blockIndex) &&
        value.blockIndex >= 0)) &&
    isRecord(position) &&
    typeof position.start === 'number' &&
    Number.isInteger(position.start) &&
    position.start >= 0 &&
    typeof position.end === 'number' &&
    Number.isInteger(position.end) &&
    position.end >= position.start
  );
}

export function isPrivateComment(value: unknown): value is PrivateComment {
  if (!isRecord(value)) {
    return false;
  }
  return (
    isNonEmptyString(value.id) &&
    isCanonicalYuqueDocumentKey(value.documentKey) &&
    typeof value.selectedText === 'string' &&
    typeof value.anchor === 'string' &&
    (value.rangeAnchor === undefined || isCommentRangeAnchor(value.rangeAnchor)) &&
    (value.quoteSelector === undefined || isQuoteSelector(value.quoteSelector)) &&
    isNonEmptyString(value.body) &&
    value.author === COMMENT_AUTHOR &&
    isDateString(value.createdAt) &&
    isDateString(value.updatedAt)
  );
}

export function isCommentLibrary(value: unknown): value is CommentLibrary {
  return (
    isRecord(value) &&
    value.version === COMMENT_SCHEMA_VERSION &&
    Array.isArray(value.comments) &&
    value.comments.every(isPrivateComment)
  );
}

function isCanonicalHistoryUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !isNormalYuqueDocumentUrl(value)) {
    return false;
  }
  try {
    return getDocumentKey(value) === value;
  } catch {
    return false;
  }
}

export function isHistoryEntry(value: unknown): value is HistoryEntry {
  if (!isRecord(value)) {
    return false;
  }
  return (
    isCanonicalHistoryUrl(value.url) &&
    isCanonicalHistoryUrl(value.documentKey) &&
    value.url === value.documentKey &&
    typeof value.title === 'string' &&
    isDateString(value.visitedAt) &&
    typeof value.visitCount === 'number' &&
    Number.isInteger(value.visitCount) &&
    value.visitCount >= 1
  );
}

export function isHistoryLibrary(value: unknown): value is HistoryLibrary {
  if (
    !isRecord(value) ||
    value.version !== HISTORY_SCHEMA_VERSION ||
    !Array.isArray(value.entries) ||
    !value.entries.every(isHistoryEntry)
  ) {
    return false;
  }
  const documentKeys = value.entries.map((entry) => entry.documentKey);
  return new Set(documentKeys).size === documentKeys.length;
}

export function parseLibraryJson(json: string): CommentLibrary {
  try {
    const value: unknown = JSON.parse(json);
    if (!isCommentLibrary(value)) {
      throw new Error('schema');
    }
    return value;
  } catch {
    throw new Error('私有评论 JSON schema 校验失败');
  }
}

export function serializeLibrary(library: CommentLibrary): string {
  if (!isCommentLibrary(library)) {
    throw new Error('私有评论 JSON schema 校验失败');
  }
  return `${JSON.stringify(library, null, 2)}\n`;
}

export function parseHistoryJson(json: string): HistoryLibrary {
  try {
    const value: unknown = JSON.parse(json);
    if (!isHistoryLibrary(value)) {
      throw new Error('schema');
    }
    return value;
  } catch {
    throw new Error('语雀浏览历史 JSON schema 校验失败');
  }
}

export function serializeHistory(library: HistoryLibrary): string {
  if (!isHistoryLibrary(library)) {
    throw new Error('语雀浏览历史 JSON schema 校验失败');
  }
  return `${JSON.stringify(library, null, 2)}\n`;
}

/**
 * 记录一次正常页面访问。传入的 documentKey 必须和去掉 hash 后的 URL 完全一致，
 * 这样后台即使收到伪造消息，也不会把非语雀页或排除页写入本地历史。
 */
export function recordHistoryVisit(
  library: HistoryLibrary,
  draft: HistoryVisitDraft,
  now: () => string = () => new Date().toISOString(),
): HistoryLibrary {
  if (!isNormalYuqueDocumentUrl(draft.url)) {
    throw new Error('只记录正常的 HTTPS 语雀文档页面');
  }
  if (typeof draft.title !== 'string') {
    throw new Error('浏览历史标题无效');
  }
  const url = getDocumentKey(draft.url);
  if (draft.documentKey !== url || !isCanonicalHistoryUrl(draft.documentKey)) {
    throw new Error('浏览历史 documentKey 与 URL 不一致');
  }
  const visitedAt = now();
  if (!isDateString(visitedAt)) {
    throw new Error('浏览历史访问时间无效');
  }

  const entries = [...library.entries];
  const index = entries.findIndex((entry) => entry.documentKey === draft.documentKey);
  if (index < 0) {
    entries.push({
      url,
      documentKey: draft.documentKey,
      title: draft.title.trim(),
      visitedAt,
      visitCount: 1,
    });
  } else {
    entries[index] = {
      ...entries[index],
      url,
      title: draft.title.trim(),
      visitedAt,
      visitCount: entries[index].visitCount + 1,
    };
  }
  return { ...library, entries };
}

export function searchHistory(library: HistoryLibrary, query: string): HistoryEntry[] {
  const keyword = query.trim().toLocaleLowerCase('zh-CN');
  return [...library.entries]
    .filter((entry) => {
      if (!keyword) {
        return true;
      }
      return [entry.title, entry.url, entry.documentKey]
        .some((value) => value.toLocaleLowerCase('zh-CN').includes(keyword));
    })
    .sort((left, right) => Date.parse(right.visitedAt) - Date.parse(left.visitedAt));
}

export function clearHistory(_library: HistoryLibrary): HistoryLibrary {
  return emptyHistoryLibrary();
}

export function createComment(
  draft: CommentDraft,
  now: () => string = () => new Date().toISOString(),
  createId: () => string = () => crypto.randomUUID(),
): PrivateComment {
  const body = draft.body.trim();
  if (!body) {
    throw new Error('评论正文不能为空');
  }
  const timestamp = now();
  return {
    id: createId(),
    documentKey: getDocumentKey(draft.documentKey),
    selectedText: draft.selectedText.trim(),
    anchor: draft.anchor.trim(),
    ...(draft.rangeAnchor ? { rangeAnchor: draft.rangeAnchor } : {}),
    ...(draft.quoteSelector ? { quoteSelector: draft.quoteSelector } : {}),
    body,
    author: COMMENT_AUTHOR,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function getCommentsForDocument(
  library: CommentLibrary,
  documentKey: string,
): PrivateComment[] {
  return library.comments.filter((comment) => comment.documentKey === documentKey);
}

export function updateComment(
  library: CommentLibrary,
  commentId: string,
  patch: CommentPatch,
  now: () => string = () => new Date().toISOString(),
): CommentLibrary {
  const index = library.comments.findIndex((comment) => comment.id === commentId);
  if (index < 0) {
    throw new Error('评论不存在');
  }
  const current = library.comments[index];
  const body = patch.body === undefined ? current.body : patch.body.trim();
  if (!body) {
    throw new Error('评论正文不能为空');
  }
  const comments = [...library.comments];
  comments[index] = {
    ...current,
    selectedText:
      patch.selectedText === undefined ? current.selectedText : patch.selectedText.trim(),
    anchor: patch.anchor === undefined ? current.anchor : patch.anchor.trim(),
    rangeAnchor: patch.rangeAnchor === undefined ? current.rangeAnchor : patch.rangeAnchor,
    quoteSelector: patch.quoteSelector === undefined
      ? current.quoteSelector
      : patch.quoteSelector,
    body,
    updatedAt: now(),
  };
  return { ...library, comments };
}

export function deleteComment(library: CommentLibrary, commentId: string): CommentLibrary {
  if (!library.comments.some((comment) => comment.id === commentId)) {
    throw new Error('评论不存在');
  }
  return {
    ...library,
    comments: library.comments.filter((comment) => comment.id !== commentId),
  };
}
