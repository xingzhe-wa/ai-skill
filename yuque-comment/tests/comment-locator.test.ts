import { describe, expect, it } from 'vitest';
import {
  createQuoteSelector,
  createTextFingerprint,
  findQuoteMatch,
  findTextPositionMatch,
  findCommentLocationCandidate,
  getCommentLocationCandidates,
  normalizeLocatorText,
  type LocatorBlock,
} from '../src/shared/comment-locator';

describe('评论原文定位文本匹配', () => {
  it('优先使用 selectedText，空值时再回退到 anchor', () => {
    expect(getCommentLocationCandidates({
      selectedText: '  精确选中文本  ',
      anchor: '段落锚点',
    })).toEqual([
      { source: 'selectedText', text: '精确选中文本' },
      { source: 'anchor', text: '段落锚点' },
    ]);

    expect(getCommentLocationCandidates({
      selectedText: '   ',
      anchor: '段落锚点',
    })).toEqual([
      { source: 'anchor', text: '段落锚点' },
    ]);
  });

  it('按归一化空白匹配页面文本，避免换行和多空格导致定位失败', () => {
    const pageText = '第一段内容。\n\n这里   是需要定位的原文。';

    expect(normalizeLocatorText(pageText)).toContain('这里 是需要定位的原文');
    expect(findCommentLocationCandidate(pageText, {
      selectedText: '这里 是需要定位的原文',
      anchor: '第一段内容',
    })).toEqual({
      source: 'selectedText',
      text: '这里 是需要定位的原文',
    });
  });

  it('移除不可见字符和不间断空格', () => {
    expect(normalizeLocatorText('  原文\u200B\u00A0内容  ')).toBe('原文 内容');
  });

  it('同文重复 exact 时使用 prefix 和 suffix 选中正确段落', () => {
    const blocks: LocatorBlock[] = [
      {
        index: 0,
        text: '旧上下文：需要定位的原文。旧结尾',
        fingerprint: createTextFingerprint('旧上下文：需要定位的原文。旧结尾'),
      },
      {
        index: 1,
        text: '新上下文：需要定位的原文。新结尾',
        fingerprint: createTextFingerprint('新上下文：需要定位的原文。新结尾'),
      },
    ];
    const blockText = blocks[1].text;
    const exact = '需要定位的原文';
    const start = normalizeLocatorText(blockText).indexOf(exact);
    const selector = createQuoteSelector({
      exact,
      blockText,
      containerText: blocks.map((block) => block.text).join('\n'),
      start,
      end: start + exact.length,
    });
    selector.blockFingerprint = 'fnv1a:unknown:0';

    expect(findQuoteMatch(blocks, selector)).toMatchObject({
      blockIndex: 1,
      start,
      end: start + exact.length,
    });
  });

  it('TextQuote 和 TextPosition 都按归一化换行与不间断空格匹配', () => {
    const originalBlock = '开头\u00A0 需要\n定位的\n内容 结尾';
    const exact = '需要 定位的 内容';
    const start = normalizeLocatorText(originalBlock).indexOf(exact);
    const selector = createQuoteSelector({
      exact,
      blockText: originalBlock,
      blockIndex: 0,
      containerText: originalBlock,
      start,
      end: start + exact.length,
    });
    const blocks: LocatorBlock[] = [{
      index: 0,
      text: '开头 需要 定位的 内容 结尾',
      fingerprint: createTextFingerprint(originalBlock),
    }];

    expect(findQuoteMatch(blocks, selector)).toMatchObject({
      blockIndex: 0,
      start,
      end: start + exact.length,
    });
    expect(findTextPositionMatch(blocks, selector)).toMatchObject({
      blockIndex: 0,
      start,
      end: start + exact.length,
    });
  });

  it('正文插入新节点导致路径变化后仍通过块指纹定位', () => {
    const selectedBlock = '结构稳定的正文片段，仍然需要定位。';
    const exact = '仍然需要定位';
    const start = normalizeLocatorText(selectedBlock).indexOf(exact);
    const selector = createQuoteSelector({
      exact,
      blockText: selectedBlock,
      blockIndex: 0,
      containerText: selectedBlock,
      start,
      end: start + exact.length,
    });
    const currentBlocks: LocatorBlock[] = [
      {
        index: 0,
        text: '后来插入的段落。',
        fingerprint: createTextFingerprint('后来插入的段落。'),
      },
      {
        index: 1,
        text: selectedBlock,
        fingerprint: createTextFingerprint(selectedBlock),
      },
    ];

    expect(findQuoteMatch(currentBlocks, selector)).toMatchObject({
      blockIndex: 1,
      start,
      end: start + exact.length,
    });
  });

  it('没有新 selector 的旧评论仍保留 selectedText 和 anchor 回退候选', () => {
    expect(getCommentLocationCandidates({
      selectedText: '旧评论选中文本',
      anchor: '旧评论段落锚点',
    })).toEqual([
      { source: 'selectedText', text: '旧评论选中文本' },
      { source: 'anchor', text: '旧评论段落锚点' },
    ]);
  });
});
