import { describe, expect, it } from 'vitest';
import {
  BUBBLE_STYLE_PRESETS,
  DEFAULT_BUBBLE_STYLE,
  isBubbleStyle,
  normalizeBubbleStyle,
} from '../src/shared/bubble-style';

describe('气泡样式配置', () => {
  it('DEFAULT_BUBBLE_STYLE 使用第一个预设（暖阳）', () => {
    expect(DEFAULT_BUBBLE_STYLE).toEqual(BUBBLE_STYLE_PRESETS[0].style);
  });

  it('所有预设都有完整的 8 个字段', () => {
    for (const preset of BUBBLE_STYLE_PRESETS) {
      expect(preset.id).toBeTruthy();
      expect(preset.name).toBeTruthy();
      const s = preset.style;
      expect(typeof s.background).toBe('string');
      expect(typeof s.textColor).toBe('string');
      expect(typeof s.accentColor).toBe('string');
      expect(typeof s.fontSize).toBe('number');
      expect(s.fontSize).toBeGreaterThan(0);
      expect(typeof s.fontFamily).toBe('string');
      expect(typeof s.borderRadius).toBe('number');
      expect(s.borderRadius).toBeGreaterThanOrEqual(0);
      expect(typeof s.boxShadow).toBe('string');
      expect(typeof s.opacity).toBe('number');
      expect(s.opacity).toBeGreaterThan(0);
      expect(s.opacity).toBeLessThanOrEqual(1);
    }
  });

  it('isBubbleStyle 对完整对象返回 true', () => {
    expect(isBubbleStyle(DEFAULT_BUBBLE_STYLE)).toBe(true);
  });

  it('isBubbleStyle 对缺失字段返回 false', () => {
    expect(isBubbleStyle(null)).toBe(false);
    expect(isBubbleStyle(undefined)).toBe(false);
    expect(isBubbleStyle('string')).toBe(false);
    expect(isBubbleStyle({ background: '#fff' })).toBe(false);
    expect(isBubbleStyle({ ...DEFAULT_BUBBLE_STYLE, fontSize: 'big' })).toBe(false);
  });

  it('normalizeBubbleStyle 对非法值返回默认', () => {
    expect(normalizeBubbleStyle(null)).toEqual(DEFAULT_BUBBLE_STYLE);
    expect(normalizeBubbleStyle(undefined)).toEqual(DEFAULT_BUBBLE_STYLE);
    expect(normalizeBubbleStyle({ foo: 'bar' })).toEqual(DEFAULT_BUBBLE_STYLE);
  });

  it('normalizeBubbleStyle 对合法值原样返回', () => {
    const custom = { ...DEFAULT_BUBBLE_STYLE, fontSize: 18 };
    expect(normalizeBubbleStyle(custom)).toEqual(custom);
  });

  it('预设中包含亮眼的默认主题', () => {
    const ids = BUBBLE_STYLE_PRESETS.map((p) => p.id);
    expect(ids).toContain('amber');
    expect(ids).toContain('teal');
    expect(ids).toContain('dark');
    expect(ids).toContain('sticky');
    expect(ids).toContain('coral');
    expect(ids).toContain('mint');
  });
});
