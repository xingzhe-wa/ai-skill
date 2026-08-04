/**
 * MV3 service worker。
 *
 * 设置页在用户手势中把目录句柄写入 IndexedDB，后台只接收目录名并恢复句柄，
 * 避免 chrome.runtime message 传输后丢失 FileSystemDirectoryHandle 原型。
 * 后台通过消息向 content script 和设置页提供评论库读写能力，任何文件内容都会
 * 先走 schema 校验。
 */

import {
  createComment,
  deleteComment,
  getCommentsForDocument,
  updateComment,
  type CommentLibrary,
  type CommentPatch,
} from './shared/model';
import {
  DirectoryCommentStore,
  DirectoryHistoryStore,
  HISTORY_FILE_NAME,
  PRIVATE_COMMENTS_FILE_NAME,
  type DirectoryLike,
  verifyDirectoryAccess,
} from './shared/storage';
import { connectSavedDirectoryHandle, getDirectoryReadyMessage } from './shared/directory-connection';
import { loadDirectoryHandle } from './shared/handle-store';
import type { DirectoryState, RuntimeRequest, RuntimeResponse } from './shared/messages';

const SETTINGS_KEY = 'directory-settings';
const DEFAULT_STATE: DirectoryState = {
  connected: false,
  directoryName: '',
  fileName: PRIVATE_COMMENTS_FILE_NAME,
  message: '未连接本地目录',
};

let activeHandle: FileSystemDirectoryHandle | null = null;


function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '本地评论库操作失败';
}

function asDirectoryLike(handle: FileSystemDirectoryHandle): DirectoryLike {
  return handle;
}

async function readSavedState(): Promise<DirectoryState> {
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  const saved = result[SETTINGS_KEY] as Partial<DirectoryState> | undefined;
  return {
    ...DEFAULT_STATE,
    directoryName: saved?.directoryName ?? '',
    message: saved?.message ?? DEFAULT_STATE.message,
  };
}

async function writeSavedState(state: DirectoryState): Promise<void> {
  await chrome.storage.local.set({
    [SETTINGS_KEY]: {
      directoryName: state.directoryName,
      fileName: state.fileName,
      message: state.message,
    },
  });
}

async function hasReadWritePermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  try {
    await verifyDirectoryAccess(asDirectoryLike(handle));
    return true;
  } catch {
    return false;
  }
}

async function getUsableHandle(): Promise<FileSystemDirectoryHandle | null> {
  if (activeHandle && await hasReadWritePermission(activeHandle)) {
    return activeHandle;
  }

  try {
    const savedHandle = await loadDirectoryHandle();
    if (savedHandle && await hasReadWritePermission(savedHandle)) {
      activeHandle = savedHandle;
      return savedHandle;
    }
  } catch {
    // IndexedDB 不可用时使用下方的 chrome.storage.local 状态提示。
  }
  return null;
}

async function getState(): Promise<DirectoryState> {
  const savedState = await readSavedState();
  const handle = await getUsableHandle();
  if (!handle) {
    return savedState;
  }
  return {
    ...savedState,
    connected: true,
    directoryName: handle.name,
    message: getDirectoryReadyMessage(handle.name),
  };
}

async function connectDirectory(
  directoryName: string,
): Promise<DirectoryState> {
  return connectSavedDirectoryHandle(directoryName, {
    loadDirectoryHandle,
    verifyDirectoryAccess,
    writeSavedState,
    activateHandle(handle) {
      activeHandle = handle;
    },
  });
}

async function withStore<T>(operation: (store: DirectoryCommentStore) => Promise<T>): Promise<T> {
  const handle = await getUsableHandle();
  if (!handle) {
    throw new Error('尚未连接本地评论目录，请先在扩展设置中选择目录');
  }
  return operation(new DirectoryCommentStore(asDirectoryLike(handle)));
}

async function withHistoryStore<T>(
  operation: (store: DirectoryHistoryStore) => Promise<T>,
): Promise<T> {
  const handle = await getUsableHandle();
  if (!handle) {
    throw new Error('尚未连接本地评论目录，请先在扩展设置中选择目录');
  }
  return operation(new DirectoryHistoryStore(asDirectoryLike(handle)));
}

async function saveLibrary(library: CommentLibrary): Promise<void> {
  await withStore((store) => store.save(library));
}

async function handleRequest(request: RuntimeRequest): Promise<RuntimeResponse> {
  switch (request.type) {
    case 'get-state':
      return { ok: true, state: await getState() };
    case 'connect-directory':
      return {
        ok: true,
        state: await connectDirectory(request.directoryName),
      };
    case 'record-visit':
      await withHistoryStore((store) => store.recordVisit(request));
      return { ok: true, message: `浏览历史已写入 ${HISTORY_FILE_NAME}` };
    case 'get-history':
      return {
        ok: true,
        history: await withHistoryStore((store) => store.search(request.query ?? '')),
      };
    case 'get-commented-document-keys': {
      const library = await withStore((store) => store.load());
      const counts = new Map<string, number>();
      for (const comment of library.comments) {
        counts.set(comment.documentKey, (counts.get(comment.documentKey) ?? 0) + 1);
      }
      return { ok: true, documentKeys: [...counts.keys()], commentCounts: Object.fromEntries(counts) };
    }
    case 'clear-history':
      await withHistoryStore((store) => store.clear());
      return { ok: true, message: `浏览历史已清空：${HISTORY_FILE_NAME}` };
    case 'get-comments': {
      const library = await withStore((store) => store.load());
      return {
        ok: true,
        library: { ...library, comments: getCommentsForDocument(library, request.documentKey) },
      };
    }
    case 'save-comments':
      await saveLibrary(request.library);
      return { ok: true, message: '评论库已保存' };
    case 'create-comment': {
      const library = await withStore((store) => store.load());
      const comment = createComment(request.draft);
      await saveLibrary({ ...library, comments: [...library.comments, comment] });
      return { ok: true, comment };
    }
    case 'update-comment': {
      const library = await withStore((store) => store.load());
      const updatedLibrary = updateComment(
        library,
        request.commentId,
        request.patch as CommentPatch,
      );
      await saveLibrary(updatedLibrary);
      const comment = updatedLibrary.comments.find((item) => item.id === request.commentId);
      if (!comment) {
        throw new Error('评论不存在');
      }
      return { ok: true, comment };
    }
    case 'delete-comment': {
      const library = await withStore((store) => store.load());
      await saveLibrary(deleteComment(library, request.commentId));
      return { ok: true, message: '评论已删除' };
    }
    case 'import-json':
      return {
        ok: true,
        message: `已导入 ${(await withStore((store) => store.importJson(request.json))).comments.length} 条评论`,
      };
    case 'export-json':
      return { ok: true, json: await withStore((store) => store.exportJson()) };
    case 'open-options':
      await chrome.runtime.openOptionsPage();
      return { ok: true, message: '设置页已打开' };
    default:
      return { ok: false, error: '未知的扩展请求' };
  }
}

chrome.runtime.onMessage.addListener(
  (
    request: RuntimeRequest,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: RuntimeResponse) => void,
  ) => {
    void handleRequest(request)
      .then(sendResponse)
      .catch((error: unknown) => sendResponse({ ok: false, error: errorMessage(error) }));
    return true;
  },
);

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    void chrome.storage.local.set({ [SETTINGS_KEY]: DEFAULT_STATE });
  }
});
