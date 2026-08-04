import { describe, expect, it } from 'vitest';
import {
  createComment,
  deleteComment,
  getDocumentKey,
  getCommentsForDocument,
  parseLibraryJson,
  serializeLibrary,
  updateComment,
  type CommentLibrary,
} from '../src/shared/model';

describe('语雀私有评论数据模型', () => {
  it('将当前 URL 规范化为不包含 hash 的文档 key', () => {
    expect(getDocumentKey('https://www.yuque.com/team/book/doc?view=full#section-1'))
      .toBe('https://www.yuque.com/team/book/doc?view=full');
  });

  it('拒绝非语雀页面作为文档 key', () => {
    expect(() => getDocumentKey('https://example.com/doc')).toThrow('只支持 yuque.com');
  });

  it('支持评论新增、查询、编辑和删除', () => {
    const created = createComment(
      {
        documentKey: 'https://www.yuque.com/team/book/doc',
        selectedText: '需要确认的句子',
        anchor: '段落 1',
        body: '请补充来源',
      },
      () => '2026-08-03T10:00:00.000Z',
      () => 'comment-1',
    );
    const library: CommentLibrary = { version: 1, comments: [created] };

    expect(getCommentsForDocument(library, created.documentKey)).toEqual([created]);

    const updated = updateComment(
      library,
      'comment-1',
      { body: '已补充来源', anchor: '段落 2' },
      () => '2026-08-03T10:05:00.000Z',
    );
    expect(updated.comments[0]).toMatchObject({
      id: 'comment-1',
      body: '已补充来源',
      anchor: '段落 2',
      updatedAt: '2026-08-03T10:05:00.000Z',
      createdAt: '2026-08-03T10:00:00.000Z',
    });

    const deleted = deleteComment(updated, 'comment-1');
    expect(deleted.comments).toHaveLength(0);
  });

  it('持久化 QuoteSelector，同时兼容没有新定位字段的旧评论', () => {
    const quoteSelector = {
      exact: '需要稳定定位的文本',
      prefix: '前文',
      suffix: '后文',
      containerFingerprint: 'fnv1a:container:12',
      blockFingerprint: 'fnv1a:block:8',
      blockIndex: 2,
      position: { start: 2, end: 11 },
    };
    const created = createComment(
      {
        documentKey: 'https://www.yuque.com/team/book/doc',
        selectedText: '需要稳定定位的文本',
        anchor: '目标段落',
        quoteSelector,
        body: '评论正文',
      },
      () => '2026-08-03T11:00:00.000Z',
      () => 'comment-quote',
    );

    expect(parseLibraryJson(serializeLibrary({
      version: 1,
      comments: [created],
    }))).toEqual({
      version: 1,
      comments: [created],
    });
    expect(parseLibraryJson(JSON.stringify({
      version: 1,
      comments: [{
        ...created,
        quoteSelector: undefined,
      }],
    })).comments[0]).not.toHaveProperty('quoteSelector');
  });

  it('导入导出使用固定 schema，并拒绝缺少必要字段的 JSON', () => {
    const library: CommentLibrary = {
      version: 1,
      comments: [
        createComment(
          {
            documentKey: 'https://yuque.com/book/doc',
            selectedText: '',
            anchor: '标题',
            body: '正文',
          },
          () => '2026-08-03T10:00:00.000Z',
          () => 'comment-2',
        ),
      ],
    };

    const imported = parseLibraryJson(serializeLibrary(library));
    expect(imported).toEqual(library);
    expect(() => parseLibraryJson('{"version":1,"comments":[{"id":"bad"}]}')).toThrow(
      '私有评论 JSON schema 校验失败',
    );
    expect(() => parseLibraryJson(JSON.stringify({
      version: 1,
      comments: [{
        ...library.comments[0],
        documentKey: 'https://example.com/not-yuque',
      }],
    }))).toThrow('私有评论 JSON schema 校验失败');
  });
});
