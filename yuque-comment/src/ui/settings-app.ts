import '../styles/settings.css';
import {
  getDocumentKey,
  isNormalYuqueDocumentUrl,
  type HistoryEntry,
} from '../shared/model';
import {
  BUBBLE_STYLE_PRESETS,
  DEFAULT_BUBBLE_STYLE,
  loadBubbleStyle,
  saveBubbleStyle,
  type BubbleStyle,
} from '../shared/bubble-style';
import {
  DEFAULT_EXCLUDED_PATHS,
  getUserExcludedPaths,
  normalizePath,
  loadExcludedPaths,
  saveUserExcludedPaths,
} from '../shared/excluded-paths';
import { getDirectoryReadyMessage } from '../shared/directory-connection';
import {
  HISTORY_FILE_NAME,
  PRIVATE_COMMENTS_FILE_NAME,
} from '../shared/storage';
import { saveDirectoryHandle } from '../shared/handle-store';
import { createConnectDirectoryRequest } from '../shared/messages';
import { sendRuntimeMessage } from '../shared/runtime';
import type { DirectoryState, RuntimeRequest, RuntimeResponse } from '../shared/messages';

interface WindowWithDirectoryPicker extends Window {
  showDirectoryPicker?: (options?: {
    mode?: 'read' | 'readwrite';
  }) => Promise<FileSystemDirectoryHandle>;
}

interface PermissionedDirectoryHandle extends FileSystemDirectoryHandle {
  queryPermission?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>;
}

async function requestDirectoryAccess(handle: FileSystemDirectoryHandle): Promise<void> {
  const permissioned = handle as PermissionedDirectoryHandle;
  if (permissioned.queryPermission) {
    const current = await permissioned.queryPermission({ mode: 'readwrite' });
    if (current === 'granted') {
      return;
    }
  }
  if (permissioned.requestPermission) {
    const permission = await permissioned.requestPermission({ mode: 'readwrite' });
    if (permission !== 'granted') {
      throw new Error('未获得本地目录读写权限');
    }
  }
}

export interface SettingsDirectoryConnectionDependencies {
  requestDirectoryAccess(handle: FileSystemDirectoryHandle): Promise<void>;
  saveDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void>;
  sendRuntimeMessage(request: RuntimeRequest): Promise<RuntimeResponse>;
}

/**
 * 设置页必须在用户点击触发的页面上下文中完成权限申请和 IndexedDB 持久化。
 *
 * 修改前把目录句柄交给 chrome.runtime.sendMessage，后台可能收到丢失原型的普通
 * 对象。现在严格按“权限 -> 保存句柄 -> 仅发送目录名”的顺序连接目录。
 */
export async function connectDirectoryFromSettings(
  handle: FileSystemDirectoryHandle,
  dependencies: SettingsDirectoryConnectionDependencies = {
    requestDirectoryAccess,
    saveDirectoryHandle,
    sendRuntimeMessage,
  },
): Promise<RuntimeResponse> {
  await dependencies.requestDirectoryAccess(handle);
  await dependencies.saveDirectoryHandle(handle);
  return dependencies.sendRuntimeMessage(createConnectDirectoryRequest(handle.name));
}

function createElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tagName);
  if (className) {
    element.className = className;
  }
  return element;
}

function setStatus(
  statusElement: HTMLElement,
  state: DirectoryState,
  connectedClass: string,
): void {
  statusElement.replaceChildren();
  const indicator = createElement('span', `status-indicator ${connectedClass}`);
  const title = createElement('strong');
  title.textContent = state.connected ? '已连接本地目录' : '未连接本地目录';
  const detail = createElement('span', 'status-detail');
  detail.textContent = state.connected && state.directoryName
    ? `${state.directoryName} · ${PRIVATE_COMMENTS_FILE_NAME} / ${HISTORY_FILE_NAME}`
    : `${state.message} · 文件名：${state.fileName}`;
  statusElement.append(indicator, title, detail);
}

function downloadJson(json: string): void {
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = createElement('a');
  link.href = url;
  link.download = PRIVATE_COMMENTS_FILE_NAME;
  link.click();
  URL.revokeObjectURL(url);
}

function formatHistoryTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' });
}

export function mountSettingsApp(root: HTMLElement, compact = false): void {
  root.replaceChildren();

  const shell = createElement('main', compact ? 'settings-shell compact' : 'settings-shell');
  const header = createElement('header', 'settings-header');
  const eyebrow = createElement('span', 'eyebrow');
  eyebrow.textContent = 'YUQUE / PRIVATE NOTES';
  const heading = createElement('h1');
  heading.textContent = '私有评论库';
  const intro = createElement('p', 'settings-intro');
  intro.textContent = '评论只写入你选择的本地目录，不经过语雀接口。';
  header.append(eyebrow, heading, intro);

  const statusSection = createElement('section', 'settings-section');
  const statusHeading = createElement('h2');
  statusHeading.textContent = '本地目录';
  const status = createElement('div', 'connection-status');
  const statusFeedback = createElement('p', 'status-feedback');
  statusFeedback.setAttribute('role', 'status');
  const connectionLog = createElement('div', 'connection-log');
  connectionLog.setAttribute('aria-label', '本地目录连接记录');
  const actions = createElement('div', 'settings-actions');
  const chooseButton = createElement('button', 'button button-primary');
  chooseButton.type = 'button';
  chooseButton.textContent = '选择或创建目录';
  const refreshButton = createElement('button', 'button button-secondary');
  refreshButton.type = 'button';
  refreshButton.textContent = '刷新状态';
  actions.append(chooseButton, refreshButton);
  statusSection.append(statusHeading, status, actions, statusFeedback, connectionLog);

  const ioSection = createElement('section', 'settings-section');
  const ioHeading = createElement('h2');
  ioHeading.textContent = '数据迁移';
  const ioIntro = createElement('p', 'section-note');
  ioIntro.textContent = '导入会替换当前目录中的评论库；导出生成可在其他电脑导入的 JSON 文件。';
  const ioActions = createElement('div', 'settings-actions');
  const importLabel = createElement('label', 'button button-secondary file-button');
  importLabel.textContent = '导入 JSON';
  const importInput = createElement('input');
  importInput.type = 'file';
  importInput.accept = 'application/json,.json';
  importLabel.append(importInput);
  const exportButton = createElement('button', 'button button-secondary');
  exportButton.type = 'button';
  exportButton.textContent = '导出全部评论';
  ioActions.append(importLabel, exportButton);
  ioSection.append(ioHeading, ioIntro, ioActions);

  // ── 气泡样式配置 ──
  const bubbleSection = createElement('section', 'settings-section bubble-section');
  const bubbleHeading = createElement('h2');
  bubbleHeading.textContent = '气泡样式';
  const bubbleIntro = createElement('p', 'section-note');
  bubbleIntro.textContent = '自定义评论弹窗的外观。选择预设主题或逐项调整。';
  const presetGrid = createElement('div', 'preset-grid');
  const previewWrap = createElement('div', 'preview-wrap');
  const customControls = createElement('div', 'custom-controls');
  bubbleSection.append(bubbleHeading, bubbleIntro, presetGrid, previewWrap, customControls);

  // ── 排除路径配置 ──
  const excludeSection = createElement('section', 'settings-section exclude-section');
  const excludeHeading = createElement('h2');
  excludeHeading.textContent = '排除路径';
  const excludeIntro = createElement('p', 'section-note');
  excludeIntro.textContent = '以下路径的语雀页面不会注入评论面板、不记录浏览历史。默认路径不可删除。';
  const excludeListWrap = createElement('div', 'exclude-list-wrap');
  const excludeAddRow = createElement('div', 'exclude-add-row');
  const excludeInput = createElement('input', 'exclude-input');
  excludeInput.type = 'text';
  excludeInput.placeholder = '例如 /my-docs 或 / org/secret';
  excludeInput.setAttribute('aria-label', '新增排除路径');
  const excludeAddButton = createElement('button', 'button button-primary');
  excludeAddButton.type = 'button';
  excludeAddButton.textContent = '添加';
  excludeAddRow.append(excludeInput, excludeAddButton);
  excludeSection.append(excludeHeading, excludeIntro, excludeListWrap, excludeAddRow);

  const historySection = createElement('section', 'settings-section history-section');
  const historyHeading = createElement('h2');
  historyHeading.textContent = '浏览历史';
  const historyIntro = createElement('p', 'section-note');
  historyIntro.textContent = '只展示你评论过的文档。历史数据写入当前目录中的 yuque-history.json，不使用浏览器缓存或服务器。';
  const historyToolbar = createElement('div', 'history-toolbar');
  const historySearch = createElement('input', 'history-search');
  historySearch.type = 'search';
  historySearch.placeholder = '搜索标题或文档地址';
  historySearch.setAttribute('aria-label', '搜索浏览历史');
  const historyRefreshButton = createElement('button', 'button button-secondary');
  historyRefreshButton.type = 'button';
  historyRefreshButton.textContent = '刷新';
  const historyClearButton = createElement('button', 'button button-danger');
  historyClearButton.type = 'button';
  historyClearButton.textContent = '清空全部历史';
  historyToolbar.append(historySearch, historyRefreshButton, historyClearButton);
  const historyList = createElement('div', 'history-list');
  historySection.append(historyHeading, historyIntro, historyToolbar, historyList);

  const feedback = createElement('p', 'feedback');
  feedback.setAttribute('role', 'status');

  if (compact) {
    const optionsButton = createElement('button', 'text-button');
    optionsButton.type = 'button';
    optionsButton.textContent = '在独立设置页打开';
    optionsButton.addEventListener('click', () => {
      void sendRuntimeMessage({ type: 'open-options' });
    });
    shell.append(header, statusSection, ioSection, optionsButton, feedback);
  } else {
    shell.append(header, statusSection, ioSection, bubbleSection, excludeSection, historySection, feedback);
  }
  root.append(shell);

  function setDirectoryFeedback(
    message: string,
    kind: 'info' | 'success' | 'warning' | 'error',
    record = false,
  ): void {
    statusFeedback.className = `status-feedback status-feedback-${kind}`;
    statusFeedback.textContent = message;
    if (!record) {
      return;
    }

    const entry = createElement('p', `connection-log-entry connection-log-entry-${kind}`);
    entry.textContent = message;
    connectionLog.prepend(entry);
    while (connectionLog.childElementCount > 3) {
      connectionLog.lastElementChild?.remove();
    }
  }

  function renderHistory(entries: HistoryEntry[], commentCounts?: Map<string, number>): void {
    historyList.replaceChildren();
    if (entries.length === 0) {
      const empty = createElement('p', 'history-empty');
      empty.textContent = historySearch.value.trim()
        ? '没有匹配的已评论文档。'
        : '还没有评论过的文档。';
      historyList.append(empty);
      return;
    }

    entries.forEach((entry) => {
      let safeUrl: string;
      try {
        safeUrl = getDocumentKey(entry.url);
        if (!isNormalYuqueDocumentUrl(safeUrl)) {
          return;
        }
      } catch {
        return;
      }

      const item = createElement('article', 'history-item');
      const commentCount = commentCounts?.get(entry.documentKey) ?? 0;
      if (commentCount >= 3) {
        item.classList.add('hot');
      }
      const titleLink = createElement('a', 'history-title');
      titleLink.href = safeUrl;
      titleLink.target = '_blank';
      titleLink.rel = 'noopener noreferrer';
      titleLink.textContent = entry.title || '无标题文档';
      const meta = createElement('div', 'history-meta');
      const visited = createElement('time');
      visited.dateTime = entry.visitedAt;
      visited.textContent = formatHistoryTime(entry.visitedAt);
      const count = createElement('span', 'visit-count');
      count.textContent = `访问 ${entry.visitCount} 次`;
      const commentSpan = createElement('span', 'history-comment-count');
      commentSpan.textContent = `${commentCount} 条评论`;
      meta.append(visited, count, commentSpan);
      const url = createElement('div', 'history-url');
      url.textContent = safeUrl;
      const openLink = createElement('a', 'text-button history-open-link');
      openLink.href = safeUrl;
      openLink.target = '_blank';
      openLink.rel = 'noopener noreferrer';
      openLink.textContent = '打开文档';
      item.append(titleLink, meta, url, openLink);
      historyList.append(item);
    });
  }

  const renderState = async (
    reason: 'initial' | 'refresh' = 'initial',
  ): Promise<DirectoryState | null> => {
    let response;
    try {
      response = await sendRuntimeMessage({ type: 'get-state' });
    } catch (error) {
      const message = error instanceof Error ? error.message : '后台服务暂不可用';
      setDirectoryFeedback(
        `${reason === 'refresh' ? '刷新失败' : '状态读取失败'}：${message}`,
        'error',
        true,
      );
      setStatus(status, { connected: false, directoryName: '', fileName: PRIVATE_COMMENTS_FILE_NAME, message }, 'status-indicator-error');
      return null;
    }
    if (!response.ok || !('state' in response)) {
      const message = response.ok ? '状态读取失败' : response.error;
      setDirectoryFeedback(
        `${reason === 'refresh' ? '刷新失败' : '状态读取失败'}：${message}`,
        'error',
        true,
      );
      setStatus(status, {
        connected: false,
        directoryName: '',
        fileName: PRIVATE_COMMENTS_FILE_NAME,
        message,
      }, 'status-indicator-error');
      return null;
    }
    setStatus(status, response.state, response.state.connected ? 'status-indicator-ok' : 'status-indicator-warn');
    if (response.state.connected) {
      setDirectoryFeedback(
        reason === 'refresh'
          ? `刷新成功：已连接 ${response.state.directoryName}，已准备 ${PRIVATE_COMMENTS_FILE_NAME} / ${HISTORY_FILE_NAME}`
          : response.state.message,
        'success',
        true,
      );
    } else {
      setDirectoryFeedback(
        `${reason === 'refresh' ? '刷新结果' : '当前状态'}：未连接本地目录。${response.state.message}`,
        'warning',
        true,
      );
    }
    return response.state;
  };

  let historyRequestSequence = 0;
  const renderHistoryData = async (query = historySearch.value): Promise<void> => {
    const requestSequence = ++historyRequestSequence;
    try {
      // 同时获取历史和已评论文档的 key 列表
      const [historyResponse, keysResponse] = await Promise.all([
        sendRuntimeMessage({ type: 'get-history', query }),
        sendRuntimeMessage({ type: 'get-commented-document-keys' }),
      ]);
      if (requestSequence !== historyRequestSequence) {
        return;
      }
      if (!historyResponse.ok || !('history' in historyResponse)) {
        historyList.replaceChildren();
        const empty = createElement('p', 'history-empty');
        empty.textContent = historyResponse.ok ? '浏览历史暂不可用。' : historyResponse.error;
        historyList.append(empty);
        return;
      }
      const commentedKeys = keysResponse.ok && 'documentKeys' in keysResponse
        ? new Set(keysResponse.documentKeys)
        : new Set<string>();
      const commentCounts = keysResponse.ok && 'commentCounts' in keysResponse
        ? new Map(Object.entries(keysResponse.commentCounts))
        : new Map<string, number>();
      // 只展示有评论的文档
      const filtered = historyResponse.history.filter((entry) => commentedKeys.has(entry.documentKey));
      renderHistory(filtered, commentCounts);
    } catch (error) {
      if (requestSequence !== historyRequestSequence) {
        return;
      }
      historyList.replaceChildren();
      const empty = createElement('p', 'history-empty');
      empty.textContent = error instanceof Error ? error.message : '浏览历史加载失败';
      historyList.append(empty);
    }
  };

  chooseButton.addEventListener('click', async () => {
    const picker = (window as WindowWithDirectoryPicker).showDirectoryPicker;
    if (!picker) {
      setDirectoryFeedback(
        '连接失败：当前浏览器不支持 File System Access API，请使用新版 Chrome。',
        'error',
        true,
      );
      return;
    }
    chooseButton.disabled = true;
    setDirectoryFeedback('正在请求目录权限…', 'info');
    feedback.textContent = '';
    try {
      const handle = await picker({ mode: 'readwrite' });
      setDirectoryFeedback('正在保存目录授权并验证本地数据文件…', 'info');
      const response = await connectDirectoryFromSettings(handle);
      if (!response.ok || !('state' in response)) {
        const message = response.ok ? '连接结果缺少状态信息' : response.error;
        setDirectoryFeedback(
          `连接失败：${message}。请确认已选择目录并允许读写。`,
          'error',
          true,
        );
        setStatus(status, { connected: false, directoryName: handle.name, fileName: PRIVATE_COMMENTS_FILE_NAME, message }, 'status-indicator-error');
        return;
      }
      setDirectoryFeedback(
        getDirectoryReadyMessage(response.state.directoryName),
        'success',
        true,
      );
      setStatus(status, response.state, 'status-indicator-ok');
      await renderHistoryData();
    } catch (error) {
      const message = error instanceof Error ? error.message : '目录选择失败';
      setDirectoryFeedback(
        `连接失败：${message}。请重新选择一个可读写目录。`,
        'error',
        true,
      );
      setStatus(status, { connected: false, directoryName: '', fileName: PRIVATE_COMMENTS_FILE_NAME, message }, 'status-indicator-error');
    } finally {
      chooseButton.disabled = false;
    }
  });

  refreshButton.addEventListener('click', () => {
    void renderState('refresh');
  });

  if (!compact) {
    historySearch.addEventListener('input', () => {
      void renderHistoryData();
    });
    historyRefreshButton.addEventListener('click', () => {
      void renderHistoryData();
    });
    historyClearButton.addEventListener('click', async () => {
      if (!window.confirm('确定清空全部浏览历史吗？此操作不可撤销。')) {
        return;
      }
      historyClearButton.disabled = true;
      try {
        const response = await sendRuntimeMessage({ type: 'clear-history' });
        feedback.textContent = response.ok ? '浏览历史已清空。' : response.error;
        if (response.ok) {
          await renderHistoryData('');
        }
      } catch (error) {
        feedback.textContent = error instanceof Error ? error.message : '浏览历史清空失败';
      } finally {
        historyClearButton.disabled = false;
      }
    });
  }

  importInput.addEventListener('change', async () => {
    const file = importInput.files?.[0];
    if (!file) {
      return;
    }
    try {
      const response = await sendRuntimeMessage({
        type: 'import-json',
        json: await file.text(),
      });
      feedback.textContent = !response.ok
        ? response.error
        : 'message' in response
          ? response.message
          : '导入完成';
      await renderState();
    } catch (error) {
      feedback.textContent = error instanceof Error ? error.message : '导入失败';
    } finally {
      importInput.value = '';
    }
  });

  exportButton.addEventListener('click', async () => {
    exportButton.disabled = true;
    try {
      const response = await sendRuntimeMessage({ type: 'export-json' });
      if (response.ok && 'json' in response) {
        downloadJson(response.json);
        feedback.textContent = '评论库已导出。';
      } else {
        feedback.textContent = response.ok ? '导出失败' : response.error;
      }
    } catch (error) {
      feedback.textContent = error instanceof Error ? error.message : '导出失败';
    } finally {
      exportButton.disabled = false;
    }
  });

  // ── 气泡样式 UI 逻辑 ──
  let currentStyle: BubbleStyle = { ...DEFAULT_BUBBLE_STYLE };

  function applyPreview(style: BubbleStyle): void {
    currentStyle = style;
    // 更新预览气泡
    const preview = previewWrap.querySelector('.ipb-preview');
    if (preview instanceof HTMLElement) {
      preview.style.background = style.background;
      preview.style.borderRadius = `${style.borderRadius}px`;
      preview.style.boxShadow = style.boxShadow;
      preview.style.fontFamily = style.fontFamily;
      preview.style.opacity = String(style.opacity);
      const body = preview.querySelector('.ipb-body');
      if (body instanceof HTMLElement) {
        body.style.color = style.textColor;
        body.style.fontSize = `${style.fontSize}px`;
      }
      const author = preview.querySelector('.ipb-author');
      if (author instanceof HTMLElement) {
        author.style.color = style.accentColor;
      }
    }
    // 同步自定义控件值
    const updateInput = (id: string, value: string | number): void => {
      const input = customControls.querySelector(`#${id}`) as HTMLInputElement | null;
      if (input) input.value = String(value);
    };
    updateInput('bubble-bg', style.background);
    updateInput('bubble-text', style.textColor);
    updateInput('bubble-accent', style.accentColor);
    updateInput('bubble-size', style.fontSize);
    updateInput('bubble-radius', style.borderRadius);
    updateInput('bubble-opacity', style.opacity);
    updateInput('bubble-shadow', style.boxShadow);
  }

  function buildPreviewBubble(): HTMLElement {
    const bubble = createElement('div', 'ipb-preview');
    const head = createElement('div', 'ipb-header');
    const author = createElement('span', 'ipb-author');
    author.textContent = '预览作者';
    const time = createElement('span', 'ipb-time');
    time.textContent = '刚刚';
    head.append(author, time);
    const body = createElement('div', 'ipb-body');
    body.textContent = '这是一条评论内容的预览效果。选中正文后点击评论即可在原文旁弹出此气泡。';
    bubble.append(head, body);
    return bubble;
  }

  function buildCustomControls(): void {
    const items: Array<{ id: string; label: string; type: string; getter: (s: BubbleStyle) => string | number }> = [
      { id: 'bubble-bg', label: '背景', type: 'text', getter: (s) => s.background },
      { id: 'bubble-text', label: '文字颜色', type: 'color-or-text', getter: (s) => s.textColor },
      { id: 'bubble-accent', label: '强调色', type: 'color-or-text', getter: (s) => s.accentColor },
      { id: 'bubble-size', label: '字号 px', type: 'number', getter: (s) => s.fontSize },
      { id: 'bubble-radius', label: '圆角 px', type: 'number', getter: (s) => s.borderRadius },
      { id: 'bubble-opacity', label: '透明度 0-1', type: 'number', getter: (s) => s.opacity },
      { id: 'bubble-shadow', label: '阴影', type: 'text', getter: (s) => s.boxShadow },
    ];
    items.forEach((item) => {
      const field = createElement('div', 'custom-field');
      const label = createElement('label');
      label.htmlFor = item.id;
      label.textContent = item.label;
      const input = createElement('input');
      input.id = item.id;
      if (item.type === 'number') {
        input.type = 'number';
      } else if (item.type === 'color-or-text') {
        input.type = 'color';
      } else {
        input.type = 'text';
      }
      input.value = String(item.getter(currentStyle));
      input.addEventListener('input', () => {
        const v = input.value;
        if (item.id === 'bubble-bg') currentStyle = { ...currentStyle, background: v };
        else if (item.id === 'bubble-text') currentStyle = { ...currentStyle, textColor: v };
        else if (item.id === 'bubble-accent') currentStyle = { ...currentStyle, accentColor: v };
        else if (item.id === 'bubble-size') currentStyle = { ...currentStyle, fontSize: Number(v) || 13 };
        else if (item.id === 'bubble-radius') currentStyle = { ...currentStyle, borderRadius: Number(v) || 12 };
        else if (item.id === 'bubble-opacity') currentStyle = { ...currentStyle, opacity: Math.max(0, Math.min(1, Number(v) || 0.96)) };
        else if (item.id === 'bubble-shadow') currentStyle = { ...currentStyle, boxShadow: v };
        applyPreview(currentStyle);
        void saveBubbleStyle(currentStyle);
      });
      field.append(label, input);
      customControls.append(field);
    });
    // 字体族选择
    const fontField = createElement('div', 'custom-field');
    const fontLabel = createElement('label');
    fontLabel.htmlFor = 'bubble-font';
    fontLabel.textContent = '字体';
    const fontSelect = createElement('select');
    fontSelect.id = 'bubble-font';
    const fontOptions = [
      { value: '-apple-system, "Segoe UI", "Microsoft YaHei", sans-serif', label: '系统默认' },
      { value: '"Georgia", "Cambria", serif', label: '衬线' },
      { value: '"Courier New", monospace', label: '等宽' },
      { value: '"Comic Sans MS", "楷体", cursive', label: '手写' },
    ];
    fontOptions.forEach((opt) => {
      const option = createElement('option');
      option.value = opt.value;
      option.textContent = opt.label;
      if (currentStyle.fontFamily === opt.value) option.selected = true;
      fontSelect.append(option);
    });
    fontSelect.addEventListener('change', () => {
      currentStyle = { ...currentStyle, fontFamily: fontSelect.value };
      applyPreview(currentStyle);
      void saveBubbleStyle(currentStyle);
    });
    fontField.append(fontLabel, fontSelect);
    customControls.append(fontField);
  }

  function buildPresets(): void {
    BUBBLE_STYLE_PRESETS.forEach((preset) => {
      const card = createElement('button', 'preset-card');
      card.type = 'button';
      card.textContent = preset.name;
      card.style.background = preset.style.background;
      card.style.borderRadius = `${preset.style.borderRadius}px`;
      card.style.boxShadow = preset.style.boxShadow;
      card.style.color = preset.style.textColor;
      card.addEventListener('click', () => {
        currentStyle = { ...preset.style };
        applyPreview(currentStyle);
        void saveBubbleStyle(currentStyle);
        // 高亮选中的预设
        presetGrid.querySelectorAll('.preset-card').forEach((el) => el.classList.remove('active'));
        card.classList.add('active');
      });
      presetGrid.append(card);
    });
  }

  if (!compact) {
    buildPresets();
    previewWrap.append(buildPreviewBubble());
    buildCustomControls();
    void loadBubbleStyle().then((style) => {
      applyPreview(style);
    });
  }

  // ── 排除路径 UI 逻辑 ──
  function renderExcludeList(allPaths: string[]): void {
    excludeListWrap.innerHTML = '';
    const userPaths = getUserExcludedPaths(allPaths);

    // 默认路径（不可删除）
    const defaultGroup = createElement('div', 'exclude-group');
    const defaultLabel = createElement('span', 'exclude-group-label');
    defaultLabel.textContent = '默认';
    DEFAULT_EXCLUDED_PATHS.forEach((p) => {
      const tag = createElement('div', 'exclude-tag default-tag');
      const code = createElement('code');
      code.textContent = p;
      const lock = createElement('span', 'tag-lock');
      lock.textContent = '内置';
      tag.append(code, lock);
      defaultGroup.append(tag);
    });
    defaultGroup.prepend(defaultLabel);

    // 用户自定义路径
    const userGroup = createElement('div', 'exclude-group');
    if (userPaths.length > 0) {
      const userLabel = createElement('span', 'exclude-group-label');
      userLabel.textContent = '自定义';
      userPaths.forEach((p) => {
        const tag = createElement('div', 'exclude-tag user-tag');
        const code = createElement('code');
        code.textContent = p;
        const delBtn = createElement('button', 'tag-delete');
        delBtn.type = 'button';
        delBtn.textContent = '×';
        delBtn.title = '删除此路径';
        delBtn.setAttribute('aria-label', `删除 ${p}`);
        delBtn.addEventListener('click', async () => {
          const remaining = userPaths.filter((up) => up !== p);
          await saveUserExcludedPaths(remaining);
          const refreshed = await loadExcludedPaths();
          renderExcludeList(refreshed);
        });
        tag.append(code, delBtn);
        userGroup.append(tag);
      });
      userGroup.prepend(userLabel);
    }
    excludeListWrap.append(defaultGroup, userGroup);
  }

  async function addUserPath(): Promise<void> {
    const raw = excludeInput.value.trim();
    if (!raw) return;
    const normalized = normalizePath(raw);
    if (!normalized) return;
    const allPaths = await loadExcludedPaths();
    if (allPaths.includes(normalized)) {
      excludeInput.value = '';
      return;
    }
    const userPaths = getUserExcludedPaths(allPaths);
    userPaths.push(normalized);
    await saveUserExcludedPaths(userPaths);
    excludeInput.value = '';
    const refreshed = await loadExcludedPaths();
    renderExcludeList(refreshed);
  }

  if (!compact) {
    excludeAddButton.addEventListener('click', () => {
      void addUserPath();
    });
    excludeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void addUserPath();
      }
    });
    void loadExcludedPaths().then((allPaths) => {
      renderExcludeList(allPaths);
    });
  }

  void renderState();
  if (!compact) {
    void renderHistoryData();
  }
}
