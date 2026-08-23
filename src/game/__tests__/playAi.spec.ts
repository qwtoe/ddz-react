import { describe, it, expect } from 'vitest';
import { decompose } from '../../ai/playAi';
import { createDeck } from '../../engine/deck';
import { parseCards } from '../../engine/pattern';
import type { Card } from '../../engine/types';

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

describe('decompose', () => {
  it('王炸保留为独立一手（不被拆成两张单张）', () => {
    const hand = cards([16, 17, 3, 3, 4, 5, 6, 7, 8]);
    const pieces = decompose(hand);
    const rockets = pieces.filter(p => parseCards(p)?.kind === 'rocket');
    expect(rockets).toHaveLength(1);
    // 大小王不出现在任何其他一手牌中
    const jokerIds = hand.filter(c => c.rank >= 16).map(c => c.id);
    for (const piece of pieces) {
      if (parseCards(piece)?.kind === 'rocket') continue;
      for (const c of piece) expect(jokerIds).not.toContain(c.id);
    }
  });

  it('顺子扫描仍限于 3~A（2 与王不进入顺子）', () => {
    const hand = cards([3, 4, 5, 6, 7, 15]);
    const pieces = decompose(hand);
    const straights = pieces.map(p => parseCards(p)!).filter(x => x.kind === 'straight');
    expect(straights.length).toBeGreaterThan(0);
    for (const s of straights) {
      expect(s.cards.every(c => c.rank <= 14)).toBe(true);
    }
    // 2 作为独立单张
    expect(pieces.some(p => p.length === 1 && p[0].rank === 15)).toBe(true);
  });
});
