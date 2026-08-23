import type { Card } from '../engine/types';

/** 牌面符号（视觉用） */
export const SUIT_SYMBOL: Record<string, string> = {
  spade: '♠',
  heart: '♥',
  club: '♣',
  diamond: '♦',
};

/** 中文花色（无障碍读屏用） */
const SUIT_CN: Record<string, string> = {
  spade: '黑桃',
  heart: '红桃',
  club: '梅花',
  diamond: '方块',
};

/** 点数文字：10 显示为数字 10，J/Q/K/A/2 用字母 */
export const RANK_TEXT: Record<number, string> = {
  3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
  11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2',
};

export function isRed(card: Card): boolean {
  return card.suit === 'heart' || card.suit === 'diamond' ||
    (card.suit === 'joker' && card.rank === 17);
}

/** 简短牌名，如「黑桃3」「小王」 */
export function cardLabel(card: Card): string {
  if (card.suit === 'joker') return card.rank === 16 ? '小王' : '大王';
  return `${RANK_TEXT[card.rank]}${SUIT_SYMBOL[card.suit]}`;
}

/** 无障碍读屏用的中文牌名：「黑桃 3」「红桃 10」「小王」「大王」 */
export function cardAriaLabel(card: Card): string {
  if (card.suit === 'joker') return card.rank === 16 ? '小王' : '大王';
  return `${SUIT_CN[card.suit]} ${RANK_TEXT[card.rank]}`;
}
