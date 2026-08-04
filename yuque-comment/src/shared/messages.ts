import type {
  CommentDraft,
  CommentLibrary,
  CommentPatch,
  HistoryEntry,
  PrivateComment,
} from './model';

export interface DirectoryState {
  connected: boolean;
  directoryName: string;
  fileName: string;
  message: string;
}

export interface ConnectDirectoryRequest {
  type: 'connect-directory';
  directoryName: string;
}

export type RuntimeRequest =
  | { type: 'get-state' }
  | ConnectDirectoryRequest
  | { type: 'record-visit'; url: string; documentKey: string; title: string }
  | { type: 'get-history'; query?: string }
  | { type: 'clear-history' }
  | { type: 'get-commented-document-keys' }
  | { type: 'get-comments'; documentKey: string }
  | { type: 'save-comments'; library: CommentLibrary }
  | { type: 'create-comment'; draft: CommentDraft }
  | { type: 'update-comment'; commentId: string; patch: CommentPatch }
  | { type: 'delete-comment'; commentId: string }
  | { type: 'import-json'; json: string }
  | { type: 'export-json' }
  | { type: 'open-options' };

export type RuntimeResponse =
  | { ok: true; state: DirectoryState }
  | { ok: true; history: HistoryEntry[] }
  | { ok: true; documentKeys: string[]; commentCounts: Record<string, number> }
  | { ok: true; library: CommentLibrary }
  | { ok: true; comment: PrivateComment }
  | { ok: true; json: string }
  | { ok: true; message: string }
  | { ok: false; error: string };

/**
 * Chrome runtime message 只携带可稳定序列化的目录名。
 *
 * 修改前把 FileSystemDirectoryHandle 直接放进消息体，service worker 收到后
 * 可能丢失句柄原型和访问方法。现在设置页直接把句柄写入 IndexedDB，后台收到
 * 本消息后再从同一个句柄仓库恢复。
 */
export function createConnectDirectoryRequest(directoryName: string): ConnectDirectoryRequest {
  return {
    type: 'connect-directory',
    directoryName,
  };
}
