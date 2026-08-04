import { describe, expect, it } from 'vitest';
import { createConnectDirectoryRequest, type RuntimeRequest } from '../src/shared/messages';

describe('扩展消息类型', () => {
  it('connect-directory 消息只携带目录名，不通过 Chrome message 传目录句柄', () => {
    const request = createConnectDirectoryRequest('我的评论目录');
    const typedRequest: RuntimeRequest = request;

    expect(typedRequest).toEqual({
      type: 'connect-directory',
      directoryName: '我的评论目录',
    });
    expect('handle' in typedRequest).toBe(false);
  });
});
