import type { Card, Rank, Suit } from './types';

const SUITS: Suit[] = ['spade', 'heart', 'club', 'diamond'];
const SUIT_PREFIX: Record<Suit, string> = {
  spade: 'S', heart: 'H', club: 'C', diamond: 'D', joker: '',
};

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (let rank = 3; rank <= 15; rank++) {
      deck.push({ id: `${SUIT_PREFIX[suit]}${rank}`, rank: rank as Rank, suit });
    }
  }
  deck.push({ id: 'SJ', rank: 16, suit: 'joker' });
  deck.push({ id: 'BJ', rank: 17, suit: 'joker' });
  return deck;
}

export function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function sortHand(hand: Card[]): Card[] {
  const suitOrder: Record<Suit, number> = { joker: 0, spade: 1, heart: 2, club: 3, diamond: 4 };
  return [...hand].sort((a, b) =>
    b.rank - a.rank || suitOrder[a.suit] - suitOrder[b.suit]
  );
}
