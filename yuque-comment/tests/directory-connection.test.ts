import { describe, expect, it } from 'vitest';
import { connectSavedDirectoryHandle } from '../src/shared/directory-connection';
import { PRIVATE_COMMENTS_FILE_NAME } from '../src/shared/storage';
import type { DirectoryState } from '../src/shared/messages';

describe('后台目录连接恢复流程', () => {
  it('从 IndexedDB 读取设置页保存的句柄，验证后写入连接状态', async () => {
    const handle = { name: '句柄目录' } as FileSystemDirectoryHandle;
    let verifiedHandle: FileSystemDirectoryHandle | null = null;
    let savedState: DirectoryState | null = null;

    const state = await connectSavedDirectoryHandle('设置页目录名', {
      async loadDirectoryHandle() {
        return handle;
      },
      async verifyDirectoryAccess(receivedHandle) {
        verifiedHandle = receivedHandle as FileSystemDirectoryHandle;
      },
      async writeSavedState(nextState) {
        savedState = nextState;
      },
    });

    expect(verifiedHandle).toBe(handle);
    expect(savedState).toEqual(state);
    expect(state).toEqual({
      connected: true,
      directoryName: '设置页目录名',
      fileName: PRIVATE_COMMENTS_FILE_NAME,
      message: '设置成功：已连接 设置页目录名，已准备 private-comments.json / yuque-history.json',
    });
  });

  it('没有可恢复句柄时给出明确错误', async () => {
    await expect(connectSavedDirectoryHandle('丢失目录', {
      async loadDirectoryHandle() {
        return null;
      },
      async verifyDirectoryAccess() {
        throw new Error('不应验证空句柄');
      },
      async writeSavedState() {
        throw new Error('失败时不应写入连接状态');
      },
    })).rejects.toThrow('未找到已保存的目录句柄，请在设置页重新选择目录');
  });
});
