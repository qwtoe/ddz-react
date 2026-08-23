import type { Card, CardPattern, Rank } from './types';
import { groupByRank } from './pattern';

const MAX_RUN_RANK = 14;

/**
 * 枚举所有合法出牌。
 * last === null 时为首出，返回手牌能组成的常见牌型（不主动拆炸弹）。
 */
export function findHints(hand: Card[], last: CardPattern | null): Card[][] {
  const out: Card[][] = [];
  const seen = new Set<string>();
  const push = (cards: Card[]) => {
    if (!cards.length) return;
    const k = cards.map(c => c.id).sort().join(',');
    if (!seen.has(k)) {
      seen.add(k);
      out.push(cards);
    }
  };

  const g = groupByRank(hand);
  const ranks = [...g.keys()].sort((a, b) => a - b);
  // 首出时可临时收窄的候选点数（避免拆炸弹/王炸）
  let activeRanks: Rank[] = ranks;
  const pick = (r: Rank, cnt: number): Card[] => g.get(r)!.slice(0, cnt);
  const has = (r: Rank, cnt: number) => (g.get(r)?.length ?? 0) >= cnt;

  // ---- 单张 / 对子 / 三张系列 ----
  const genSingles = (minRank: number) => {
    for (const r of activeRanks) if (r > minRank) push(pick(r, 1));
  };
  const genPairs = (minRank: number) => {
    for (const r of activeRanks) if (r > minRank && has(r, 2)) push(pick(r, 2));
  };
  const genTriples = (minRank: number, withWings: 'none' | 'single' | 'pair') => {
    for (const r of activeRanks) {
      if (r <= minRank || !has(r, 3)) continue;
      if (withWings === 'none') {
        push(pick(r, 3));
        continue;
      }
      const body = pick(r, 3);
      if (withWings === 'single') {
        for (const w of ranks) {
          if (w === r) continue;
          push([...body, ...pick(w, 1)]);
        }
      } else {
        for (const w of ranks) {
          if (w === r || !has(w, 2)) continue;
          push([...body, ...pick(w, 2)]);
        }
      }
    }
  };

  // ---- 顺子 / 连对 / 飞机（连续 run 枚举）----
  const runRanks = (need: number, minRank: number, len: number): Rank[][] => {
    const res: Rank[][] = [];
    for (let start = Math.max(3, minRank + 1); start + len - 1 <= MAX_RUN_RANK; start++) {
      let ok = true;
      for (let r = start; r < start + len; r++) {
        if (!activeRanks.includes(r as Rank) || !has(r as Rank, need)) { ok = false; break; }
      }
      if (ok) {
        const run: Rank[] = [];
        for (let r = start; r < start + len; r++) run.push(r as Rank);
        res.push(run);
      }
    }
    return res;
  };

  const genStraights = (minRank: number, len?: number) => {
    const lens = len ? [len] : range(5, 12);
    for (const l of lens) {
      for (const run of runRanks(1, minRank, l)) {
        push(run.flatMap(r => pick(r, 1)));
      }
    }
  };
  const genPairStraights = (minRank: number, len?: number) => {
    const lens = len ? [len] : range(3, 10);
    for (const l of lens) {
      for (const run of runRanks(2, minRank, l)) {
        push(run.flatMap(r => pick(r, 2)));
      }
    }
  };
  const genPlanes = (
    minRank: number,
    mLen?: number,
    wings: 'none' | 'single' | 'pair' = 'none'
  ) => {
    const ms = mLen ? [mLen] : range(2, 6);
    for (const m of ms) {
      for (const run of runRanks(3, minRank, m)) {
        const used = new Set(run);
        const body = run.flatMap(r => pick(r, 3));
        if (wings === 'none') {
          push(body);
          continue;
        }
        if (wings === 'single') {
          // 方案A：m 张单翼允许来自同一外点数（不超过该点数实际张数，且不得取自飞机主体点数）
          const flat: Card[] = [];
          for (const r of ranks) {
            if (used.has(r)) continue;
            flat.push(...g.get(r)!);
          }
          flat.sort((a, b) => a.rank - b.rank);
          if (flat.length >= m) push([...body, ...flat.slice(0, m)]);
          continue;
        }
        // 翼牌：对子，从主体外选最小的 m 对（解析器要求各对点数不同）
        const wingPool: Card[][] = [];
        for (const r of ranks) {
          if (used.has(r)) continue;
          if (has(r, 2)) wingPool.push(pick(r, 2));
        }
        wingPool.sort((a, b) => a[0].rank - b[0].rank);
        if (wingPool.length >= m) {
          push([...body, ...wingPool.slice(0, m).flat()]);
        }
      }
    }
  };

  const genBombs = (minRank: number) => {
    for (const r of ranks) if (r > minRank && has(r, 4)) push(pick(r, 4));
  };
  const genRocket = () => {
    if (has(16, 1) && has(17, 1)) push([...pick(16, 1), ...pick(17, 1)]);
  };
  const genFourWith = (minRank: number, wings: 'single' | 'pair') => {
    for (const r of ranks) {
      if (r <= minRank || !has(r, 4)) continue;
      const body = pick(r, 4);
      const pool: Card[][] = [];
      for (const w of ranks) {
        if (w === r) continue;
        if (wings === 'single') pool.push(pick(w, 1));
        else if (has(w, 2)) pool.push(pick(w, 2));
      }
      pool.sort((a, b) => a[0].rank - b[0].rank);
      if (pool.length >= 2) push([...body, ...pool.slice(0, 2).flat()]);
      // 方案A：两张单翼允许来自同一点数（该点数 ≥2 张，如 3333+55 的一对 5 当两张单牌）
      if (wings === 'single') {
        for (const w of ranks) {
          if (w === r || !has(w, 2)) continue;
          push([...body, ...pick(w, 2)]);
        }
      }
    }
  };

  if (!last) {
    // 首出不主动拆炸弹、不拆王炸
    const hasRocketBoth = has(16, 1) && has(17, 1);
    activeRanks = ranks.filter(r => {
      if (g.get(r)!.length === 4) return false;
      if (hasRocketBoth && (r === 16 || r === 17)) return false;
      return true;
    });
    genSingles(0);
    genPairs(0);
    genTriples(0, 'none');
    genStraights(0);
    genPairStraights(0);
    genPlanes(0, undefined, 'none');
    activeRanks = ranks;
    genBombs(0);
    genRocket();
    return out;
  }

  switch (last.kind) {
    case 'rocket':
      break;
    case 'bomb':
      genBombs(last.keyRank);
      genRocket();
      break;
    case 'single':
      genSingles(last.keyRank); addBombs(); break;
    case 'pair':
      genPairs(last.keyRank); addBombs(); break;
    case 'triple':
      genTriples(last.keyRank, 'none'); addBombs(); break;
    case 'triple1':
      genTriples(last.keyRank, 'single'); addBombs(); break;
    case 'triple2':
      genTriples(last.keyRank, 'pair'); addBombs(); break;
    case 'straight':
      genStraights(last.keyRank, last.length); addBombs(); break;
    case 'pairStraight':
      genPairStraights(last.keyRank, last.length); addBombs(); break;
    case 'plane':
      genPlanes(last.keyRank, last.length, 'none'); addBombs(); break;
    case 'plane1':
      genPlanes(last.keyRank, last.length, 'single'); addBombs(); break;
    case 'plane2':
      genPlanes(last.keyRank, last.length, 'pair'); addBombs(); break;
    case 'four2':
      genFourWith(last.keyRank, 'single'); addBombs(); break;
    case 'four2pair':
      genFourWith(last.keyRank, 'pair'); addBombs(); break;
  }

  return out;

  function addBombs() {
    genBombs(0);
    genRocket();
  }
}

function range(from: number, to: number): number[] {
  const res: number[] = [];
  for (let i = from; i <= to; i++) res.push(i);
  return res;
}
