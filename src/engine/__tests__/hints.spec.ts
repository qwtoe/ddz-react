import { describe, it, expect } from 'vitest';
import { createDeck } from '../deck';
import { parseCards } from '../pattern';
import { findHints } from '../hints';
import { calcScore, BASE_SCORE } from '../scoring';
import type { Card } from '../types';

let seq = 0;
const cards = (ranks: number[]): Card[] => {
  const deck = createDeck();
  return ranks.map(r => {
    if (r === 16) return { ...deck.find(x => x.id === 'SJ')! };
    if (r === 17) return { ...deck.find(x => x.id === 'BJ')! };
    const suits = ['S', 'H', 'C', 'D'];
    const id = `${suits[seq++ % 4]}${r}`;
    return { ...deck.find(x => x.id === id)! };
  });
};
const p = (ranks: number[]) => parseCards(cards(ranks))!;

describe('findHints', () => {
  it('首出：能给出单张、对子、顺子等', () => {
    const hand = cards([3, 3, 4, 5, 6, 7, 8]);
    const hints = findHints(hand, null);
    const kinds = new Set(hints.map(h => parseCards(h)!.kind));
    expect(kinds.has('single')).toBe(true);
    expect(kinds.has('pair')).toBe(true);
    expect(kinds.has('straight')).toBe(true);
  });

  it('跟单张：只给更大的单张+炸弹', () => {
    const hand = cards([3, 9, 14, 15, 15, 15, 15]);
    const hints = findHints(hand, p([8]));
    for (const h of hints) {
      const pat = parseCards(h)!;
      expect(['single', 'bomb', 'rocket']).toContain(pat.kind);
      if (pat.kind === 'single') expect(pat.keyRank).toBeGreaterThan(8);
    }
    // 必须包含 A 和 2 的单张
    const keys = hints.map(h => parseCards(h)!.keyRank);
    expect(keys).toContain(14);
    expect(keys).toContain(15);
  });

  it('被王炸压制时无解', () => {
    const hand = cards([3, 4, 5]);
    expect(findHints(hand, p([16, 17]))).toHaveLength(0);
  });

  it('跟顺子：长度必须一致', () => {
    const hand = cards([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    const hints = findHints(hand, p([4, 5, 6, 7, 8]));
    for (const h of hints) {
      const pat = parseCards(h)!;
      if (pat.kind === 'straight') expect(pat.length).toBe(5);
    }
    expect(hints.length).toBeGreaterThan(0);
  });

  it('首出不主动拆炸弹', () => {
    const hand = cards([3, 3, 3, 3, 5]);
    const hints = findHints(hand, null);
    for (const h of hints) {
      // 不应出现"两张3"这种拆炸弹的对子
      const pat = parseCards(h)!;
      if (pat.kind === 'pair') expect(pat.keyRank).not.toBe(3);
    }
  });
});

describe('calcScore', () => {
  it('底分×叫分×炸弹×春天', () => {
    expect(calcScore(BASE_SCORE, 1, 0, false)).toBe(100);
    expect(calcScore(BASE_SCORE, 3, 0, false)).toBe(300);
    expect(calcScore(BASE_SCORE, 2, 1, false)).toBe(400);
    expect(calcScore(BASE_SCORE, 2, 2, true)).toBe(1600);
  });
});
