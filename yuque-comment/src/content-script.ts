/**
 * 语雀文档页私有评论面板。
 *
 * 本脚本只由 manifest 注入 yuque.com 页面。评论正文和选中文本全部使用
 * textContent 写入 Shadow DOM，避免把本地 JSON 中的内容当成 HTML 执行。
 */

import {
  createQuoteSelector,
  createTextFingerprint,
  findCommentLocationCandidate,
  getCommentLocationCandidates,
  normalizeLocatorText,
  findQuoteMatch,
  findTextPositionMatch,
  type LocatorBlock,
} from './shared/comment-locator';
import type {
  CommentDraft,
  CommentRangeAnchor,
  PrivateComment,
  QuoteSelector,
} from './shared/model';

// ── 气泡样式（内联定义，避免与 settings-app 共享 chunk 导致 ES import 问题）──
// chrome.storage.local key 必须与 src/shared/bubble-style.ts 中的 BUBBLE_STYLE_STORAGE_KEY 保持一致
const BUBBLE_STYLE_STORAGE_KEY = 'bubble-style';

interface InlineBubbleStyle {
  background: string;
  textColor: string;
  accentColor: string;
  fontSize: number;
  fontFamily: string;
  borderRadius: number;
  boxShadow: string;
  opacity: number;
}

/** 默认样式：暖阳 */
const DEFAULT_BUBBLE_STYLE: InlineBubbleStyle = {
  background: 'linear-gradient(135deg, #fffbf0, #fff4e6)',
  textColor: '#3d2b0f',
  accentColor: '#d97706',
  fontSize: 14,
  fontFamily: '-apple-system, "Segoe UI", "Microsoft YaHei", sans-serif',
  borderRadius: 14,
  boxShadow: '0 8px 32px rgba(245, 158, 11, 0.18), 0 2px 8px rgba(0,0,0,0.06)',
  opacity: 0.97,
};

function normalizeInlineBubbleStyle(value: unknown): InlineBubbleStyle {
  if (typeof value === 'object' && value !== null) {
    const v = value as Record<string, unknown>;
    if (
      typeof v.background === 'string' &&
      typeof v.textColor === 'string' &&
      typeof v.accentColor === 'string' &&
      typeof v.fontSize === 'number' &&
      typeof v.fontFamily === 'string' &&
      typeof v.borderRadius === 'number' &&
      typeof v.boxShadow === 'string' &&
      typeof v.opacity === 'number'
    ) {
      return {
        background: v.background,
        textColor: v.textColor,
        accentColor: v.accentColor,
        fontSize: v.fontSize,
        fontFamily: v.fontFamily,
        borderRadius: v.borderRadius,
        boxShadow: v.boxShadow,
        opacity: v.opacity,
      };
    }
  }
  return { ...DEFAULT_BUBBLE_STYLE };
}

async function loadInlineBubbleStyle(): Promise<InlineBubbleStyle> {
  try {
    const result = await chrome.storage.local.get(BUBBLE_STYLE_STORAGE_KEY);
    return normalizeInlineBubbleStyle(result[BUBBLE_STYLE_STORAGE_KEY]);
  } catch {
    return { ...DEFAULT_BUBBLE_STYLE };
  }
}

type ContentRequest =
  | { type: 'get-comments'; documentKey: string }
  | { type: 'record-visit'; url: string; documentKey: string; title: string }
  | { type: 'create-comment'; draft: CommentDraft }
  | {
      type: 'update-comment';
      commentId: string;
      patch: Pick<
        CommentDraft,
        'selectedText' | 'anchor' | 'rangeAnchor' | 'quoteSelector' | 'body'
      >;
    }
  | { type: 'delete-comment'; commentId: string }
  | { type: 'open-options' };

type ContentResponse =
  | { ok: true; library: { comments: PrivateComment[] } }
  | { ok: true; comment: PrivateComment }
  | { ok: true; message: string }
  | { ok: false; error: string };

const HOST_ID = 'yuque-private-comments-host';
const PAGE_HIGHLIGHT_STYLE_ID = 'yuque-private-comments-highlight-style';
const PAGE_HIGHLIGHT_CLASS = 'yuque-private-comments-source-highlight';
const TEXT_BLOCK_SELECTOR = 'h1,h2,h3,h4,p,li,blockquote,pre,td,th';
const CONTENT_ROOT_SELECTOR = [
  '[data-testid*="content"]',
  '[data-testid*="editor"]',
  '[class*="lake-content"]',
  '[class*="doc-content"]',
  '[class*="editor-content"]',
  '[class*="reader-content"]',
  '[role="main"]',
  'main',
  'article',
].join(',');

/**
 * content script 必须保持为 manifest 可直接注入的自包含经典脚本。
 * 这里内联与 shared/model 中相同的 URL 规则，避免 Vite 把运行时 helper
 * 拆成需要 import 的额外 chunk；规则本身在 shared/model 中由 Vitest 覆盖。
 */
function getDocumentKey(input: string): string {
  const url = new URL(input);
  const host = url.hostname.toLowerCase();
  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    (host !== 'yuque.com' && !host.endsWith('.yuque.com'))
  ) {
    throw new Error('只支持 yuque.com 页面');
  }
  url.hash = '';
  return url.href;
}

function isExcludedYuqueUrl(input: string): boolean {
  try {
    const url = new URL(input);
    if (
      url.protocol !== 'https:' ||
      url.hostname.toLowerCase() !== 'www.yuque.com' ||
      url.port
    ) {
      return false;
    }
    return activeExcludedPaths.some(
      (root) => url.pathname === root || url.pathname.startsWith(root + '/'),
    );
  } catch {
    return false;
  }
}

function isNormalYuqueDocumentUrl(input: string): boolean {
  try {
    const url = new URL(input);
    const host = url.hostname.toLowerCase();
    return (
      url.protocol === 'https:' &&
      (host === 'yuque.com' || host.endsWith('.yuque.com')) &&
      !isExcludedYuqueUrl(input)
    );
  } catch {
    return false;
  }
}

async function sendRuntimeMessage(request: ContentRequest): Promise<ContentResponse> {
  const response = await chrome.runtime.sendMessage(request);
  return (response as ContentResponse | undefined) ?? {
    ok: false,
    error: '后台服务暂不可用，请刷新扩展后重试',
  };
}

function createElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tagName);
  if (className) {
    element.className = className;
  }
  return element;
}

function getNodePath(node: Node): number[] | null {
  const path: number[] = [];
  let current: Node | null = node;
  while (current && current !== document.body) {
    const parent: Node | null = current.parentNode;
    if (!parent) return null;
    path.unshift(Array.prototype.indexOf.call(parent.childNodes, current));
    current = parent;
  }
  return current === document.body ? path : null;
}

function getElementFromNode(node: Node | null): Element | null {
  return node instanceof Element ? node : node?.parentElement ?? null;
}

function getClosestTextBlock(node: Node | null): HTMLElement | null {
  return getElementFromNode(node)?.closest<HTMLElement>(TEXT_BLOCK_SELECTOR) ?? null;
}

function isExtensionNode(node: Node): boolean {
  const element = getElementFromNode(node);
  return Boolean(element?.closest(`#${HOST_ID}`));
}

function getTextBlocks(root: ParentNode): HTMLElement[] {
  const blocks = Array.from(root.querySelectorAll<HTMLElement>(TEXT_BLOCK_SELECTOR));
  if (root instanceof HTMLElement && root.matches(TEXT_BLOCK_SELECTOR)) {
    blocks.unshift(root);
  }
  return blocks.filter((block) => !isExtensionNode(block));
}

function getLocatorBlocks(root: ParentNode): LocatorBlock[] {
  return getTextBlocks(root).map((block, index) => ({
    index,
    text: block.textContent ?? '',
    fingerprint: createTextFingerprint(block.textContent ?? ''),
  }));
}

function getContentRootForBlock(block: HTMLElement): HTMLElement {
  const knownRoot = block.closest<HTMLElement>(CONTENT_ROOT_SELECTOR);
  return knownRoot && !isExtensionNode(knownRoot) ? knownRoot : document.body;
}

/**
 * 按容器指纹、块指纹和语雀正文常见容器选择器排列候选正文根。
 *
 * 语雀的编辑/阅读 DOM 会随页面版本变化，因此不把某一个 class 当成唯一
 * 入口；当识别不到专用容器时，body 仍可承载后续块级和全局回退逻辑。
 */
