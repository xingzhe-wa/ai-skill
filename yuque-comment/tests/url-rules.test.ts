import { describe, expect, it } from 'vitest';
import {
  isExcludedYuqueUrl,
  isNormalYuqueDocumentUrl,
} from '../src/shared/model';

describe('语雀 URL 排除规则', () => {
  it('排除 hangzhewa 和 dashboard 的精确路径及所有子路径', () => {
    expect(isExcludedYuqueUrl('https://www.yuque.com/hangzhewa/')).toBe(true);
    expect(isExcludedYuqueUrl('https://www.yuque.com/hangzhewa/notes/1?tab=all#top')).toBe(true);
    expect(isExcludedYuqueUrl('https://www.yuque.com/dashboard')).toBe(true);
    expect(isExcludedYuqueUrl('https://www.yuque.com/dashboard/settings')).toBe(true);
  });

  it('不误伤相似路径、其他语雀域名和非 HTTPS 地址', () => {
    expect(isExcludedYuqueUrl('https://www.yuque.com/hangzhewa-other/doc')).toBe(false);
    expect(isExcludedYuqueUrl('https://www.yuque.com/dashboarding')).toBe(false);
    expect(isExcludedYuqueUrl('https://yuque.com/hangzhewa/doc')).toBe(false);
    expect(isExcludedYuqueUrl('http://www.yuque.com/dashboard')).toBe(false);
    expect(isExcludedYuqueUrl('https://example.com/dashboard')).toBe(false);
  });

  it('只有非排除的语雀页面才是可记录和注入的正常页面', () => {
    expect(isNormalYuqueDocumentUrl('https://www.yuque.com/team/book/doc')).toBe(true);
    expect(isNormalYuqueDocumentUrl('https://www.yuque.com/dashboard')).toBe(false);
    expect(isNormalYuqueDocumentUrl('https://example.com/team/book/doc')).toBe(false);
  });
});
