import { describe, expect, it } from 'vitest';
import { connectDirectoryFromSettings } from '../src/ui/settings-app';
import { PRIVATE_COMMENTS_FILE_NAME } from '../src/shared/storage';
import type { RuntimeRequest, RuntimeResponse } from '../src/shared/messages';

describe('设置页目录连接流程', () => {
  it('先请求权限和保存 IndexedDB 句柄，再发送不含 handle 的连接消息', async () => {
    const calls: string[] = [];
    const handle = { name: '团队评论目录' } as FileSystemDirectoryHandle;
    const responseState = {
      connected: true,
      directoryName: '团队评论目录',
      fileName: PRIVATE_COMMENTS_FILE_NAME,
      message: '设置成功：已连接 团队评论目录，已准备 private-comments.json / yuque-history.json',
    };

    const response = await connectDirectoryFromSettings(handle, {
      async requestDirectoryAccess(receivedHandle) {
        calls.push('request');
        expect(receivedHandle).toBe(handle);
      },
      async saveDirectoryHandle(receivedHandle) {
        calls.push('save');
        expect(receivedHandle).toBe(handle);
      },
      async sendRuntimeMessage(request: RuntimeRequest): Promise<RuntimeResponse> {
        calls.push('message');
        expect(request).toEqual({
          type: 'connect-directory',
          directoryName: '团队评论目录',
        });
        expect('handle' in request).toBe(false);
        return { ok: true, state: responseState };
      },
    });

    expect(calls).toEqual(['request', 'save', 'message']);
    expect(response).toEqual({ ok: true, state: responseState });
  });
});
