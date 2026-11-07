import { describe, expect, it } from 'vitest';
import { withArticle } from './text';

describe('withArticle', () => {
  it('picks a or an by the sound the name starts with', () => {
    expect(withArticle('Campus')).toBe('a Campus');
    expect(withArticle('Encampment')).toBe('an Encampment');
    expect(withArticle('Industrial Zone')).toBe('an Industrial Zone');
    expect(withArticle('economic')).toBe('an economic');
    expect(withArticle('University')).toBe('a University');
  });
});
