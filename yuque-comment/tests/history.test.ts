import { describe, expect, it } from 'vitest';
import {
  clearHistory,
  emptyHistoryLibrary,
  parseHistoryJson,
  recordHistoryVisit,
  searchHistory,
  serializeHistory,
  type HistoryVisitDraft,
} from '../src/shared/model';
import {
  DirectoryHistoryStore,
  HISTORY_FILE_NAME,
  MemoryHistoryStore,
} from '../src/shared/storage';

const firstVisit: HistoryVisitDraft = {
  url: 'https://www.yuque.com/team/book/doc#section-1',
  documentKey: 'https://www.yuque.com/team/book/doc',
  title: '第一篇文档',
};

describe('语雀浏览历史数据模型', () => {
  it('按 documentKey 去重并更新最近访问时间、标题和次数', () => {
    const first = recordHistoryVisit(
      emptyHistoryLibrary(),
      firstVisit,
      () => '2026-08-03T10:00:00.000Z',
    );
    const second = recordHistoryVisit(
      first,
      { ...firstVisit, title: '第一篇文档（已更新）', url: `${firstVisit.url}#another` },
      () => '2026-08-03T10:05:00.000Z',
    );

    expect(second.entries).toHaveLength(1);
    expect(second.entries[0]).toEqual({
      url: 'https://www.yuque.com/team/book/doc',
      documentKey: 'https://www.yuque.com/team/book/doc',
      title: '第一篇文档（已更新）',
      visitedAt: '2026-08-03T10:05:00.000Z',
      visitCount: 2,
    });
  });

  it('搜索标题、URL 和 documentKey，并按最近访问时间倒序返回', () => {
    const older = recordHistoryVisit(
      emptyHistoryLibrary(),
      firstVisit,
      () => '2026-08-03T10:00:00.000Z',
    );
    const library = recordHistoryVisit(
      older,
      {
        url: 'https://www.yuque.com/team/other/guide',
        documentKey: 'https://www.yuque.com/team/other/guide',
        title: '开发指南',
      },
      () => '2026-08-03T10:05:00.000Z',
    );

    expect(searchHistory(library, '开发')).toHaveLength(1);
    expect(searchHistory(library, 'team/book')).toHaveLength(1);
    expect(searchHistory(library, 'https://www.yuque.com')).toHaveLength(2);
    expect(searchHistory(library, '')[0].title).toBe('开发指南');
  });

  it('拒绝非语雀页面、排除页面和不一致的 documentKey', () => {
    expect(() => recordHistoryVisit(
      emptyHistoryLibrary(),
      {
        ...firstVisit,
        url: 'https://example.com/doc',
        documentKey: 'https://example.com/doc',
      },
      () => '2026-08-03T10:00:00.000Z',
    )).toThrow();
    expect(() => recordHistoryVisit(
      emptyHistoryLibrary(),
      {
        ...firstVisit,
        url: 'https://www.yuque.com/dashboard/settings',
        documentKey: 'https://www.yuque.com/dashboard/settings',
      },
      () => '2026-08-03T10:00:00.000Z',
    )).toThrow();
    expect(() => recordHistoryVisit(
      emptyHistoryLibrary(),
      { ...firstVisit, documentKey: 'https://www.yuque.com/team/book/other' },
      () => '2026-08-03T10:00:00.000Z',
    )).toThrow();
  });

  it('校验历史 schema，坏 JSON 不会被解析为可用数据', () => {
    const library = recordHistoryVisit(
      emptyHistoryLibrary(),
      firstVisit,
      () => '2026-08-03T10:00:00.000Z',
    );

    expect(parseHistoryJson(serializeHistory(library))).toEqual(library);
    expect(() => parseHistoryJson('{"version":1,"entries":[{"documentKey":"bad"}]}')).toThrow(
      '语雀浏览历史 JSON schema 校验失败',
    );
    expect(() => parseHistoryJson(JSON.stringify({
      version: 1,
      entries: [{ ...library.entries[0], visitCount: 0 }],
    }))).toThrow('语雀浏览历史 JSON schema 校验失败');
  });

  it('清空历史后返回合法的空库', () => {
    const library = recordHistoryVisit(
      emptyHistoryLibrary(),
      firstVisit,
      () => '2026-08-03T10:00:00.000Z',
    );

    expect(clearHistory(library)).toEqual({ version: 1, entries: [] });
  });
});

describe('语雀浏览历史存储', () => {
  it('内存存储支持记录、查询和清空', async () => {
    const store = new MemoryHistoryStore();

    await store.recordVisit(firstVisit, () => '2026-08-03T10:00:00.000Z');
    await store.recordVisit(firstVisit, () => '2026-08-03T10:05:00.000Z');

    await expect(store.search('第一篇')).resolves.toMatchObject([{
      documentKey: firstVisit.documentKey,
      visitCount: 2,
    }]);

    await store.clear();
    await expect(store.load()).resolves.toEqual({ version: 1, entries: [] });
  });

  it('目录存储固定使用 yuque-history.json，并拒绝坏 JSON 且不写入覆盖', async () => {
    let fileText = '{"version":1,"entries":[{"broken":true}]}';
    let writeCount = 0;
    let requestedFileName = '';
    const directory = {
      async getFileHandle(name: string) {
        requestedFileName = name;
        return {
          async getFile() {
            return { async text() { return fileText; } };
          },
          async createWritable() {
            return {
              async write(value: string) {
                writeCount += 1;
                fileText = value;
              },
              async close() {},
            };
          },
        };
      },
    };
    const store = new DirectoryHistoryStore(directory);

    expect(requestedFileName).toBe('');
    await expect(store.load()).rejects.toThrow('语雀浏览历史 JSON schema 校验失败');
    expect(requestedFileName).toBe(HISTORY_FILE_NAME);
    expect(writeCount).toBe(0);
    expect(fileText).toContain('"broken":true');
    await expect(store.save(emptyHistoryLibrary())).rejects.toThrow(
      '语雀浏览历史 JSON schema 校验失败',
    );
    expect(writeCount).toBe(0);
    expect(fileText).toContain('"broken":true');
  });
});
