/**
 * 评论原文定位的纯文本规则。
 *
 * DOM 遍历、Range 创建和滚动由 content script 负责；本模块只处理：
 * 1. 文本归一化；
 * 2. TextQuote/TextPosition 的可持久化数据生成；
 * 3. 多个重复文本候选的上下文和结构指纹排序。
 *
 * 这样定位策略可以在没有真实语雀 DOM 的 Vitest 环境中稳定验证。
 */

import type { QuoteSelector } from './model';

export interface CommentLocationSource {
  selectedText: string;
  anchor: string;
}

export interface CommentLocationCandidate {
  source: 'selectedText' | 'anchor';
  text: string;
}

export interface LocatorBlock {
  index: number;
  text: string;
  fingerprint: string;
}

export interface QuoteSelectorInput {
  exact: string;
  blockText: string;
  containerText?: string;
  blockFingerprint?: string;
  containerFingerprint?: string;
  blockIndex?: number;
  start: number;
  end: number;
}

export interface QuoteMatch {
  blockIndex: number;
  start: number;
  end: number;
  score: number;
}

const CONTEXT_LENGTH = 80;

/**
 * 将不可见字符、不间断空格、换行和连续空白统一成可比较的文本。
 *
 * trim 必须发生在连续空白压缩之前，保证页面开头/结尾的空白不会被
 * 误认为可定位内容；这也是 TextPosition 所依据的稳定坐标系。
 */
export function normalizeLocatorText(value: string): string {
  return value
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[\u00A0\u202F]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * 对归一化文本生成短的结构指纹。
 *
 * 这里使用无外部依赖的 FNV-1a 32 位哈希，避免把 DOM path 或随机 ID
 * 写入评论数据；同一块文本在节点拆分、合并和空白变形后仍得到同一指纹。
 */
export function createTextFingerprint(value: string): string {
  const normalized = normalizeLocatorText(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, '0')}:${normalized.length}`;
}

/**
 * 根据选区在块内的归一化位置生成持久化 QuoteSelector。
 *
 * prefix/suffix 取块内上下文，blockIndex 只作排序提示，真正稳定的身份
 * 是 blockFingerprint；containerFingerprint 则用于区分页面中同名的正文区域。
 */
export function createQuoteSelector(input: QuoteSelectorInput): QuoteSelector {
  const blockText = normalizeLocatorText(input.blockText);
  const exact = normalizeLocatorText(input.exact);
  const start = Math.max(0, Math.min(input.start, blockText.length));
  const end = Math.max(start, Math.min(input.end, blockText.length));
  const blockIndex = input.blockIndex;
  return {
    exact,
    prefix: blockText.slice(Math.max(0, start - CONTEXT_LENGTH), start),
    suffix: blockText.slice(end, end + CONTEXT_LENGTH),
    containerFingerprint: input.containerFingerprint
      ?? createTextFingerprint(input.containerText ?? input.blockText),
    blockFingerprint: input.blockFingerprint ?? createTextFingerprint(input.blockText),
    ...(blockIndex === undefined ? {} : { blockIndex }),
    position: { start, end },
  };
}

function getAllOccurrences(text: string, exact: string): number[] {
  if (!exact) return [];
  const occurrences: number[] = [];
  let fromIndex = 0;
  while (fromIndex <= text.length - exact.length) {
    const index = text.indexOf(exact, fromIndex);
    if (index < 0) break;
    occurrences.push(index);
    fromIndex = index + 1;
  }
  return occurrences;
}

/**
 * 按 TextQuote 规则寻找最佳候选。
 *
 * prefix/suffix 是第一优先级，块指纹和原始块序号用于重复 exact 的消歧；
 * 即使上下文因正文轻微编辑失效，仍会保留 exact + 指纹候选供后续层使用。
 */
export function findQuoteMatch(
  blocks: LocatorBlock[],
  selector: QuoteSelector,
): QuoteMatch | null {
  const exact = normalizeLocatorText(selector.exact);
  if (!exact) return null;
  const prefix = normalizeLocatorText(selector.prefix);
  const suffix = normalizeLocatorText(selector.suffix);
  const candidates: QuoteMatch[] = [];

  for (const block of blocks) {
    const text = normalizeLocatorText(block.text);
    for (const start of getAllOccurrences(text, exact)) {
      const end = start + exact.length;
      const prefixMatched = !prefix || text.slice(0, start).endsWith(prefix);
      const suffixMatched = !suffix || text.slice(end).startsWith(suffix);
      const fingerprintMatched = block.fingerprint === selector.blockFingerprint ||
        createTextFingerprint(block.text) === selector.blockFingerprint;
      const indexMatched = selector.blockIndex === block.index;
      const positionDistance = Math.abs(start - selector.position.start);
      let score = 0;
      if (prefixMatched) score += 8;
      if (suffixMatched) score += 8;
      if (fingerprintMatched) score += 16;
      if (indexMatched) score += 4;
      score -= Math.min(positionDistance, 1000) / 1000;
      candidates.push({ blockIndex: block.index, start, end, score });
    }
  }

  candidates.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    return left.blockIndex - right.blockIndex;
  });
  return candidates[0] ?? null;
}

/**
 * 按 TextPosition 恢复选区。
 *
 * 先使用块指纹寻找目标块，再使用旧 blockIndex 作次级提示；位置对应的
 * exact 必须仍然一致，避免正文发生变化时误选相邻文本。
 */
export function findTextPositionMatch(
  blocks: LocatorBlock[],
  selector: QuoteSelector,
): QuoteMatch | null {
  const candidates = blocks
    .filter((block) => {
      const fingerprintMatched = block.fingerprint === selector.blockFingerprint ||
        createTextFingerprint(block.text) === selector.blockFingerprint;
      return fingerprintMatched || selector.blockIndex === block.index;
    })
    .map((block) => {
      const text = normalizeLocatorText(block.text);
      const start = selector.position.start;
      const end = selector.position.end;
      if (
        start < 0 ||
        end < start ||
        end > text.length ||
        text.slice(start, end) !== normalizeLocatorText(selector.exact)
      ) {
        return null;
      }
      const fingerprintMatched = block.fingerprint === selector.blockFingerprint ||
        createTextFingerprint(block.text) === selector.blockFingerprint;
      return {
        blockIndex: block.index,
        start,
        end,
        score: fingerprintMatched ? 2 : 1,
      };
    })
    .filter((match): match is QuoteMatch => Boolean(match));

  candidates.sort((left, right) => right.score - left.score || left.blockIndex - right.blockIndex);
  return candidates[0] ?? null;
}

export function getCommentLocationCandidates(
  comment: CommentLocationSource,
): CommentLocationCandidate[] {
  const candidates: CommentLocationCandidate[] = [];
  const selectedText = comment.selectedText.trim();
  const anchor = comment.anchor.trim();

  if (selectedText) {
    candidates.push({ source: 'selectedText', text: selectedText });
  }
  if (
    anchor &&
    !candidates.some(
      (candidate) => normalizeLocatorText(candidate.text) === normalizeLocatorText(anchor),
    )
  ) {
    candidates.push({ source: 'anchor', text: anchor });
  }
  return candidates;
}

export function findCommentLocationCandidate(
  pageText: string,
  comment: CommentLocationSource,
): CommentLocationCandidate | null {
  const normalizedPageText = normalizeLocatorText(pageText);
  return getCommentLocationCandidates(comment).find(
    (candidate) => normalizedPageText.includes(normalizeLocatorText(candidate.text)),
  ) ?? null;
}
