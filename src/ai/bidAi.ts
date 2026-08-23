import type { Card } from '../engine/types';
import { groupByRank } from '../engine/pattern';

/** 根据手牌强度叫分：0=不叫，否则必须大于当前最高叫分 */
export function bidAi(hand: Card[], currentMaxBid: number): 0 | 1 | 2 | 3 {
  const g = groupByRank(hand);
  let strength = 0;
  if (g.has(16) && g.has(17)) strength += 4; // 王炸
  for (const [rank, cards] of g) {
    if (cards.length === 4) strength += 3; // 炸弹
    if (rank === 15) strength += cards.length * 1.5; // 2
    if (rank === 14) strength += cards.length; // A
    if (rank === 13) strength += cards.length * 0.5; // K
  }
  const bid: 0 | 1 | 2 | 3 = strength >= 8 ? 3 : strength >= 6 ? 2 : strength >= 4 ? 1 : 0;
  return bid > currentMaxBid ? bid : 0;
}
