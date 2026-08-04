import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearDirectoryHandle,
  loadDirectoryHandle,
  saveDirectoryHandle,
} from '../src/shared/handle-store';

function installFakeIndexedDb(): void {
  const values = new Map<IDBValidKey, unknown>();

  const database = {
    createObjectStore() {
      return {};
    },
    transaction() {
      const transaction = {
        error: null,
        oncomplete: null as ((event: Event) => void) | null,
        onerror: null as ((event: Event) => void) | null,
        objectStore() {
          return {
            put(value: unknown, key: IDBValidKey) {
              values.set(key, value);
              queueMicrotask(() => transaction.oncomplete?.({} as Event));
              return {} as IDBRequest;
            },
            get(key: IDBValidKey) {
              const request = {
                result: undefined,
                error: null,
                onsuccess: null as ((event: Event) => void) | null,
                onerror: null as ((event: Event) => void) | null,
              } as IDBRequest<unknown>;
              queueMicrotask(() => {
                (request as { result: unknown }).result = values.get(key);
                request.onsuccess?.({} as Event);
              });
              return request;
            },
            delete(key: IDBValidKey) {
              values.delete(key);
              queueMicrotask(() => transaction.oncomplete?.({} as Event));
              return {} as IDBRequest;
            },
          } as IDBObjectStore;
        },
      } as unknown as IDBTransaction;
      return transaction;
    },
    close() {},
  } as unknown as IDBDatabase;

  const indexedDb = {
    open() {
      const request = {
        result: database,
        error: null,
        onsuccess: null as ((event: Event) => void) | null,
        onerror: null as ((event: Event) => void) | null,
        onupgradeneeded: null as ((event: IDBVersionChangeEvent) => void) | null,
      } as IDBOpenDBRequest;
      queueMicrotask(() => {
        request.onupgradeneeded?.({} as IDBVersionChangeEvent);
        request.onsuccess?.({} as Event);
      });
      return request;
    },
  } as unknown as IDBFactory;

  vi.stubGlobal('indexedDB', indexedDb);
}

describe('File System Access 句柄存储', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('设置页保存的目录句柄可以被后台重新读取', async () => {
    installFakeIndexedDb();
    const handle = { name: '评论目录' } as FileSystemDirectoryHandle;

    await saveDirectoryHandle(handle);

    await expect(loadDirectoryHandle()).resolves.toBe(handle);
  });

  it('清理后后台读取不到旧目录句柄', async () => {
    installFakeIndexedDb();
    const handle = { name: '评论目录' } as FileSystemDirectoryHandle;
    await saveDirectoryHandle(handle);

    await clearDirectoryHandle();

    await expect(loadDirectoryHandle()).resolves.toBeNull();
  });
});
