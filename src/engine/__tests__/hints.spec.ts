import { describe, it, expect } from 'vitest';
import { createDeck } from '../deck';
import { parseCards, canBeat } from '../pattern';
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

describe('翼牌方案A（单翼允许同一点数）', () => {
  it('四带二：炸弹+一对 可作两张同点数单翼（5555+33 压 4444+9+10）', () => {
    const hand = cards([5, 5, 5, 5, 3, 3]);
    const last = p([4, 4, 4, 4, 9, 10]);
    const hints = findHints(hand, last);
    const four2s = hints.map(h => parseCards(h)!).filter(x => x.kind === 'four2');
    expect(four2s.some(x => x.keyRank === 5)).toBe(true);
    const ranks = hints.find(h => h.length === 6)?.map(c => c.rank).sort((a, b) => a - b).join(',');
    expect(ranks).toBe('3,3,5,5,5,5');
  });

  it('四带二：两张不同点数单翼仍被枚举（不回归）', () => {
    const hand = cards([5, 5, 5, 5, 3, 4, 6, 7]);
    const last = p([4, 4, 4, 4, 8, 9]);
    const hints = findHints(hand, last);
    const four2s = hints.map(h => parseCards(h)!).filter(x => x.kind === 'four2');
    expect(four2s.some(x => x.keyRank === 5)).toBe(true);
  });

  it('飞机带单：单翼来自同一外点数（555666+77 压 333444+8+9）', () => {
    const hand = cards([5, 5, 5, 6, 6, 6, 7, 7]);
    const last = p([3, 3, 3, 4, 4, 4, 8, 9]);
    const hints = findHints(hand, last);
    const plane1s = hints.map(h => parseCards(h)!).filter(x => x.kind === 'plane1');
    expect(plane1s.some(x => x.keyRank === 6 && x.length === 2)).toBe(true);
    const ranks = hints.find(h => h.length === 8)?.map(c => c.rank).sort((a, b) => a - b).join(',');
    expect(ranks).toBe('5,5,5,6,6,6,7,7');
  });

  it('一致性回归：解析器接受且能压过上家、但旧版 findHints 枚举不出', () => {
    // 注：3333 作主体无法压过任何四带二，故用可压过的对等构造 5555+33 / 555666+77
    const cases = [
      { hand: [5, 5, 5, 5, 3, 3], last: [4, 4, 4, 4, 9, 10], kind: 'four2', keyRank: 5 },
      { hand: [5, 5, 5, 6, 6, 6, 7, 7], last: [3, 3, 3, 4, 4, 4, 8, 9], kind: 'plane1', keyRank: 6 },
    ] as const;
    for (const { hand, last, kind, keyRank } of cases) {
      const lastPat = p([...last]);
      expect(lastPat?.kind).toBe(kind);
      const myPat = parseCards(cards([...hand]))!;
      expect(canBeat(myPat, lastPat)).toBe(true); // 确实能压过上家
      const hints = findHints(cards([...hand]), lastPat);
      // 至少返回一个等价解：同 kind、同 length、keyRank 更大
      const equiv = hints
        .map(h => parseCards(h)!)
        .find(x => x.kind === kind && x.length === myPat.length && x.keyRank === keyRank);
      expect(equiv, `hand=${hand.join(',')} last=${last.join(',')}`).toBeDefined();
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
