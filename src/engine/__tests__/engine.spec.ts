import { describe, it, expect } from 'vitest';
import { createDeck } from '../deck';
import { parseCards, canBeat } from '../pattern';
import type { Card } from '../types';

const c = (id: string): Card => {
  const deck = createDeck();
  const found = deck.find(x => x.id === id);
  if (!found) throw new Error(`bad id ${id}`);
  return { ...found };
};
// 快捷构造（同点数不同花色避免 id 冲突）
let seq = 0;
const cards = (ranks: number[]): Card[] =>
  ranks.map(r => {
    if (r === 16) return c('SJ');
    if (r === 17) return c('BJ');
    const suits = ['S', 'H', 'C', 'D'];
    return c(`${suits[seq++ % 4]}${r}`);
  });

describe('createDeck', () => {
  it('54 张且唯一', () => {
    const deck = createDeck();
    expect(deck.length).toBe(54);
    expect(new Set(deck.map(x => x.id)).size).toBe(54);
  });
});

describe('parseCards', () => {
  it.each([
    ['single', [3]],
    ['pair', [5, 5]],
    ['triple', [9, 9, 9]],
    ['triple1', [9, 9, 9, 3]],
    ['triple2', [9, 9, 9, 5, 5]],
    ['straight', [3, 4, 5, 6, 7]],
    ['straight', [10, 11, 12, 13, 14]],
    ['pairStraight', [3, 3, 4, 4, 5, 5]],
    ['plane', [6, 6, 6, 7, 7, 7]],
    ['plane1', [6, 6, 6, 7, 7, 7, 3, 4]],
    ['plane2', [6, 6, 6, 7, 7, 7, 3, 3, 4, 4]],
    ['four2', [8, 8, 8, 8, 3, 5]],
    ['four2pair', [8, 8, 8, 8, 3, 3, 5, 5]],
    ['bomb', [13, 13, 13, 13]],
    ['rocket', [16, 17]],
  ] as const)('%s', (kind, ranks) => {
    expect(parseCards(cards([...ranks]))?.kind).toBe(kind);
  });

  it.each([
    [[3, 4, 5, 6]], // 顺子不足 5 张
    [[12, 13, 14, 15]], // 含 2 的顺子
    [[3, 4, 5, 6, 8]], // 不连续
    [[3, 3, 4, 4]], // 连对不足 3 组
    [[9, 9, 9, 5, 4]], // 5+4 是两张单 → 不是三带二
    [[5, 5, 7]], // 杂牌
    [[15, 15, 15, 15, 3, 4]], // 四带二主体可以是 2 ✓ 这应是合法 four2
  ] as const)('边界 %j', (ranks) => {
    const p = parseCards(cards([...ranks]));
    // 最后一个用例是合法的 four2；其余为 null
    if (ranks.length === 6 && ranks[0] === 15) {
      expect(p?.kind).toBe('four2');
    } else {
      expect(p).toBeNull();
    }
  });

  it('飞机优先解析为更长主体', () => {
    // 333444555666：纯飞机 m=4 而非 plane1 m=3
    const p = parseCards(cards([3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6]));
    expect(p?.kind).toBe('plane');
    expect(p?.length).toBe(4);
  });
});

describe('canBeat', () => {
  const p = (ranks: number[]) => parseCards(cards(ranks))!;

  it('同型比较', () => {
    expect(canBeat(p([4]), p([3]))).toBe(true);
    expect(canBeat(p([3]), p([4]))).toBe(false);
    expect(canBeat(p([4, 4, 4, 5]), p([3, 3, 3, 9]))).toBe(true); // 三带一只比主体
    expect(canBeat(p([4, 5, 6, 7, 8]), p([3, 4, 5, 6, 7]))).toBe(true);
    expect(canBeat(p([3, 4, 5, 6, 7]), p([4, 5, 6, 7, 8]))).toBe(false);
    expect(canBeat(p([3, 4, 5, 6, 7, 8]), p([4, 5, 6, 7, 8, 9]))).toBe(false); // 长度不同
  });

  it('炸弹与王炸', () => {
    expect(canBeat(p([5, 5, 5, 5]), p([14]))).toBe(true); // 炸弹压单张
    expect(canBeat(p([6, 6, 6, 6]), p([5, 5, 5, 5]))).toBe(true); // 炸弹互压
    expect(canBeat(p([16, 17]), p([15, 15, 15, 15]))).toBe(true); // 王炸压炸弹
    expect(canBeat(p([14]), p([16, 17]))).toBe(false); // 王炸最大
    expect(canBeat(p([3, 3, 3, 3]), p([16, 17]))).toBe(false);
  });
});