function getContentRootCandidates(
  root: Document,
  selector?: QuoteSelector,
): HTMLElement[] {
  const candidates = [
    ...Array.from(root.querySelectorAll<HTMLElement>(CONTENT_ROOT_SELECTOR)),
    root.body,
  ].filter((element): element is HTMLElement => Boolean(element) && !isExtensionNode(element));
  const unique = Array.from(new Set(candidates));
  const ranked = unique.map((element) => {
    const blocks = getLocatorBlocks(element);
    const hasBlockFingerprint = Boolean(
      selector && blocks.some((block) => block.fingerprint === selector.blockFingerprint),
    );
    const containerMatched = Boolean(
      selector &&
      createTextFingerprint(element.textContent ?? '') === selector.containerFingerprint,
    );
    let score = 0;
    if (containerMatched) score += 100;
    if (hasBlockFingerprint) score += 40;
    if (element !== root.body) score += 10;
    score -= Math.min(Math.abs((element.textContent ?? '').length), 100000) / 100000;
    return { element, score };
  });
  ranked.sort((left, right) => right.score - left.score);
  return ranked.map((item) => item.element);
}

interface NormalizedTextBoundary {
  node: Text;
  offset: number;
}

interface NormalizedTextMapItem {
  char: string;
  start: NormalizedTextBoundary;
  end: NormalizedTextBoundary;
}

function collectSearchableTextNodes(root: Node): Text[] {
  const textNodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const textNode = node as Text;
      const parent = textNode.parentElement;
      if (
        !textNode.data ||
        !parent ||
        parent.closest(`#${HOST_ID}, script, style, noscript, textarea, input, select, option`)
      ) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let current = walker.nextNode();
  while (current) {
    textNodes.push(current as Text);
    current = walker.nextNode();
  }
  return textNodes;
}

/**
 * 把归一化后的每一个字符映射回原始 Text 节点边界。
 *
 * 空白会合并成一个字符，但映射保存的是原始空白的起点和下一个有效
 * 字符的起点；因此 Range 最终始终使用真实节点 offset，不会把归一化
 * 字符串索引直接传给 DOM。
 */
function createNormalizedTextMap(textNodes: Text[]): NormalizedTextMapItem[] {
  const mapped: NormalizedTextMapItem[] = [];
  let pendingSpace: NormalizedTextBoundary | null = null;

  // 跟踪上一个文本节点所属的块级元素，在不同段落/标题/列表项之间
  // 插入合成空格，使跨段落的 selectedText（含 \n）归一化后仍能匹配。
  // 例如 <p>解析</p><p>这是一道</p> 的选中文本是 "解析\n这是一道"，
  // 归一化后为 "解析 这是一道"（带空格）；DOM 文本拼接为 "解析这是一道"（无空格），
  // 没有这个合成空格就会导致跨段落评论永远搜不到。
  let prevBlock: Element | null = null;

  for (const node of textNodes) {
    const currentBlock = node.parentElement?.closest(TEXT_BLOCK_SELECTOR) ?? null;
    if (
      prevBlock !== null &&
      currentBlock !== null &&
      prevBlock !== currentBlock &&
      mapped.length > 0
    ) {
      mapped.push({
        char: ' ',
        start: { node, offset: 0 },
        end: { node, offset: 0 },
      });
      pendingSpace = null;
    }
    if (currentBlock) prevBlock = currentBlock;

    for (let offset = 0; offset < node.data.length; offset += 1) {
      const raw = node.data[offset];
      if (/[\s\u00A0\u202F]/.test(raw)) {
        if (mapped.length > 0 && !pendingSpace) {
          pendingSpace = { node, offset };
        }
        continue;
      }
      if (/[\u200B-\u200D\uFEFF]/.test(raw)) {
        continue;
      }
      if (pendingSpace) {
        mapped.push({
          char: ' ',
          start: pendingSpace,
          end: { node, offset },
        });
        pendingSpace = null;
      }
      mapped.push({
        char: raw,
        start: { node, offset },
        end: { node, offset: offset + 1 },
      });
    }
  }
  return mapped;
}

function createRangeFromTextMap(
  map: NormalizedTextMapItem[],
  start: number,
  end: number,
): Range | null {
  if (start < 0 || end <= start || end > map.length) {
    return null;
  }
  const first = map[start];
  const last = map[end - 1];
  if (!first || !last) {
    return null;
  }
  const range = document.createRange();
  try {
    range.setStart(first.start.node, first.start.offset);
    range.setEnd(last.end.node, last.end.offset);
    return range;
  } catch {
    return null;
  }
}

function createNormalizedTextRange(root: Node, start: number, end: number): Range | null {
  return createRangeFromTextMap(
    createNormalizedTextMap(collectSearchableTextNodes(root)),
    start,
    end,
  );
}

function getNormalizedBoundaryOffset(
  root: HTMLElement,
  container: Node,
  offset: number,
): number | null {
  const range = document.createRange();
  try {
    range.selectNodeContents(root);
    range.setEnd(container, offset);
    return normalizeLocatorText(range.toString()).length;
  } catch {
    return null;
  }
}

function getSelectionPositionInBlock(
  range: Range,
  block: HTMLElement,
): { start: number; end: number } | null {
  if (!block.contains(range.startContainer) || !block.contains(range.endContainer)) {
    return null;
  }
  const start = getNormalizedBoundaryOffset(block, range.startContainer, range.startOffset);
  const end = getNormalizedBoundaryOffset(block, range.endContainer, range.endOffset);
  if (start === null || end === null || end <= start) {
    return null;
  }
  const exact = normalizeLocatorText(range.toString());
  const normalizedBlockText = normalizeLocatorText(block.textContent ?? '');
  const adjustedStart = normalizedBlockText.slice(start, end) === exact
    ? start
    : normalizedBlockText.indexOf(exact);
  if (adjustedStart < 0) {
    return null;
  }
  return { start: adjustedStart, end: adjustedStart + exact.length };
}

function createQuoteSelectorFromRange(range: Range): QuoteSelector | undefined {
  const startBlock = getClosestTextBlock(range.startContainer);
  const endBlock = getClosestTextBlock(range.endContainer);
  const exact = normalizeLocatorText(range.toString());
  if (!startBlock || startBlock !== endBlock || !exact) {
    return undefined;
  }
  const contentRoot = getContentRootForBlock(startBlock);
  const blocks = getLocatorBlocks(contentRoot);
  const blockIndex = blocks.findIndex((block) => {
    const element = getTextBlocks(contentRoot)[block.index];
    return element === startBlock;
  });
  const position = getSelectionPositionInBlock(range, startBlock);
  if (position === null || blockIndex < 0) {
    return undefined;
  }
  return createQuoteSelector({
    exact,
    blockText: startBlock.textContent ?? '',
    containerText: contentRoot.textContent ?? '',
    blockFingerprint: createTextFingerprint(startBlock.textContent ?? ''),
    blockIndex,
    start: position.start,
    end: position.end,
  });
}

function createRangeAnchor(
  range: Range,
  quoteSelector?: QuoteSelector,
): CommentRangeAnchor | undefined {
  const startPath = getNodePath(range.startContainer);
  const endPath = getNodePath(range.endContainer);
  if (startPath === null || endPath === null) return undefined;
  const fullText = normalizeLocatorText(document.body.textContent ?? '');
  const selected = normalizeLocatorText(range.toString());
  const selectedIndex = selected ? fullText.indexOf(selected) : -1;
  return {
    startPath,
    startOffset: range.startOffset,
    endPath,
    endOffset: range.endOffset,
    prefix: quoteSelector?.prefix ??
      (selectedIndex > 0 ? fullText.slice(Math.max(0, selectedIndex - 80), selectedIndex) : ''),
    suffix: quoteSelector?.suffix ??
      (selectedIndex >= 0
        ? fullText.slice(selectedIndex + selected.length, selectedIndex + selected.length + 80)
        : ''),
  };
}

function resolveNodePath(path: number[]): Node | null {
  let current: Node = document.body;
  for (const index of path) {
    const next = current.childNodes[index];
    if (!next) return null;
    current = next;
  }
  return current;
}

function restoreRangeAnchor(anchor: CommentRangeAnchor | undefined): Range | null {
  if (!anchor) return null;
  const start = resolveNodePath(anchor.startPath);
  const end = resolveNodePath(anchor.endPath);
  const getBoundaryLength = (node: Node): number =>
    node.nodeType === Node.TEXT_NODE ? node.textContent?.length ?? 0 : node.childNodes.length;
  if (
    !start ||
    !end ||
    anchor.startOffset < 0 ||
    anchor.endOffset < 0 ||
    anchor.startOffset > getBoundaryLength(start) ||
    anchor.endOffset > getBoundaryLength(end)
  ) {
    return null;
  }
  const range = document.createRange();
  try {
    range.setStart(start, anchor.startOffset);
    range.setEnd(end, anchor.endOffset);
    return range;
  } catch {
    return null;
  }
}

function getSelectedContext(): Pick<
  CommentDraft,
  'selectedText' | 'anchor' | 'rangeAnchor' | 'quoteSelector'
