import type { Card, CardPattern } from '../engine/types';
import { parseCards, groupByRank } from '../engine/pattern';
import { findHints } from '../engine/hints';

export interface PlayContext {
  seat: 0 | 1 | 2;
  landlordSeat: 0 | 1 | 2 | null;
  lastPlaySeat: 0 | 1 | 2 | null;
  handCounts: [number, number, number];
}

function teammateOf(seat: 0 | 1 | 2, landlordSeat: 0 | 1 | 2): 0 | 1 | 2 {
  // 两个农民互为队友
  const farmers = ([0, 1, 2] as const).filter(s => s !== landlordSeat);
  return farmers.find(s => s !== seat)!;
}

function cost(cards: Card[]): number {
  const p = parseCards(cards);
  if (!p) return 999;
  let c = p.keyRank;
  if (p.kind === 'bomb') c += 100;
  if (p.kind === 'rocket') c += 200;
  return c;
}

/** 贪心分解手牌为若干手，用于首出选择 */
export function decompose(hand: Card[]): Card[][] {
  const g = new Map<Card['rank'], Card[]>();
  for (const [r, cards] of groupByRank(hand)) g.set(r, [...cards]);
  const has = (r: number, n: number) => (g.get(r as Card['rank'])?.length ?? 0) >= n && r <= 14;
  const take = (r: number, n: number): Card[] => {
    const arr = g.get(r as Card['rank'])!;
    return arr.splice(0, n);
  };

  const pieces: Card[][] = [];

  // 炸弹、王炸保留为独立一手
  for (const [r, cards] of [...g.entries()]) {
    if (cards.length === 4) pieces.push(take(r, 4));
  }
  if (has(16, 1) && g.get(17)?.length) {
    pieces.push([...take(16, 1), ...take(17, 1)]);
  }

  // 飞机（连续三张 >=2 组）
  for (;;) {
    let found = false;
    for (let start = 3; start + 1 <= 14; start++) {
      let len = 0;
      while (start + len <= 14 && has(start + len, 3)) len++;
      if (len >= 2) {
        const run: Card[] = [];
        for (let r = start; r < start + Math.min(len, 5); r++) run.push(...take(r, 3));
        pieces.push(run);
        found = true;
        break;
      }
    }
    if (!found) break;
  }

  // 顺子（>=5）
  for (;;) {
    let found = false;
    for (let start = 3; start + 4 <= 14; start++) {
      let len = 0;
      while (start + len <= 14 && has(start + len, 1)) len++;
      if (len >= 5) {
        const run: Card[] = [];
        for (let r = start; r < start + Math.min(len, 12); r++) run.push(...take(r, 1));
        pieces.push(run);
        found = true;
        break;
      }
    }
    if (!found) break;
  }

  // 连对（>=3 组）
  for (;;) {
    let found = false;
    for (let start = 3; start + 2 <= 14; start++) {
      let len = 0;
      while (start + len <= 14 && has(start + len, 2)) len++;
      if (len >= 3) {
        const run: Card[] = [];
        for (let r = start; r < start + Math.min(len, 10); r++) run.push(...take(r, 2));
        pieces.push(run);
        found = true;
        break;
      }
    }
    if (!found) break;
  }

  // 三张：尽量带最小翼牌
  for (const [r, cards] of [...g.entries()]) {
    if (cards.length >= 3) {
      const body = take(r, 3);
      // 找最小单张或对子做翼牌
      const singles = [...g.entries()]
        .filter(([rr, cs]) => rr !== r && cs.length > 0)
        .sort((a, b) => a[0] - b[0]);
      if (singles.length > 0) {
        const [wr] = singles[0];
        body.push(...take(wr, 1));
      }
      pieces.push(body);
    }
  }

  // 对子、单张
  for (const [r, cards] of [...g.entries()]) {
    if (cards.length >= 2) pieces.push(take(r, 2));
    if (cards.length >= 1) pieces.push(take(r, cards.length));
  }

  return pieces.filter(p => p.length > 0);
}

export function playAi(
  hand: Card[],
  lastPlay: CardPattern | null,
  ctx: PlayContext
): Card[] | null {
  const hints = findHints(hand, lastPlay);

  // 首出
  if (!lastPlay) {
    const whole = parseCards(hand);
    if (whole) return hand; // 一手出完直接赢
    const pieces = decompose(hand);
    const nonBomb = pieces.filter(p => {
      const pat = parseCards(p);
      return pat && pat.kind !== 'bomb' && pat.kind !== 'rocket';
    });
    const pool = nonBomb.length ? nonBomb : pieces;
    // 优先出含最小牌且张数多的一手
    pool.sort((a, b) => {
      const minA = Math.min(...a.map(c => c.rank));
      const minB = Math.min(...b.map(c => c.rank));
      return minA - minB || b.length - a.length;
    });
    return pool[0];
  }

  if (!hints.length) return null;

  // 能一手出完立即出
  const winNow = hints.find(h => h.length === hand.length);
  if (winNow) return winNow;

  const isFarmer = ctx.landlordSeat !== null && ctx.seat !== ctx.landlordSeat;
  const teammate = isFarmer && ctx.landlordSeat !== null
    ? teammateOf(ctx.seat, ctx.landlordSeat)
    : null;

  const nonBomb = hints.filter(h => {
    const p = parseCards(h)!;
    return p.kind !== 'bomb' && p.kind !== 'rocket';
  });

  // 农民不压队友的大牌；队友快走完时让牌
  if (teammate !== null && ctx.lastPlaySeat === teammate) {
    if (lastPlay.keyRank >= 11) return null;
    if ((ctx.handCounts[teammate] ?? 99) <= 6) return null;
  }

  // 对手只剩很少牌时，允许用炸弹压制
  const opponentLow = ctx.landlordSeat === null
    ? false
    : isFarmer
      ? ctx.handCounts[ctx.landlordSeat] <= 2
      : Math.min(ctx.handCounts[(ctx.seat + 1) % 3], ctx.handCounts[(ctx.seat + 2) % 3]) <= 2;

  let pool = nonBomb.length ? nonBomb : hints;
  if (!opponentLow) {
    const nb = pool.filter(h => {
      const p = parseCards(h)!;
      return p.kind !== 'bomb' && p.kind !== 'rocket';
    });
    if (nb.length) pool = nb;
  }

  pool = [...pool].sort((a, b) => cost(a) - cost(b));
  return pool[0];
}
