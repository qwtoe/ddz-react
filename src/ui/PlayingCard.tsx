import type { Card } from '../engine/types';
import { isRed, cardAriaLabel, RANK_TEXT, SUIT_SYMBOL } from './cardPresentation';

interface Props {
  card: Card;
  selected?: boolean;
  faceDown?: boolean;
  small?: boolean;
  onClick?: () => void;
}

/**
 * 扑克牌。可交互（传入 onClick）时渲染为语义化按钮，供读屏与键盘操作；
 * 纯展示牌（出牌区、底牌、牌背）保持 div，牌背额外 aria-hidden。
 */
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
    return (
      <div className={cls} aria-hidden="true">
        <div className="pcard-back-inner" />
      </div>
    );
  }

  const face = card.suit === 'joker' ? (
    <>
      <div className={`pcard-joker ${card.rank === 17 ? 'joker-big' : 'joker-small'}`}>
        JOKER
      </div>
      <div className="pcard-joker-star">★</div>
    </>
  ) : (
    <>
      <div className="pcard-corner">
        <span className="pcard-rank">{RANK_TEXT[card.rank]}</span>
        <span className="pcard-suit">{SUIT_SYMBOL[card.suit]}</span>
      </div>
      <div className="pcard-center">{SUIT_SYMBOL[card.suit]}</div>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className={cls}
        data-card-id={card.id}
        aria-pressed={selected ?? false}
        aria-label={cardAriaLabel(card)}
        onClick={onClick}
      >
        {face}
      </button>
    );
  }

  return <div className={cls}>{face}</div>;
}