> {
  const selection = window.getSelection();
  const selectedText = selection?.toString().trim() ?? '';
  const node = selection?.anchorNode;
  const element = node instanceof Element ? node : node?.parentElement;
  const anchorElement = element?.closest(TEXT_BLOCK_SELECTOR);
  const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
  const quoteSelector = range ? createQuoteSelectorFromRange(range) : undefined;
  const anchorText = anchorElement?.textContent?.trim().replace(/\s+/g, ' ').slice(0, 160) ?? '';
  return {
    selectedText,
    anchor: anchorText || (selectedText ? `选中文本：${selectedText.slice(0, 120)}` : '当前文档'),
    rangeAnchor: range ? createRangeAnchor(range, quoteSelector) : undefined,
    quoteSelector,
  };
}

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' });
}

function setText(element: HTMLElement, value: string): void {
  element.textContent = value;
}

function createActionButton(
  label: string,
  className: string,
  onClick: () => void,
): HTMLButtonElement {
  const button = createElement('button', className);
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

function createExactTextRange(textNodes: Text[], searchText: string): Range | null {
  const normalizedSearch = normalizeLocatorText(searchText);
  if (!normalizedSearch) return null;
  const map = createNormalizedTextMap(textNodes);
  const normalizedCombined = map.map((item) => item.char).join('');
  const startIndex = normalizedCombined.indexOf(normalizedSearch);
  return startIndex < 0
    ? null
    : createRangeFromTextMap(map, startIndex, startIndex + normalizedSearch.length);
}

/**
 * TextQuote 层：在当前正文容器中按 exact、prefix、suffix 和结构指纹定位。
 *
 * 真实 Range 的创建仍交给归一化文本映射，纯函数只负责选择块和 start/end。
 */
function findQuoteRange(
  root: Document,
  selector: QuoteSelector | undefined,
): Range | null {
  if (!selector?.exact) {
    return null;
  }
  for (const contentRoot of getContentRootCandidates(root, selector)) {
    const blockElements = getTextBlocks(contentRoot);
    const blocks = getLocatorBlocks(contentRoot);
    const match = findQuoteMatch(blocks, selector);
    const block = match ? blockElements[match.blockIndex] : undefined;
    if (!match || !block) {
      continue;
    }
    const range = createNormalizedTextRange(block, match.start, match.end);
    if (range) return range;
  }
  return null;
}

/**
 * TextPosition 层：使用块指纹和块内归一化 start/end 恢复。
 *
 * 该层故意不依赖 prefix/suffix，允许正文上下文有小幅改写但目标块
 * 的文本结构仍保持不变。
 */
function findTextPositionRange(
  root: Document,
  selector: QuoteSelector | undefined,
): Range | null {
  if (!selector?.exact) {
    return null;
  }
  for (const contentRoot of getContentRootCandidates(root, selector)) {
    const blockElements = getTextBlocks(contentRoot);
    const blocks = getLocatorBlocks(contentRoot);
    const match = findTextPositionMatch(blocks, selector);
    const block = match ? blockElements[match.blockIndex] : undefined;
    if (!match || !block) {
      continue;
    }
    const range = createNormalizedTextRange(block, match.start, match.end);
    if (range) return range;
  }
  return null;
}

/**
 * 全局 selectedText 层：仅作为新定位失败后的降级方式。
 *
 * 不调用 window.find，避免浏览器私有查找状态和跨节点边界导致结果不可控；
 * 归一化映射可直接处理多个 inline Text 节点。
 */
function findCommentTextRange(
  root: Document,
  comment: Pick<PrivateComment, 'selectedText'>,
): Range | null {
  const selectedText = comment.selectedText.trim();
  if (!selectedText) {
    return null;
  }
  const candidate = { selectedText, anchor: '' };
  for (const block of getTextBlocks(root.body)) {
    if (!findCommentLocationCandidate(block.textContent ?? '', candidate)) {
      continue;
    }
    const exactRange = createExactTextRange(
      collectSearchableTextNodes(block),
      selectedText,
    );
    if (exactRange) {
      return exactRange;
    }
  }
  return createExactTextRange(collectSearchableTextNodes(root.body), selectedText);
}

/**
 * 锚点/块级层：先按新 selector 的块指纹找块，再按旧 anchor 或 selectedText
 * 找包含文本的段落，保证没有 selector 的历史评论仍可使用。
 */
function findCommentBlock(
  root: Document,
  comment: Pick<PrivateComment, 'selectedText' | 'anchor' | 'quoteSelector'>,
): HTMLElement | null {
  const contentRoots = getContentRootCandidates(root, comment.quoteSelector);
  if (comment.quoteSelector) {
    for (const contentRoot of contentRoots) {
      const block = getTextBlocks(contentRoot).find(
        (element) => createTextFingerprint(element.textContent ?? '') ===
          comment.quoteSelector?.blockFingerprint,
      );
      if (block) return block;
    }
  }
  const blocks = getTextBlocks(root.body);
  if (comment.anchor.trim()) {
    const match = blocks.find((block) => Boolean(findCommentLocationCandidate(
      block.textContent ?? '',
      { selectedText: '', anchor: comment.anchor },
    )));
    if (match) return match;
  }
  if (comment.selectedText.trim()) {
    const match = blocks.find((block) => Boolean(findCommentLocationCandidate(
      block.textContent ?? '',
      { selectedText: comment.selectedText, anchor: '' },
    )));
    if (match) return match;
  }
  return null;
}

function ensurePageHighlightStyle(): void {
  if (document.getElementById(PAGE_HIGHLIGHT_STYLE_ID)) {
    return;
  }
  const style = createElement('style');
  style.id = PAGE_HIGHLIGHT_STYLE_ID;
  style.textContent = `
    .${PAGE_HIGHLIGHT_CLASS} {
      outline: 3px solid rgba(12, 119, 119, 0.48) !important;
      outline-offset: 4px !important;
      background-color: rgba(78, 188, 163, 0.18) !important;
      transition: outline-color 180ms ease, background-color 180ms ease !important;
    }
  `;
  document.documentElement.append(style);
}

/** 上一次高亮的目标元素，关闭气泡时清除 */
let lastHighlightedTarget: Element | null = null;

/** 当前气泡样式配置（从 chrome.storage.local 加载） */
let activeBubbleStyle: InlineBubbleStyle = { ...DEFAULT_BUBBLE_STYLE };

/** 默认排除路径（始终生效） */
const DEFAULT_EXCLUDED_PATHS = ['/hangzhewa', '/dashboard'];

/** 当前排除路径列表（默认 + 用户自定义） */
let activeExcludedPaths: string[] = [...DEFAULT_EXCLUDED_PATHS];

function highlightTextRange(range: Range): void {
  ensurePageHighlightStyle();
  // 清除上一次的高亮
  lastHighlightedTarget?.classList.remove(PAGE_HIGHLIGHT_CLASS);

  const target = range.commonAncestorContainer instanceof Element
    ? range.commonAncestorContainer
    : range.commonAncestorContainer.parentElement;
  target?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
  target?.classList.add(PAGE_HIGHLIGHT_CLASS);
  lastHighlightedTarget = target;

  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range.cloneRange());
}

function clearHighlight(): void {
  lastHighlightedTarget?.classList.remove(PAGE_HIGHLIGHT_CLASS);
  lastHighlightedTarget = null;
  const selection = window.getSelection();
  selection?.removeAllRanges();
}

/** 内联评论气泡的容器 ID */
const INLINE_BUBBLE_ID = 'yuque-private-comment-inline-bubble';

/**
 * 在选中的原文旁弹出一个半透明悬浮评论气泡。
 *
 * 气泡是独立 DOM 元素（不在 Shadow DOM 内），定位到 range 的 boundingRect 右侧，
 * 用 position:fixed + transform 定位，不干扰页面布局。
 */
