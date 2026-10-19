import { describe, expect, it } from 'vitest';
import { pageTitle, t } from './index.ts';

describe('app name', () => {
  it('is Casquette', () => {
    expect(t('app.name')).toBe('Casquette');
  });
});

describe('pageTitle', () => {
  it('shows just the app name without a page title', () => {
    expect(pageTitle()).toBe('Casquette');
    expect(pageTitle('')).toBe('Casquette');
  });

  it('puts the page title in front of the app name', () => {
    expect(pageTitle('Rides')).toBe('Rides · Casquette');
  });
});

describe('PR count', () => {
  it('uses the singular for one PR and the plural otherwise', () => {
    expect(t('common.prs', { n: 1 })).toBe('1 PR');
    expect(t('common.prs', { n: 3 })).toBe('3 PRs');
  });
});
