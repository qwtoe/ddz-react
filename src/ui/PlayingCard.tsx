import type { Card } from '../engine/types';

const SUIT_SYMBOL: Record<string, string> = {
  spade: '♠',
  heart: '♥',
  club: '♣',
  diamond: '♦',
};

const RANK_TEXT: Record<number, string> = {
  3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
  11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2',
};

export function isRed(card: Card): boolean {
  return card.suit === 'heart' || card.suit === 'diamond' ||
    (card.suit === 'joker' && card.rank === 17);
}

export function cardLabel(card: Card): string {
  if (card.suit === 'joker') return card.rank === 16 ? '小王' : '大王';
  return `${RANK_TEXT[card.rank]}${SUIT_SYMBOL[card.suit]}`;
}

interface Props {
  card: Card;
  selected?: boolean;
  faceDown?: boolean;
  small?: boolean;
  onClick?: () => void;
}

export function PlayingCard({ card, selected, faceDown, small, onClick }: Props) {
  const cls = [
    'pcard',
    small ? 'pcard-sm' : '',
    selected ? 'is-selected' : '',
    faceDown ? 'is-back' : '',
    !faceDown && isRed(card) ? 'is-red' : '',
    onClick ? 'is-clickable' : '',
  ].filter(Boolean).join(' ');

  if (faceDown) {
    return <div className={cls} onClick={onClick}><div className="pcard-back-inner" /></div>;
  }

  if (card.suit === 'joker') {
    return (
      <div className={cls} onClick={onClick}>
        <div className={`pcard-joker ${card.rank === 17 ? 'joker-big' : 'joker-small'}`}>
          JOKER
        </div>
        <div className="pcard-joker-star">★</div>
      </div>
    );
  }

  return (
    <div className={cls} onClick={onClick}>
      <div className="pcard-corner">
        <span className="pcard-rank">{RANK_TEXT[card.rank]}</span>
        <span className="pcard-suit">{SUIT_SYMBOL[card.suit]}</span>
      </div>
      <div className="pcard-center">{SUIT_SYMBOL[card.suit]}</div>
    </div>
  );
}