function showInlineCommentBubble(comment: PrivateComment, range: Range): void {
  // 移除已有气泡
  document.getElementById(INLINE_BUBBLE_ID)?.remove();

  const bubble = document.createElement('div');
  bubble.id = INLINE_BUBBLE_ID;

  // 构建气泡内容
  const header = document.createElement('div');
  header.className = 'ipb-header';
  const author = document.createElement('span');
  author.className = 'ipb-author';
  author.textContent = comment.author;
  const time = document.createElement('span');
  time.className = 'ipb-time';
  time.textContent = formatTime(comment.createdAt);
  header.append(author, time);

  const body = document.createElement('div');
  body.className = 'ipb-body';
  body.textContent = comment.body;

  const closeBtn = document.createElement('button');
  closeBtn.className = 'ipb-close';
  closeBtn.type = 'button';
  closeBtn.textContent = '×';
  closeBtn.setAttribute('aria-label', '关闭');

  bubble.append(header, body, closeBtn);

  // 注入样式（只注入一次）
  ensureInlineBubbleStyle();

  // 定位气泡到选区右侧
  const rect = range.getBoundingClientRect();
  const bubbleWidth = 280;
  const gap = 16;

  // 优先放在选区右侧；如果右侧空间不足，放在左侧
  let left = rect.right + gap;
  if (left + bubbleWidth > window.innerWidth - 8) {
    left = rect.left - bubbleWidth - gap;
  }
  // 如果左侧也不够，就放在选区下方
  if (left < 8) {
    left = Math.max(8, Math.min(window.innerWidth - bubbleWidth - 8, rect.left));
  }

  const top = Math.max(8, Math.min(window.innerHeight - 200, rect.top));

  bubble.style.left = `${left}px`;
  bubble.style.top = `${top}px`;

  document.body.append(bubble);

  // 入场动画
  bubble.classList.add('ipb-visible');

  // 关闭按钮
  closeBtn.addEventListener('click', () => {
    bubble.classList.remove('ipb-visible');
    window.setTimeout(() => bubble.remove(), 200);
    clearHighlight();
  });

  // 点击气泡外部关闭
  const outsideClickHandler = (e: MouseEvent): void => {
    if (bubble.contains(e.target as Node)) return;
    bubble.classList.remove('ipb-visible');
    window.setTimeout(() => bubble.remove(), 200);
    clearHighlight();
    document.removeEventListener('pointerdown', outsideClickHandler);
  };
  // 延迟绑定，避免当前点击事件立即关闭
  window.setTimeout(() => {
    document.addEventListener('pointerdown', outsideClickHandler);
  }, 100);
}

function ensureInlineBubbleStyle(): void {
  const s = activeBubbleStyle;
  // 移除旧样式，每次都重新生成（支持实时切换主题）
  document.getElementById(`${INLINE_BUBBLE_ID}-style`)?.remove();
  const style = document.createElement('style');
  style.id = `${INLINE_BUBBLE_ID}-style`;
  const bg = s.background;
  const isDark = s.textColor.toLowerCase() === '#e2e8f0' || s.background.includes('1e293b');
  const closeColor = isDark ? 'rgba(255,255,255,0.4)' : '#9aacad';
  const closeHoverBg = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)';
  const closeHoverColor = isDark ? 'rgba(255,255,255,0.8)' : '#555';
  const timeColor = isDark ? 'rgba(255,255,255,0.35)' : '#9aacad';
  style.textContent = `
    #${INLINE_BUBBLE_ID} {
      position: fixed;
      z-index: 2147482999;
      width: 300px;
      padding: 0;
      border: 1px solid ${s.accentColor}33;
      border-radius: ${s.borderRadius}px;
      background: ${bg};
      opacity: ${s.opacity};
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      box-shadow: ${s.boxShadow};
      font-family: ${s.fontFamily};
      transform: scale(0.92) translateY(8px);
      transition: opacity 0.2s ease, transform 0.2s cubic-bezier(0.2, 0.8, 0.3, 1);
    }
    #${INLINE_BUBBLE_ID}.ipb-visible {
      opacity: ${s.opacity};
      transform: scale(1) translateY(0);
    }
    #${INLINE_BUBBLE_ID} .ipb-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 12px 6px;
    }
    #${INLINE_BUBBLE_ID} .ipb-author {
      color: ${s.accentColor};
      font-size: 12px;
      font-weight: 700;
    }
    #${INLINE_BUBBLE_ID} .ipb-time {
      color: ${timeColor};
      font-size: 10px;
    }
    #${INLINE_BUBBLE_ID} .ipb-body {
      padding: 0 12px 12px;
      color: ${s.textColor};
      font-size: ${s.fontSize}px;
      line-height: 1.65;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    #${INLINE_BUBBLE_ID} .ipb-close {
      position: absolute;
      top: 6px;
      right: 6px;
      width: 20px;
      height: 20px;
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: transparent;
      color: ${closeColor};
      font-size: 16px;
      line-height: 20px;
      text-align: center;
      cursor: pointer;
      transition: background 0.15s ease, color 0.15s ease;
    }
    #${INLINE_BUBBLE_ID} .ipb-close:hover {
      background: ${closeHoverBg};
      color: ${closeHoverColor};
    }
  `;
  document.documentElement.append(style);
}

