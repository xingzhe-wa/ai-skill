/**
 * 设置页与 MV3 service worker 之间的目录连接边界。
 *
 * 设置页负责在用户手势中获取权限并把 FileSystemDirectoryHandle 写入
 * IndexedDB；后台只接收目录名，再通过本 helper 恢复、验证和记录状态。
 * 依赖均可注入，便于单测覆盖“设置页保存、后台恢复”的完整顺序。
 */

import type { DirectoryState } from './messages';
import {
  HISTORY_FILE_NAME,
  PRIVATE_COMMENTS_FILE_NAME,
  type DirectoryLike,
} from './storage';

export interface SavedDirectoryConnectionDependencies {
  loadDirectoryHandle(): Promise<FileSystemDirectoryHandle | null>;
  verifyDirectoryAccess(handle: DirectoryLike): Promise<void>;
  writeSavedState(state: DirectoryState): Promise<void>;
  activateHandle?(handle: FileSystemDirectoryHandle): void;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '未知错误';
}

export function getDirectoryReadyMessage(directoryName: string): string {
  return `设置成功：已连接 ${directoryName}，已准备 ${PRIVATE_COMMENTS_FILE_NAME} / ${HISTORY_FILE_NAME}`;
}

export async function connectSavedDirectoryHandle(
  directoryName: string,
  dependencies: SavedDirectoryConnectionDependencies,
): Promise<DirectoryState> {
  let handle: FileSystemDirectoryHandle | null;
  try {
    handle = await dependencies.loadDirectoryHandle();
  } catch (error) {
    throw new Error(`读取已保存目录句柄失败：${getErrorMessage(error)}`);
  }

  if (!handle) {
    throw new Error('未找到已保存的目录句柄，请在设置页重新选择目录');
  }

  try {
    await dependencies.verifyDirectoryAccess(handle);
  } catch (error) {
    throw new Error(`目录访问验证失败：${getErrorMessage(error)}`);
  }

  const resolvedDirectoryName = directoryName.trim() || handle.name;
  const state: DirectoryState = {
    connected: true,
    directoryName: resolvedDirectoryName,
    fileName: PRIVATE_COMMENTS_FILE_NAME,
    message: getDirectoryReadyMessage(resolvedDirectoryName),
  };

  try {
    await dependencies.writeSavedState(state);
  } catch (error) {
    throw new Error(`连接状态保存失败：${getErrorMessage(error)}`);
  }

  dependencies.activateHandle?.(handle);
  return state;
}
