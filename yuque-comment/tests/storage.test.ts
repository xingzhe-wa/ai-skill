import { describe, expect, it } from 'vitest';
import { createComment } from '../src/shared/model';
import {
  DirectoryCommentStore,
  HISTORY_FILE_NAME,
  MemoryCommentStore,
  PRIVATE_COMMENTS_FILE_NAME,
  verifyDirectoryAccess,
} from '../src/shared/storage';

describe('评论存储模块', () => {
  it('无权限方法的目录句柄也能完成访问验证', async () => {
    const directory = {
      async getFileHandle() {
        return {
          async getFile() {
            return { async text() { return ''; } };
          },
          async createWritable() {
            return { async write() {}, async close() {} };
          },
        };
      },
    };
    await expect(verifyDirectoryAccess(directory)).resolves.toBeUndefined();
  });

  it('目录访问验证会准备评论和历史两个固定数据文件', async () => {
    const requestedFileNames: string[] = [];
    const directory = {
      async getFileHandle(name: string) {
        requestedFileNames.push(name);
        return {
          async getFile() {
            return { async text() { return ''; } };
          },
          async createWritable() {
            return { async write() {}, async close() {} };
          },
        };
      },
    };

    await verifyDirectoryAccess(directory);

    expect(requestedFileNames).toEqual([
      PRIVATE_COMMENTS_FILE_NAME,
      HISTORY_FILE_NAME,
    ]);
  });

  it('内存存储支持保存与读取完整评论库', async () => {
    const store = new MemoryCommentStore();
    const comment = createComment(
      {
        documentKey: 'https://www.yuque.com/team/book/doc',
        selectedText: '文本',
        anchor: '段落',
        body: '备注',
      },
      () => '2026-08-03T10:00:00.000Z',
      () => 'comment-memory',
    );

    await store.save({ version: 1, comments: [comment] });

    await expect(store.load()).resolves.toEqual({ version: 1, comments: [comment] });
    await expect(store.exportJson()).resolves.toContain('"comment-memory"');
  });

  it('文件存储使用 private-comments.json 并能导入合法 JSON', async () => {
    let fileText = '';
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
              async write(value: string) { fileText = value; },
              async close() {},
            };
          },
        };
      },
    };
    const store = new DirectoryCommentStore(directory);
    const imported = await store.importJson('{"version":1,"comments":[]}');

    expect(requestedFileName).toBe(PRIVATE_COMMENTS_FILE_NAME);
    expect(imported).toEqual({ version: 1, comments: [] });
    await expect(store.load()).resolves.toEqual({ version: 1, comments: [] });
  });

  it('文件存储遇到坏 JSON 时拒绝读取，避免静默覆盖用户数据', async () => {
    const directory = {
      async getFileHandle() {
        return {
          async getFile() {
            return { async text() { return '{"version":1,"comments":[{"id":"broken"}]}'; } };
          },
          async createWritable() {
            return { async write() {}, async close() {} };
          },
        };
      },
    };
    const store = new DirectoryCommentStore(directory);

    await expect(store.load()).rejects.toThrow('私有评论 JSON schema 校验失败');
  });
});
