/**
 * File System Access API 句柄持久化。
 *
 * chrome.storage.local 无法直接序列化 FileSystemDirectoryHandle，所以这里
 * 尝试使用 IndexedDB 保存句柄。若浏览器策略不允许，调用方仍可依赖
 * chrome.storage.local 中保存的目录名和状态，并在页面上提示重新连接。
 */

const DATABASE_NAME = 'yuque-private-comments';
const STORE_NAME = 'handles';
const HANDLE_KEY = 'comment-directory';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('无法打开句柄存储'));
  });
}

export async function saveDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(handle, HANDLE_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('无法保存目录句柄'));
  });
  database.close();
}

export async function loadDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  const database = await openDatabase();
  const handle = await new Promise<FileSystemDirectoryHandle | null>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).get(HANDLE_KEY);
    request.onsuccess = () => resolve((request.result as FileSystemDirectoryHandle | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error('无法读取目录句柄'));
  });
  database.close();
  return handle;
}

export async function clearDirectoryHandle(): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(HANDLE_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('无法清理目录句柄'));
  });
  database.close();
}
