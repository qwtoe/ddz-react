export type Rank =
  | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17;
// 11=J, 12=Q, 13=K, 14=A, 15=2, 16=小王, 17=大王

export type Suit = 'spade' | 'heart' | 'club' | 'diamond' | 'joker';

export interface Card {
  id: string; // 唯一标识，如 "S10", "H3", "SJ"(小王), "BJ"(大王)
  rank: Rank;
  suit: Suit;
}

export type PatternKind =
  | 'single'
  | 'pair'
  | 'triple'
  | 'triple1'
  | 'triple2'
  | 'straight'
  | 'pairStraight'
  | 'plane'
  | 'plane1'
  | 'plane2'
  | 'four2'
  | 'four2pair'
  | 'bomb'
  | 'rocket';

export interface CardPattern {
  kind: PatternKind;
  cards: Card[];
  keyRank: Rank; // 比较用的主体点数
  length?: number; // 顺子/连对/飞机的组数（张数或连数）
}

export const RANK_LABEL: Record<Rank, string> = {
  3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
  11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2', 16: 'w', 17: 'W',
};
