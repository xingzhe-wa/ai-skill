/**
 * 评论气泡样式配置。
 *
 * 存储在 chrome.storage.local，content-script 启动时加载并应用。
 * 设置页提供预设主题 + 自定义控件。
 */

export interface BubbleStyle {
  /** 背景色/CSS background 值 */
  background: string;
  /** 正文字体颜色 */
  textColor: string;
  /** 作者标签颜色 */
  accentColor: string;
  /** 正文字号 px */
  fontSize: number;
  /** 字体族 */
  fontFamily: string;
  /** 圆角 px */
  borderRadius: number;
  /** 阴影 CSS 值 */
  boxShadow: string;
  /** 透明度 0-1 */
  opacity: number;
}

export const BUBBLE_STYLE_STORAGE_KEY = 'bubble-style';

/** 预设主题 */
export interface BubbleStylePreset {
  id: string;
  name: string;
  style: BubbleStyle;
}

export const BUBBLE_STYLE_PRESETS: BubbleStylePreset[] = [
  {
    id: 'amber',
    name: '暖阳',
    style: {
      background: 'linear-gradient(135deg, #fffbf0, #fff4e6)',
      textColor: '#3d2b0f',
      accentColor: '#d97706',
      fontSize: 14,
      fontFamily: '-apple-system, "Segoe UI", "Microsoft YaHei", sans-serif',
      borderRadius: 14,
      boxShadow: '0 8px 32px rgba(245, 158, 11, 0.18), 0 2px 8px rgba(0,0,0,0.06)',
      opacity: 0.97,
    },
  },
  {
    id: 'teal',
    name: '清新青',
    style: {
      background: 'rgba(255, 255, 255, 0.96)',
      textColor: '#1a3540',
      accentColor: '#0c7777',
      fontSize: 13,
      fontFamily: '-apple-system, "Segoe UI", "Microsoft YaHei", sans-serif',
      borderRadius: 12,
      boxShadow: '0 8px 32px rgba(28, 58, 64, 0.18)',
      opacity: 0.96,
    },
  },
  {
    id: 'dark',
    name: '暗夜',
    style: {
      background: 'linear-gradient(135deg, #1e293b, #0f172a)',
      textColor: '#e2e8f0',
      accentColor: '#38bdf8',
      fontSize: 14,
      fontFamily: '-apple-system, "Segoe UI", "Microsoft YaHei", sans-serif',
      borderRadius: 12,
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(56, 189, 248, 0.15)',
      opacity: 0.97,
    },
  },
  {
    id: 'sticky',
    name: '便签黄',
    style: {
      background: 'linear-gradient(135deg, #fef9c3, #fef08a)',
      textColor: '#422006',
      accentColor: '#854d0e',
      fontSize: 14,
      fontFamily: '"Georgia", "Cambria", "Times New Roman", serif',
      borderRadius: 4,
      boxShadow: '0 6px 20px rgba(202, 138, 4, 0.25), 2px 2px 4px rgba(0,0,0,0.08)',
      opacity: 0.98,
    },
  },
  {
    id: 'coral',
    name: '珊瑚红',
    style: {
      background: 'linear-gradient(135deg, #fff5f5, #fed7d7)',
      textColor: '#4a1414',
      accentColor: '#e53e3e',
      fontSize: 14,
      fontFamily: '-apple-system, "Segoe UI", "Microsoft YaHei", sans-serif',
      borderRadius: 16,
      boxShadow: '0 8px 32px rgba(229, 62, 62, 0.15), 0 2px 8px rgba(0,0,0,0.06)',
      opacity: 0.97,
    },
  },
  {
    id: 'mint',
    name: '薄荷',
    style: {
      background: 'linear-gradient(135deg, #f0fff4, #c6f6d5)',
      textColor: '#1a3b2e',
      accentColor: '#059669',
      fontSize: 14,
      fontFamily: '-apple-system, "Segoe UI", "Microsoft YaHei", sans-serif',
      borderRadius: 14,
      boxShadow: '0 8px 32px rgba(5, 150, 105, 0.15), 0 2px 8px rgba(0,0,0,0.05)',
      opacity: 0.97,
    },
  },
];

/** 默认样式：暖阳 */
export const DEFAULT_BUBBLE_STYLE: BubbleStyle = BUBBLE_STYLE_PRESETS[0].style;

export function isBubbleStyle(value: unknown): value is BubbleStyle {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.background === 'string' &&
    typeof v.textColor === 'string' &&
    typeof v.accentColor === 'string' &&
    typeof v.fontSize === 'number' &&
    typeof v.fontFamily === 'string' &&
    typeof v.borderRadius === 'number' &&
    typeof v.boxShadow === 'string' &&
    typeof v.opacity === 'number'
  );
}

export function normalizeBubbleStyle(value: unknown): BubbleStyle {
  if (isBubbleStyle(value)) return value;
  return { ...DEFAULT_BUBBLE_STYLE };
}

export async function loadBubbleStyle(): Promise<BubbleStyle> {
  try {
    const result = await chrome.storage.local.get(BUBBLE_STYLE_STORAGE_KEY);
    return normalizeBubbleStyle(result[BUBBLE_STYLE_STORAGE_KEY]);
  } catch {
    return { ...DEFAULT_BUBBLE_STYLE };
  }
}

export async function saveBubbleStyle(style: BubbleStyle): Promise<void> {
  await chrome.storage.local.set({ [BUBBLE_STYLE_STORAGE_KEY]: style });
}