function mountPanel(): void {
  document.getElementById(HOST_ID)?.remove();

  // 悬浮球图标：优先从扩展资源加载，失败时使用 base64 内联
  const FLOAT_BALL_ICON = chrome.runtime.getURL('icons/float-ball.png');

  const host = createElement('aside');
  host.id = HOST_ID;
  const shadow = host.attachShadow({ mode: 'open' });
  const style = createElement('style');
  style.textContent = `
    :host {
      all: initial;
      color: #21343d;
      font-family: Inter, "Segoe UI", "Microsoft YaHei", sans-serif;
      font-size: 13px;
    }
    * { box-sizing: border-box; }
    /* ── 悬浮球（独立元素，与面板分离）── */
    .float-ball {
      position: fixed;
      z-index: 2147483001;
      bottom: 24px;
      right: 24px;
      width: 48px;
      height: 48px;
      padding: 0;
      border: 2px solid #fff;
      border-radius: 999px;
      background: #0c7777 url('${FLOAT_BALL_ICON}') center / 60% no-repeat;
      box-shadow: 0 6px 20px rgba(12, 119, 119, 0.35), 0 0 0 4px rgba(12, 119, 119, 0.12);
      cursor: grab;
      opacity: 1;
      transform: scale(1);
      transition: opacity 0.2s ease, transform 0.2s ease;
      will-change: transform, opacity;
    }
    .float-ball:active { cursor: grabbing; }
    .float-ball.dragging { transition: none; }
    .float-ball.hidden {
      opacity: 0;
      transform: scale(0.5);
      pointer-events: none;
    }
    /* 悬浮球红点角标 */
    .float-ball .badge {
      position: absolute;
      top: -4px;
      right: -4px;
      min-width: 18px;
      height: 18px;
      padding: 0 4px;
      border: 2px solid #fff;
      border-radius: 999px;
      background: #e74c3c;
      color: #fff;
      font-size: 10px;
      font-weight: 800;
      line-height: 14px;
      text-align: center;
    }
    .float-ball .badge:empty { display: none; }

    /* ── 面板（独立元素，不 morph）── */
    .panel {
      position: fixed;
      z-index: 2147483000;
      bottom: 80px;
      right: 24px;
      display: flex;
      width: min(340px, calc(100vw - 32px));
      max-height: calc(100vh - 110px);
      flex-direction: column;
      overflow: hidden;
      border: 1px solid #d5e0e2;
      border-radius: 12px;
      background: #f7faf9;
      box-shadow: 0 16px 48px rgba(28, 58, 64, 0.22);
      /* 只用 opacity + transform 做过渡，GPU 合成层零布局 */
      opacity: 1;
      transform: scale(1) translateY(0);
      transition: opacity 0.22s ease, transform 0.22s cubic-bezier(0.2, 0.8, 0.3, 1);
      will-change: transform, opacity;
      contain: layout style paint;
    }
    .panel.dragging {
      cursor: grabbing;
      user-select: none;
      transition: none;
    }
    .panel.hidden {
      opacity: 0;
      transform: scale(0.92) translateY(12px);
      pointer-events: none;
    }
    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 13px 14px;
      border-bottom: 1px solid #dbe5e5;
      background: #fff;
    }
    .title-wrap { display: flex; align-items: baseline; gap: 8px; }
    .title { color: #15333c; font-size: 14px; font-weight: 800; }
    .count { color: #789096; font-size: 11px; }
    .icon-button {
      width: 28px;
      height: 28px;
      padding: 0;
      border: 1px solid #d4e0e1;
      border-radius: 5px;
      color: #47636b;
      background: #fff;
      cursor: pointer;
      font: inherit;
      font-size: 15px;
      line-height: 1;
      transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
    }
    .icon-button:hover {
      background: #eef4f4;
      border-color: #b0c9c6;
      color: #0c7777;
    }
    .icon-button:active {
      background: #e0eaea;
    }
    .content {
      display: flex;
      min-height: 0;
      flex: 1;
      flex-direction: column;
      overflow: auto;
    }
    .connection-banner {
      display: flex;
      align-items: flex-start;
      gap: 9px;
      margin: 11px 12px 0;
      padding: 10px;
      border: 1px solid #ead9b9;
      border-radius: 6px;
      color: #785a2d;
      background: #fff9eb;
      font-size: 12px;
      line-height: 1.5;
    }
    .connection-banner[hidden] { display: none; }
    .connection-banner button {
      flex: 0 0 auto;
      padding: 0;
      border: 0;
      color: #996b22;
      background: transparent;
      cursor: pointer;
      font: inherit;
      font-weight: 700;
    }
    .toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px;
    }
    .toolbar-note { color: #789096; font-size: 11px; }
    .primary-button {
      min-height: 30px;
      padding: 0 10px;
      border: 0;
      border-radius: 5px;
      color: #fff;
      background: #0c7777;
      cursor: pointer;
      font: inherit;
      font-size: 12px;
      font-weight: 700;
    }
    .primary-button:disabled { cursor: wait; opacity: .5; }
    .comment-list { display: grid; gap: 8px; padding: 0 12px 14px; }
    .empty {
      padding: 20px 12px 25px;
      color: #819195;
      text-align: center;
      line-height: 1.6;
    }
    .comment-card {
      padding: 0;
      border: 1px solid #e0e8e7;
      border-radius: 10px;
      background: #fff;
      overflow: hidden;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    .comment-card:hover {
      border-color: #b8d0cd;
      box-shadow: 0 2px 8px rgba(12, 119, 119, 0.08);
    }
    /* 卡片摘要（折叠态：作者 + 评论预览） */
    .card-summary {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 10px 12px;
    }
    .card-summary-text {
      flex: 1;
      min-width: 0;
      cursor: pointer;
    }
    .card-summary-text:active {
      opacity: 0.7;
    }
    .card-summary-text .body-preview {
      color: #3a5056;
      font-size: 13px;
      line-height: 1.5;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }
    /* 展开时隐藏摘要预览，避免重复 */
    .comment-card.expanded .body-preview { display: none; }
    .card-chevron {
      flex: 0 0 auto;
      width: 20px;
      height: 20px;
      border: 0;
      background: transparent;
      color: #8a9a9e;
      cursor: pointer;
      font-size: 12px;
      line-height: 20px;
      text-align: center;
      transition: transform 0.18s ease;
    }
    .comment-card.expanded .card-chevron { transform: rotate(180deg); }
    /* 卡片详情（默认隐藏） */
    .card-details {
      max-height: 0;
      overflow: hidden;
      transition: max-height 0.2s ease;
    }
    .comment-card.expanded .card-details {
      max-height: 500px;
    }
    .card-details-inner {
      padding: 0 12px 10px;
      border-top: 1px solid #eef4f3;
    }
    .comment-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      color: #829296;
      font-size: 11px;
    }
    .author { color: #0c7777; font-weight: 800; }
    /* 关联原文：弱化配角，左侧竖线引用样式 */
    .selected {
      margin: 0 0 8px;
      padding: 6px 10px;
      border-left: 3px solid #c4d8d5;
      background: #f4f8f7;
      border-radius: 0 4px 4px 0;
      color: #7a8b8e;
      font-size: 12px;
      line-height: 1.5;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .selected-label {
      color: #9aacad;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    /* 评论正文：主角，突出显示 */
    .body {
      padding: 8px 10px;
      border-radius: 6px;
      background: #f0f7f5;
      border: 1px solid #d5e8e4;
      color: #1a3540;
      font-size: 13.5px;
      font-weight: 500;
      line-height: 1.65;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .anchor {
      margin-top: 7px;
      color: #8a9a9e;
      font-size: 11px;
      line-height: 1.4;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .card-actions { display: flex; gap: 12px; margin-top: 10px; }
    .text-button {
      padding: 0;
      border: 0;
      color: #377278;
      background: transparent;
      cursor: pointer;
      font: inherit;
      font-size: 11px;
    }
    .danger-button { color: #a75a5a; }
    .comment-form {
      margin: 0 12px 12px;
      padding: 12px;
      border: 1px solid #c9dddd;
      border-radius: 7px;
      background: #eff7f5;
    }
    .form-title { margin-bottom: 10px; color: #21454c; font-size: 12px; font-weight: 800; }
    .field { display: grid; gap: 5px; margin-bottom: 9px; }
    .field label { color: #617a7f; font-size: 11px; font-weight: 700; }
    .field input, .field textarea {
      width: 100%;
      padding: 7px 8px;
      border: 1px solid #c8d9d8;
      border-radius: 5px;
      color: #253e45;
      background: #fff;
      font: inherit;
      font-size: 12px;
      line-height: 1.5;
      resize: vertical;
    }
    .field textarea { min-height: 48px; }
    .field textarea.body-input { min-height: 76px; }
    .field textarea.context-input {
      min-height: 38px;
      max-height: 58px;
      resize: none;
      color: #60767b;
      background: #f8fbfa;
    }
    .form-actions { display: flex; gap: 8px; justify-content: flex-end; }
    .secondary-button {
      min-height: 29px;
      padding: 0 10px;
      border: 1px solid #c6d5d6;
      border-radius: 5px;
      color: #48666b;
      background: #fff;
      cursor: pointer;
      font: inherit;
      font-size: 11px;
      font-weight: 700;
    }
    .feedback {
      min-height: 18px;
      padding: 0 12px 10px;
      color: #9a5c5c;
      font-size: 11px;
      line-height: 1.5;
    }
    .feedback[data-kind="success"] { color: #2f725c; }
    .feedback[data-kind="info"] { color: #5c7379; }
    .selection-action {
      position: fixed;
      z-index: 2147483001;
      display: none;
      min-height: 30px;
      padding: 0 10px;
      border: 1px solid #0c7777;
      border-radius: 6px;
      color: #fff;
      background: #0c7777;
      box-shadow: 0 5px 16px rgba(28, 58, 64, .2);
      cursor: pointer;
      font: inherit;
      font-size: 12px;
      font-weight: 700;
    }
    @media (max-width: 600px) {
      .panel { right: 12px; bottom: 76px; max-height: calc(100vh - 100px); }
      .float-ball { right: 16px; bottom: 16px; }
    }
  `;

  const panel = createElement('section', 'panel hidden');
  const floatBall = createElement('button', 'float-ball');
  floatBall.type = 'button';
  floatBall.title = '展开评论面板';
  floatBall.setAttribute('aria-label', '展开评论面板');
  const badge = createElement('span', 'badge');
  floatBall.append(badge);
  const header = createElement('header', 'panel-header');
  const titleWrap = createElement('div', 'title-wrap');
  const title = createElement('span', 'title');
  title.textContent = '私有评论';
  const count = createElement('span', 'count');
  titleWrap.append(title, count);
  const toggleButton = createElement('button', 'icon-button');
  toggleButton.type = 'button';
  toggleButton.title = '收起或展开评论面板';
  toggleButton.setAttribute('aria-label', '收起或展开评论面板');
  toggleButton.setAttribute('aria-expanded', 'true');
  toggleButton.textContent = '−';
  header.append(titleWrap, toggleButton);

  const content = createElement('div', 'content');
  const selectionAction = createElement('button', 'selection-action');
  selectionAction.type = 'button';
  selectionAction.textContent = '添加私有评论';
  const banner = createElement('div', 'connection-banner');
  const bannerText = createElement('span');
  const optionsButton = createElement('button');
  optionsButton.type = 'button';
  optionsButton.textContent = '打开设置';
  banner.append(bannerText, optionsButton);
  const toolbar = createElement('div', 'toolbar');
  const toolbarNote = createElement('span', 'toolbar-note');
  toolbarNote.textContent = '仅自己可见';
  const addButton = createElement('button', 'primary-button');
  addButton.type = 'button';
  addButton.textContent = '新增评论';
  toolbar.append(toolbarNote, addButton);
  const form = createElement('form', 'comment-form');
  form.hidden = true;
  const formTitle = createElement('div', 'form-title');
  const selectedField = createElement('div', 'field');
  const selectedLabel = createElement('label');
  selectedLabel.textContent = '关联原文（自动）';
  const selectedInput = createElement('textarea');
  selectedInput.className = 'context-input';
  selectedInput.readOnly = true;
  selectedInput.rows = 2;
  selectedField.append(selectedLabel, selectedInput);
  const anchorField = createElement('div', 'field');
  const anchorLabel = createElement('label');
  anchorLabel.textContent = '锚点';
  const anchorInput = createElement('input');
  anchorInput.type = 'text';
  anchorInput.tabIndex = -1;
  anchorField.hidden = true;
  anchorField.append(anchorLabel, anchorInput);
  const bodyField = createElement('div', 'field');
  const bodyLabel = createElement('label');
  bodyLabel.textContent = '评论正文';
  const bodyInput = createElement('textarea', 'body-input');
  bodyInput.required = true;
  bodyInput.rows = 3;
  bodyField.append(bodyLabel, bodyInput);
  const formActions = createElement('div', 'form-actions');
  const cancelButton = createElement('button', 'secondary-button');
  cancelButton.type = 'button';
  cancelButton.textContent = '取消';
  const submitButton = createElement('button', 'primary-button');
  submitButton.type = 'submit';
  submitButton.textContent = '保存评论';
  formActions.append(cancelButton, submitButton);
  form.append(formTitle, selectedField, anchorField, bodyField, formActions);
  const list = createElement('div', 'comment-list');
  const feedback = createElement('div', 'feedback');
  content.append(banner, toolbar, form, list, feedback);
  panel.append(header, content);
  shadow.append(style, floatBall, panel, selectionAction);
  document.body.append(host);

  // 加载气泡样式配置
  void loadInlineBubbleStyle().then((style) => {
    activeBubbleStyle = style;
  });
  // 加载排除路径配置
  void chrome.storage.local.get('excluded-paths').then((result) => {
    const userPaths = result['excluded-paths'];
    if (Array.isArray(userPaths)) {
      activeExcludedPaths = [
        ...DEFAULT_EXCLUDED_PATHS,
        ...userPaths.filter(
          (p: unknown) => typeof p === 'string' && p.trim() && !DEFAULT_EXCLUDED_PATHS.includes(p),
        ),
      ];
    }
  });
  // 监听样式变化（设置页修改后实时生效）
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes[BUBBLE_STYLE_STORAGE_KEY]) {
      activeBubbleStyle = normalizeInlineBubbleStyle(changes[BUBBLE_STYLE_STORAGE_KEY].newValue);
      // 如果当前有气泡在显示，立即重新生成样式
      if (document.getElementById(INLINE_BUBBLE_ID)) {
        ensureInlineBubbleStyle();
      }
    }
    if (changes['excluded-paths']) {
      activeExcludedPaths = [
        ...DEFAULT_EXCLUDED_PATHS,
        ...(Array.isArray(changes['excluded-paths'].newValue)
          ? changes['excluded-paths'].newValue.filter(
              (p: unknown) => typeof p === 'string' && p.trim() && !DEFAULT_EXCLUDED_PATHS.includes(p),
            )
          : []),
      ];
    }
  });

  let documentKey = '';
  let lastRecordedDocumentKey = '';
  let comments: PrivateComment[] = [];
  let editingCommentId: string | null = null;
  let pendingRangeAnchor: CommentRangeAnchor | undefined;
  let pendingQuoteSelector: QuoteSelector | undefined;
  let collapsed = true;
  let dragging = false;
  let dragged = false;
  let dragStartX = 0;
  let dragStartY = 0;
  // 使用 transform 偏移量代替 left/top，避免每次 pointermove 触发布局重排
  let panelTranslateX = 0;
  let panelTranslateY = 0;
  // requestAnimationFrame 节流：同一帧内只执行一次 DOM 写入
  let rafId = 0;
  let pendingX = 0;
  let pendingY = 0;

  function setFeedback(
    message: string,
    kind: 'error' | 'success' | 'info' = 'error',
  ): void {
    feedback.dataset.kind = kind;
    setText(feedback, message);
  }

  function resetForm(): void {
    editingCommentId = null;
    form.hidden = true;
    selectedInput.value = '';
    anchorInput.value = '';
    pendingRangeAnchor = undefined;
    pendingQuoteSelector = undefined;
    bodyInput.value = '';
  }

  function showCreateForm(): void {
    editingCommentId = null;
    formTitle.textContent = '新增私有评论';
    submitButton.textContent = '保存评论';
    const context = getSelectedContext();
    selectedInput.value = context.selectedText;
    anchorInput.value = context.anchor;
    pendingRangeAnchor = context.rangeAnchor;
    pendingQuoteSelector = context.quoteSelector;
    bodyInput.value = '';
    form.hidden = false;
    bodyInput.focus();
  }

  function showEditForm(comment: PrivateComment): void {
    editingCommentId = comment.id;
    formTitle.textContent = '编辑私有评论';
    submitButton.textContent = '保存修改';
    selectedInput.value = comment.selectedText;
    anchorInput.value = comment.anchor;
    pendingRangeAnchor = comment.rangeAnchor;
    pendingQuoteSelector = comment.quoteSelector;
    bodyInput.value = comment.body;
    form.hidden = false;
    bodyInput.focus();
  }

  function locateCommentSource(comment: PrivateComment): void {
    // 定位原文的核心策略：优先使用浏览器原生 window.find()，
    // 它不依赖任何 DOM 结构假设，能自动处理跨节点、跨容器、跨段落匹配。
    const searchText = comment.quoteSelector?.exact || comment.selectedText || comment.anchor;

    if (!searchText || !searchText.trim()) {
      setFeedback('这条评论没有选中文本或锚点，无法定位原文。');
      return;
    }

    // 第一步：尝试浏览器原生 window.find()
    // 这是最可靠的方式，直接利用浏览器的全页文本搜索能力
    const found = locateWithWindowFind(searchText, comment);
    if (found) return;

    // 第二步：尝试 CSS 高亮方式（DOM 文本搜索）
    const located = locateWithDomSearch(comment);
    if (located) return;

    // 第三步：等待动态渲染重试
    setFeedback('正在等待文档内容渲染，请稍候…');
    let retries = 5;
    const retry = (): void => {
      retries -= 1;
      const found2 = locateWithWindowFind(searchText, comment);
      if (found2) return;
      const located2 = locateWithDomSearch(comment);
      if (located2) return;
      if (retries > 0) {
        window.setTimeout(retry, 800);
      } else {
        setFeedback(
          '未找到对应原文，页面可能尚未加载完成或内容已变更。请确保文档已完全展开后重试。',
        );
      }
    };
    window.setTimeout(retry, 800);
  }

  /**
   * 使用浏览器原生 window.find() 定位文本。
   *
   * 这是定位原文最可靠的方式：
   * 1. 不依赖任何 DOM 结构假设（不假设语雀用 <p> 还是自定义标签）
   * 2. 浏览器自动处理跨节点、跨段落、跨容器匹配
   * 3. 浏览器自动滚动到匹配位置
   * 4. 浏览器自动创建选区
   *
   * 为应对 window.find() 的兼容性问题（部分浏览器已废弃），
   * 提供 DOM 搜索兜底。
   */
  function locateWithWindowFind(
    searchText: string,
    comment: PrivateComment,
  ): boolean {
    // 清除当前选区
    const selection = window.getSelection();
    selection?.removeAllRanges();

    // 归一化搜索文本：去掉换行，因为 window.find() 在某些浏览器
    // 中不支持跨行匹配，换行需要替换为空格或直接移除
    const normalized = normalizeLocatorText(searchText);
    if (!normalized) return false;

    // 尝试逐步缩短搜索文本，提高匹配成功率
    // 跨段落选区可能包含 DOM 中不存在的换行符，逐步截断后重试
    const candidates = generateSearchCandidates(normalized);

    for (const candidate of candidates) {
      // 清除上一次的选区
      selection?.removeAllRanges();

      let found = false;
      try {
        // @ts-expect-error window.find 是非标准 API，但 Chrome 完整支持
        found = window.find(candidate, false, false, true, false, false, false);
      } catch {
        found = false;
      }

      if (found && selection && selection.toString().trim().length > 0) {
        // 浏览器已找到并选中了文本，现在滚动到选区位置
        const range = selection.rangeCount ? selection.getRangeAt(0) : null;
        if (range) {
          highlightTextRange(range);
          showInlineCommentBubble(comment, range);
          return true;
        }
      }
    }

    return false;
  }

  /**
   * 为跨段落选区生成搜索候选文本列表。
   *
   * 语雀文档中跨段落选中会产生含 \n 的文本，归一化后含空格。
   * window.find() 可能无法匹配含空格的跨节点文本，
   * 因此按优先级生成多个候选：
   *   1. 完整归一化文本
   *   2. 取第一个自然句（到第一个句号/问号/叹号/分号）
   *   3. 取前 N 个字符的子串
   */
  function generateSearchCandidates(normalized: string): string[] {
    const candidates: string[] = [normalized];

    // 按标点切分，取第一个有意义的片段
    const firstSegment = normalized.split(/[。！？；\n]/)[0]?.trim();
    if (firstSegment && firstSegment.length >= 4 && firstSegment !== normalized) {
      candidates.push(firstSegment);
    }

    // 如果文本很长，取前 30-50 个字符作为短候选
    if (normalized.length > 50) {
      const short = normalized.slice(0, 30);
      candidates.push(short);
      const medium = normalized.slice(0, 50);
      if (medium !== short) candidates.push(medium);
    }

    // 取最后一段（如果文本以分句结尾）
    const segments = normalized.split(/[。！？；\n]/).filter((s) => s.trim().length >= 4);
    if (segments.length > 1) {
      candidates.push(segments[segments.length - 1].trim());
    }

    // 去重
    return Array.from(new Set(candidates));
  }

  /**
   * DOM 文本搜索兜底：当 window.find() 不可用时使用。
   * 直接遍历所有文本节点，不限制容器选择器。
   */
  function locateWithDomSearch(comment: PrivateComment): boolean {
    const searchText = comment.quoteSelector?.exact || comment.selectedText || comment.anchor;
    if (!searchText?.trim()) return false;

    const normalized = normalizeLocatorText(searchText);
    if (!normalized) return false;

    // 直接搜索整个 body 的文本节点，不做容器假设
    const textNodes = collectSearchableTextNodes(document.body);
    if (textNodes.length === 0) return false;

    // 先尝试精确匹配（含跨段落空格）
    const exactRange = createExactTextRange(textNodes, normalized);
    if (exactRange) {
      highlightTextRange(exactRange);
      showInlineCommentBubble(comment, exactRange);
      return true;
    }

    // 精确匹配失败，尝试去除空格后的模糊匹配
    const noSpaceSearch = normalized.replace(/\s/g, '');
    if (noSpaceSearch.length >= 4) {
      const textNodes2 = collectSearchableTextNodes(document.body);
      // 重建一个去除空格的文本映射
      const map = createNormalizedTextMap(textNodes2);
      const combinedNoSpace = map.map((item) => item.char).join('').replace(/\s/g, '');
      const idx = combinedNoSpace.indexOf(noSpaceSearch);
      if (idx >= 0) {
        // 找到了，但映射关系已被破坏（去掉了空格），用第一个段落的子串定位
        // 取前 20 个字符做精确定位
        const shortSearch = normalized.replace(/\s/g, '').slice(0, 20);
        for (const node of textNodes2) {
          const nodeText = node.data.replace(/\s/g, '');
          const nodeIdx = nodeText.indexOf(shortSearch);
          if (nodeIdx >= 0) {
            // 在原始文本中找到对应位置
            const range = document.createRange();
            try {
              range.selectNodeContents(node);
              showInlineCommentBubble(comment, range);
              highlightTextRange(range);
              return true;
            } catch {
              continue;
            }
          }
        }
      }
    }

    return false;
  }

  function renderComments(): void {
    count.textContent = `${comments.length} 条`;
    list.replaceChildren();
    if (comments.length === 0) {
      const empty = createElement('div', 'empty');
      empty.textContent = '当前文档还没有私有评论。选中文本后可直接添加。';
      list.append(empty);
      return;
    }
    comments.forEach((comment) => {
      const card = createElement('article', 'comment-card');

      // ── 摘要区（始终显示，点击展开） ──
      const summary = createElement('div', 'card-summary');
      const summaryText = createElement('div', 'card-summary-text');
      const author = createElement('span', 'author');
      author.textContent = comment.author;
      const bodyPreview = createElement('div', 'body-preview');
      bodyPreview.textContent = comment.body;
      summaryText.append(author, bodyPreview);
      const chevron = createElement('button', 'card-chevron');
      chevron.type = 'button';
      chevron.textContent = '▾';
      summary.append(summaryText, chevron);
      card.append(summary);

      // ── 详情区（默认隐藏，展开后显示） ──
      const details = createElement('div', 'card-details');
      const detailsInner = createElement('div', 'card-details-inner');

      // 1. 评论正文（主角，放在最前面）
      const body = createElement('div', 'body');
      body.textContent = comment.body;
      detailsInner.append(body);

      // 2. 关联原文（配角，弱化）
      const sourceText = comment.selectedText || comment.anchor;
      if (sourceText) {
        const selected = createElement('div', 'selected');
        const selectedLabel = createElement('div', 'selected-label');
        selectedLabel.textContent = '关联原文';
        const selectedText = createElement('div');
        selectedText.textContent = sourceText;
        selected.append(selectedLabel, selectedText);
        detailsInner.append(selected);
      }

      // 3. 操作按钮（不再包含"定位原文"——点击卡片摘要即可定位）
      const actions = createElement('div', 'card-actions');
      actions.append(
        createActionButton('编辑', 'text-button', () => showEditForm(comment)),
        createActionButton('删除', 'text-button danger-button', () => {
          if (!window.confirm('确定删除这条私有评论吗？')) {
            return;
          }
          void removeComment(comment.id);
        }),
      );
      detailsInner.append(actions);

      // 4. 时间（最底部，最弱）
      const meta = createElement('div', 'comment-meta');
      const updated = createElement('time');
      updated.dateTime = comment.updatedAt;
      updated.textContent = `${formatTime(comment.createdAt)}`;
      meta.append(updated);
      detailsInner.append(meta);

      details.append(detailsInner);
      card.append(details);

      // 点击评论正文区域 → 直接定位原文
      // 点击 chevron 箭头 → 展开详情
      summaryText.addEventListener('click', () => {
        locateCommentSource(comment);
      });
      chevron.addEventListener('click', (e) => {
        e.stopPropagation();
        card.classList.toggle('expanded');
      });

      list.append(card);
    });
  }

  function renderConnection(connected: boolean, message: string): void {
    banner.hidden = connected;
    bannerText.textContent = connected ? '' : `${message}。`;
    addButton.disabled = !connected;
  }

  // ── 位置边界约束 ──
  // 悬浮球 CSS 初始位置：right:24px, bottom:24px, 宽高 48px
  // 实际屏幕位置 = (innerWidth - 24 - 48 + ballX, innerHeight - 24 - 48 + ballY)
  // 面板 CSS 初始位置：right:24px, bottom:80px, 宽 min(340, 100vw-32), 高 max-height calc(100vh-110px)

  /** 安全边距 */
  const SAFE_MARGIN = 8;
  /** 球尺寸 */
  const BALL_SIZE = 48;

  /**
   * 将悬浮球的 transform 偏移量约束在视口内。
   * 返回 clamp 后的 {x, y}。
   */
  function clampBallPosition(x: number, y: number): { x: number; y: number } {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // 球的 CSS 初始屏幕坐标（左上角）
    const cssLeft = vw - 24 - BALL_SIZE;
    const cssTop = vh - 24 - BALL_SIZE;
    // 实际坐标（加 transform 偏移）
    const actualLeft = cssLeft + x;
    const actualTop = cssTop + y;
    // clamp：让球完全在视口内
    const clampedLeft = Math.max(SAFE_MARGIN, Math.min(vw - BALL_SIZE - SAFE_MARGIN, actualLeft));
    const clampedTop = Math.max(SAFE_MARGIN, Math.min(vh - BALL_SIZE - SAFE_MARGIN, actualTop));
    return { x: clampedLeft - cssLeft, y: clampedTop - cssTop };
  }

  /**
   * 将面板的 transform 偏移量约束在视口内。
   * 面板宽 min(340, 100vw-32)，高 max calc(100vh-110px)
   */
  function clampPanelPosition(x: number, y: number): { x: number; y: number } {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const panelWidth = Math.min(340, vw - 32);
    const panelHeight = Math.min(panel.offsetHeight || 400, vh - 110);
    // 面板 CSS 初始坐标（左上角）
    const cssLeft = vw - 24 - panelWidth;
    const cssTop = vh - 80 - panelHeight;
    const actualLeft = cssLeft + x;
    const actualTop = cssTop + y;
    const clampedLeft = Math.max(SAFE_MARGIN, Math.min(vw - panelWidth - SAFE_MARGIN, actualLeft));
    const clampedTop = Math.max(SAFE_MARGIN, Math.min(vh - panelHeight - SAFE_MARGIN, actualTop));
    return { x: clampedLeft - cssLeft, y: clampedTop - cssTop };
  }

  /** 确保球当前位置合法，不合法时修正 */
  function ensureBallInBounds(): void {
    const clamped = clampBallPosition(ballX, ballY);
    if (clamped.x !== ballX || clamped.y !== ballY) {
      ballX = clamped.x;
      ballY = clamped.y;
      ballPendingX = ballX;
      ballPendingY = ballY;
      floatBall.style.transform = `translate3d(${ballX}px, ${ballY}px, 0)`;
    }
  }

  function setCollapsed(nextCollapsed: boolean): void {
    collapsed = nextCollapsed;
    if (collapsed) {
      panel.classList.add('hidden');
      floatBall.classList.remove('hidden');
      // 收起时确保球在视口内（防止之前拖出边界）
      ensureBallInBounds();
    } else {
      // 展开前先确保球在视口内安全区域
      ensureBallInBounds();
      // 把悬浮球的拖拽偏移同步到面板，让面板出现在悬浮球附近
      panelTranslateX = ballX;
      panelTranslateY = ballY;
      // clamp 面板位置
      const panelClamped = clampPanelPosition(panelTranslateX, panelTranslateY);
      panelTranslateX = panelClamped.x;
      panelTranslateY = panelClamped.y;
      pendingX = panelTranslateX;
      pendingY = panelTranslateY;
      panel.style.transform = `translate3d(${panelTranslateX}px, ${panelTranslateY}px, 0)`;
      panel.classList.remove('hidden');
      floatBall.classList.add('hidden');
    }
    toggleButton.textContent = collapsed ? '+' : '−';
    toggleButton.title = collapsed ? '展开评论面板' : '最小化评论面板';
    toggleButton.setAttribute('aria-label', toggleButton.title);
    toggleButton.setAttribute('aria-expanded', String(!collapsed));
  }

  async function recordVisit(currentDocumentKey: string): Promise<void> {
    if (lastRecordedDocumentKey === currentDocumentKey) {
      return;
    }
    if (!isNormalYuqueDocumentUrl(window.location.href)) {
      return;
    }
    lastRecordedDocumentKey = currentDocumentKey;
    try {
      await sendRuntimeMessage({
        type: 'record-visit',
        url: window.location.href,
        documentKey: currentDocumentKey,
        title: document.title,
      });
    } catch {
      // 历史写入失败不应阻断评论面板；页面加载时已经完成发送尝试。
    }
  }

  async function loadComments(): Promise<void> {
    try {
      documentKey = getDocumentKey(window.location.href);
      void recordVisit(documentKey);
      const response = await sendRuntimeMessage({ type: 'get-comments', documentKey });
      if (!response.ok || !('library' in response)) {
        comments = [];
        renderConnection(false, response.ok ? '本地评论库不可用' : response.error);
        setFeedback(response.ok ? '请先连接本地目录。' : response.error);
        renderComments();
        return;
      }
      comments = response.library.comments;
      renderConnection(true, '已连接');
      setFeedback('', 'info');
      renderComments();
      // 悬浮球角标：显示评论数
      badge.textContent = comments.length > 0 ? String(comments.length) : '';
    } catch (error) {
      comments = [];
      renderConnection(false, '当前页面无法建立评论连接');
      setFeedback(error instanceof Error ? error.message : '评论加载失败');
      renderComments();
    }
  }

  async function removeComment(commentId: string): Promise<void> {
    const response = await sendRuntimeMessage({ type: 'delete-comment', commentId });
    if (!response.ok) {
      setFeedback(response.error);
      return;
    }
    resetForm();
    await loadComments();
  }

  optionsButton.addEventListener('click', () => {
    void sendRuntimeMessage({ type: 'open-options' });
  });
  addButton.addEventListener('click', showCreateForm);
  cancelButton.addEventListener('click', resetForm);
  toggleButton.addEventListener('click', () => {
    if (dragged) {
      dragged = false;
      return;
    }
    setCollapsed(true);
  });

  // ── 悬浮球事件 ──
  // 点击展开面板，拖拽移动位置
  let ballDragging = false;
  let ballDragged = false;
  let ballStartX = 0;
  let ballStartY = 0;
  let ballX = 0;  // 当前 transform 偏移
  let ballY = 0;
  let ballRafId = 0;
  let ballPendingX = 0;
  let ballPendingY = 0;

  floatBall.addEventListener('pointerdown', (event) => {
    ballDragging = true;
    ballDragged = false;
    ballStartX = event.clientX;
    ballStartY = event.clientY;
    ballPendingX = ballX;
    ballPendingY = ballY;
    floatBall.classList.add('dragging');
    floatBall.setPointerCapture(event.pointerId);
  });
  floatBall.addEventListener('pointermove', (event) => {
    if (!ballDragging) return;
    const dx = event.clientX - ballStartX;
    const dy = event.clientY - ballStartY;
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) ballDragged = true;
    // clamp 防止越界
    const clamped = clampBallPosition(ballX + dx, ballY + dy);
    ballPendingX = clamped.x;
    ballPendingY = clamped.y;
    if (ballRafId === 0) {
      ballRafId = window.requestAnimationFrame(() => {
        ballRafId = 0;
        floatBall.style.transform = `translate3d(${ballPendingX}px, ${ballPendingY}px, 0)`;
      });
    }
  });
  floatBall.addEventListener('pointerup', () => {
    ballDragging = false;
    ballX = ballPendingX;
    ballY = ballPendingY;
    if (ballRafId !== 0) {
      window.cancelAnimationFrame(ballRafId);
      ballRafId = 0;
      floatBall.style.transform = `translate3d(${ballPendingX}px, ${ballPendingY}px, 0)`;
    }
    floatBall.classList.remove('dragging');
    if (!ballDragged) {
      // 纯点击 → 展开面板
      setCollapsed(false);
    }
  });

  // ── 面板 header 拖拽 ──
  // 拖拽只在 header 非按钮区域触发。
  // 点击 toggleButton 等按钮时，不进入拖拽流程，保证 click 事件正常触发。
  header.addEventListener('pointerdown', (event) => {
    if (event.target instanceof HTMLElement && event.target.closest('button')) {
      return;
    }
    dragging = true;
    dragged = false;
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    pendingX = panelTranslateX;
    pendingY = panelTranslateY;
    panel.classList.add('dragging');
    header.setPointerCapture(event.pointerId);
  });
  header.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const deltaX = event.clientX - dragStartX;
    const deltaY = event.clientY - dragStartY;
    if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
      dragged = true;
    }
    // clamp 防止越界
    const clamped = clampPanelPosition(panelTranslateX + deltaX, panelTranslateY + deltaY);
    pendingX = clamped.x;
    pendingY = clamped.y;
    // 用 requestAnimationFrame 节流，同一帧内只写一次 transform
    if (rafId === 0) {
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        panel.style.transform = `translate3d(${pendingX}px, ${pendingY}px, 0)`;
      });
    }
  });
  header.addEventListener('pointerup', () => {
    dragging = false;
    // 提交最终位置到状态变量
    panelTranslateX = pendingX;
    panelTranslateY = pendingY;
    // 确保最后一帧的位置已写入
    if (rafId !== 0) {
      window.cancelAnimationFrame(rafId);
      rafId = 0;
      panel.style.transform = `translate3d(${pendingX}px, ${pendingY}px, 0)`;
    }
    panel.classList.remove('dragging');
  });
  selectionAction.addEventListener('click', () => {
    selectionAction.style.display = 'none';
    setCollapsed(false);
    showCreateForm();
  });
  document.addEventListener('selectionchange', () => {
    window.setTimeout(() => {
      const selection = window.getSelection();
      const selectedText = selection?.toString().trim() ?? '';
      if (!selectedText || !selection?.rangeCount || !host.isConnected) {
        selectionAction.style.display = 'none';
        return;
      }
      const rect = selection.getRangeAt(0).getBoundingClientRect();
      selectionAction.style.left = `${Math.min(window.innerWidth - 130, Math.max(8, rect.left))}px`;
      selectionAction.style.top = `${Math.min(window.innerHeight - 42, Math.max(8, rect.bottom + 8))}px`;
      selectionAction.style.display = 'block';
    }, 0);
  });

  // 窗口缩小时自动把球和面板拉回视口
  window.addEventListener('resize', () => {
    ensureBallInBounds();
    if (!collapsed) {
      const clamped = clampPanelPosition(panelTranslateX, panelTranslateY);
      panelTranslateX = clamped.x;
      panelTranslateY = clamped.y;
      pendingX = panelTranslateX;
      pendingY = panelTranslateY;
      panel.style.transform = `translate3d(${panelTranslateX}px, ${panelTranslateY}px, 0)`;
    }
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const draft: CommentDraft = {
      documentKey,
      selectedText: selectedInput.value,
      anchor: anchorInput.value,
      rangeAnchor: pendingRangeAnchor,
      quoteSelector: pendingQuoteSelector,
      body: bodyInput.value,
    };
    submitButton.disabled = true;
    try {
      const response = editingCommentId
        ? await sendRuntimeMessage({
            type: 'update-comment',
            commentId: editingCommentId,
            patch: {
              selectedText: draft.selectedText,
              anchor: draft.anchor,
              rangeAnchor: draft.rangeAnchor,
              quoteSelector: draft.quoteSelector,
              body: draft.body,
            },
          })
        : await sendRuntimeMessage({ type: 'create-comment', draft });
      if (!response.ok) {
        setFeedback(response.error);
        return;
      }
      resetForm();
      await loadComments();
    } finally {
      submitButton.disabled = false;
    }
  });

  void loadComments();
  let lastUrl = window.location.href;
  window.addEventListener('popstate', () => void loadComments());
  window.addEventListener('hashchange', () => void loadComments());
  window.setInterval(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      resetForm();
      void loadComments();
    }
  }, 1000);
}

if (isNormalYuqueDocumentUrl(location.href)) {
  mountPanel();
}
