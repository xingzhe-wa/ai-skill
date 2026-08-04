import type { RuntimeRequest, RuntimeResponse } from './messages';

/**
 * 统一封装 runtime.sendMessage，确保 popup、options 和 content script
 * 对后台错误使用同一套响应结构。
 */
export async function sendRuntimeMessage(request: RuntimeRequest): Promise<RuntimeResponse> {
  const response = await chrome.runtime.sendMessage<RuntimeRequest, RuntimeResponse>(request);
  if (!response) {
    return { ok: false, error: '后台服务暂不可用，请刷新扩展后重试' };
  }
  return response;
}
