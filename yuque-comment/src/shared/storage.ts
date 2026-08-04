/**
 * 评论库存储实现。
 *
 * MemoryCommentStore 用于单测和 UI 的无浏览器回退；
 * DirectoryCommentStore 只依赖 File System Access API 的最小接口，
 * 因此真实目录和测试替身可以共用同一套导入、导出、schema 校验逻辑。
 */

import {
  clearHistory,
  emptyCommentLibrary,
  emptyHistoryLibrary,
  parseLibraryJson,
  parseHistoryJson,
  recordHistoryVisit,
  searchHistory,
  serializeLibrary,
  serializeHistory,
  type CommentLibrary,
  type HistoryEntry,
  type HistoryLibrary,
  type HistoryVisitDraft,
} from './model';

export const PRIVATE_COMMENTS_FILE_NAME = 'private-comments.json';
export const HISTORY_FILE_NAME = 'yuque-history.json';

export interface CommentStore {
  load(): Promise<CommentLibrary>;
  save(library: CommentLibrary): Promise<void>;
  importJson(json: string): Promise<CommentLibrary>;
  exportJson(): Promise<string>;
}

export interface HistoryStore {
  load(): Promise<HistoryLibrary>;
  save(library: HistoryLibrary): Promise<void>;
  recordVisit(
    draft: HistoryVisitDraft,
    now?: () => string,
  ): Promise<HistoryEntry>;
  search(query: string): Promise<HistoryEntry[]>;
  clear(): Promise<void>;
}

export interface WritableFileLike {
  write(value: string): Promise<void>;
  close(): Promise<void>;
}

export interface FileLike {
  getFile(): Promise<{ text(): Promise<string> }>;
  createWritable(): Promise<WritableFileLike>;
}

export interface DirectoryLike {
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileLike>;
}

export async function verifyDirectoryAccess(directory: DirectoryLike): Promise<void> {
  // 修改前只创建 private-comments.json，连接提示不能保证历史文件已准备。
  // 现在连接验证会依次创建并校验两个固定文件，坏 JSON 仍会阻止静默覆盖。
  const commentFile = await directory.getFileHandle(
    PRIVATE_COMMENTS_FILE_NAME,
    { create: true },
  );
  const commentText = await (await commentFile.getFile()).text();
  if (commentText.trim()) {
    parseLibraryJson(commentText);
  }

  const historyFile = await directory.getFileHandle(
    HISTORY_FILE_NAME,
    { create: true },
  );
  const historyText = await (await historyFile.getFile()).text();
  if (historyText.trim()) {
    parseHistoryJson(historyText);
  }
}

function cloneLibrary(library: CommentLibrary): CommentLibrary {
  return parseLibraryJson(serializeLibrary(library));
}

function cloneHistory(library: HistoryLibrary): HistoryLibrary {
  return parseHistoryJson(serializeHistory(library));
}

function getRecordedEntry(library: HistoryLibrary, documentKey: string): HistoryEntry {
  const entry = library.entries.find((item) => item.documentKey === documentKey);
  if (!entry) {
    throw new Error('浏览历史记录不存在');
  }
  return { ...entry };
}

export class MemoryCommentStore implements CommentStore {
  private library: CommentLibrary = emptyCommentLibrary();

  async load(): Promise<CommentLibrary> {
    return cloneLibrary(this.library);
  }

  async save(library: CommentLibrary): Promise<void> {
    this.library = cloneLibrary(library);
  }

  async importJson(json: string): Promise<CommentLibrary> {
    const library = parseLibraryJson(json);
    await this.save(library);
    return cloneLibrary(library);
  }

  async exportJson(): Promise<string> {
    return serializeLibrary(await this.load());
  }
}

export class MemoryHistoryStore implements HistoryStore {
  private library: HistoryLibrary = emptyHistoryLibrary();

  async load(): Promise<HistoryLibrary> {
    return cloneHistory(this.library);
  }

  async save(library: HistoryLibrary): Promise<void> {
    this.library = cloneHistory(library);
  }

  async recordVisit(
    draft: HistoryVisitDraft,
    now: () => string = () => new Date().toISOString(),
  ): Promise<HistoryEntry> {
    const updated = recordHistoryVisit(this.library, draft, now);
    await this.save(updated);
    return getRecordedEntry(updated, draft.documentKey);
  }

  async search(query: string): Promise<HistoryEntry[]> {
    return searchHistory(this.library, query).map((entry) => ({ ...entry }));
  }

  async clear(): Promise<void> {
    this.library = clearHistory(this.library);
  }
}

export class DirectoryCommentStore implements CommentStore {
  public constructor(private readonly directory: DirectoryLike) {}

  private async getFile(): Promise<FileLike> {
    return this.directory.getFileHandle(PRIVATE_COMMENTS_FILE_NAME, { create: true });
  }

  async load(): Promise<CommentLibrary> {
    const file = await this.getFile();
    const text = (await file.getFile()).text();
    const json = await text;
    return json.trim() ? parseLibraryJson(json) : emptyCommentLibrary();
  }

  async save(library: CommentLibrary): Promise<void> {
    const file = await this.getFile();
    const writable = await file.createWritable();
    await writable.write(serializeLibrary(library));
    await writable.close();
  }

  async importJson(json: string): Promise<CommentLibrary> {
    const library = parseLibraryJson(json);
    await this.save(library);
    return cloneLibrary(library);
  }

  async exportJson(): Promise<string> {
    return serializeLibrary(await this.load());
  }
}

export class DirectoryHistoryStore implements HistoryStore {
  public constructor(private readonly directory: DirectoryLike) {}

  private async getFile(): Promise<FileLike> {
    return this.directory.getFileHandle(HISTORY_FILE_NAME, { create: true });
  }

  async load(): Promise<HistoryLibrary> {
    const file = await this.getFile();
    const text = await (await file.getFile()).text();
    return text.trim() ? parseHistoryJson(text) : emptyHistoryLibrary();
  }

  async save(library: HistoryLibrary): Promise<void> {
    const file = await this.getFile();
    const serialized = serializeHistory(library);
    const existingText = await (await file.getFile()).text();
    if (existingText.trim()) {
      parseHistoryJson(existingText);
    }
    const writable = await file.createWritable();
    await writable.write(serialized);
    await writable.close();
  }

  async recordVisit(
    draft: HistoryVisitDraft,
    now: () => string = () => new Date().toISOString(),
  ): Promise<HistoryEntry> {
    const current = await this.load();
    const updated = recordHistoryVisit(current, draft, now);
    await this.save(updated);
    return getRecordedEntry(updated, draft.documentKey);
  }

  async search(query: string): Promise<HistoryEntry[]> {
    return searchHistory(await this.load(), query);
  }

  async clear(): Promise<void> {
    const current = await this.load();
    await this.save(clearHistory(current));
  }
}
