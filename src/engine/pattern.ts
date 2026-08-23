import type { Card, CardPattern, PatternKind, Rank } from './types';

export function groupByRank(cards: Card[]): Map<Rank, Card[]> {
  const m = new Map<Rank, Card[]>();
  for (const c of cards) {
    const arr = m.get(c.rank);
    if (arr) arr.push(c);
    else m.set(c.rank, [c]);
  }
  return m;
}

function mk(kind: PatternKind, cards: Card[], keyRank: Rank, length?: number): CardPattern {
  return { kind, cards, keyRank, length };
}

/** 3~A 的连续性判断上限 */
const MAX_RUN_RANK = 14;

export function parseCards(cards: Card[]): CardPattern | null {
  const n = cards.length;
  if (n === 0) return null;
  const groups = groupByRank(cards);
  const ranks = [...groups.keys()].sort((a, b) => a - b);

  if (n === 1) return mk('single', cards, ranks[0]);

  if (n === 2) {
    if (ranks.length === 1) return mk('pair', cards, ranks[0]);
    if (ranks[0] === 16 && ranks[1] === 17) return mk('rocket', cards, 17);
    return null;
  }

  if (n === 3 && ranks.length === 1) return mk('triple', cards, ranks[0]);
  if (n === 4 && ranks.length === 1) return mk('bomb', cards, ranks[0]);

  // 顺子：>=5 张连续单张，3~A
  if (n >= 5 && ranks.length === n && ranks[n - 1] <= MAX_RUN_RANK &&
      ranks[n - 1] - ranks[0] === n - 1) {
    return mk('straight', cards, ranks[n - 1], n);
  }

  // 连对：>=3 组连续对子，3~A
  if (n >= 6 && n % 2 === 0) {
    const m = n / 2;
    if (ranks.length === m && ranks.every(r => groups.get(r)!.length === 2) &&
        ranks[m - 1] <= MAX_RUN_RANK && ranks[m - 1] - ranks[0] === m - 1) {
      return mk('pairStraight', cards, ranks[m - 1], m);
    }
  }

  // 三带一（4 张：3+1）
  if (n === 4 && ranks.length === 2) {
    const [a, b] = ranks;
    if (groups.get(a)!.length === 3) return mk('triple1', cards, a);
    if (groups.get(b)!.length === 3) return mk('triple1', cards, b);
    return null;
  }

  // 三带二（5 张：3+2）
  if (n === 5 && ranks.length === 2) {
    const [a, b] = ranks;
    if (groups.get(a)!.length === 3 && groups.get(b)!.length === 2) return mk('triple2', cards, a);
    if (groups.get(b)!.length === 3 && groups.get(a)!.length === 2) return mk('triple2', cards, b);
    return null;
  }

  // 四带二单（6 张：4+2 任意单张）
  if (n === 6) {
    const quad = ranks.find(r => groups.get(r)!.length === 4);
    if (quad !== undefined) return mk('four2', cards, quad);
  }

  // 四带二对（8 张：4+2 对子）
  if (n === 8) {
    const quad = ranks.find(r => groups.get(r)!.length === 4);
    if (quad !== undefined) {
      const rest = cards.filter(c => c.rank !== quad);
      const rg = groupByRank(rest);
      if ([...rg.values()].every(g => g.length === 2)) return mk('four2pair', cards, quad);
    }
  }

  // 飞机系列
  return tryPlane(cards, groups, ranks, n);
}

function tryPlane(
  cards: Card[],
  groups: Map<Rank, Card[]>,
  ranks: Rank[],
  n: number
): CardPattern | null {
  // 纯飞机：所有牌恰好是 >=2 组连续三张（3~A）
  if (n >= 6 && n % 3 === 0) {
    const m = n / 3;
    if (ranks.length === m && ranks.every(r => groups.get(r)!.length === 3) &&
        ranks[m - 1] <= MAX_RUN_RANK && ranks[m - 1] - ranks[0] === m - 1) {
      return mk('plane', cards, ranks[m - 1], m);
    }
  }

  const tripleRanks = ranks.filter(r => r <= MAX_RUN_RANK && groups.get(r)!.length >= 3);

  // 飞机带单：n = 4m；飞机带对：n = 5m。m 从大到小尝试（优先更长主体）
  for (let m = Math.floor(n / 4); m >= 2; m--) {
    for (let i = 0; i + m <= tripleRanks.length; i++) {
      const run = tripleRanks.slice(i, i + m);
      if (run[m - 1] - run[0] !== m - 1) continue;
      const used = new Set(run);
      const taken = new Map<Rank, number>();
      const restCards: Card[] = [];
      for (const c of cards) {
        if (used.has(c.rank)) {
          const t = taken.get(c.rank) ?? 0;
          if (t < 3) { taken.set(c.rank, t + 1); continue; }
        }
        restCards.push(c);
      }
      if (n === 4 * m && restCards.length === m) {
        return mk('plane1', cards, run[m - 1], m);
      }
      if (n === 5 * m && restCards.length === 2 * m) {
        const rg = groupByRank(restCards);
        if ([...rg.values()].every(g => g.length === 2)) {
          return mk('plane2', cards, run[m - 1], m);
        }
      }
    }
  }
  return null;
}

export function canBeat(candidate: CardPattern, last: CardPattern | null): boolean {
  if (!last) return true;
  if (candidate.kind === 'rocket') return true;
  if (last.kind === 'rocket') return false;
  if (candidate.kind === 'bomb') {
    return last.kind !== 'bomb' || candidate.keyRank > last.keyRank;
  }
  if (last.kind === 'bomb') return false;
  if (candidate.kind !== last.kind) return false;
  if (candidate.length !== last.length) return false;
  return candidate.keyRank > last.keyRank;
}
