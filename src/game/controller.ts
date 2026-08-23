import type { Card, CardPattern } from '../engine/types';
import { createDeck, shuffle, sortHand } from '../engine/deck';
import { parseCards, canBeat } from '../engine/pattern';
import { findHints } from '../engine/hints';
import { BASE_SCORE, calcScore } from '../engine/scoring';
import { bidAi, playAi } from '../ai';

export type Phase = 'idle' | 'bidding' | 'playing' | 'over';
export type Seat = 0 | 1 | 2;

export interface PlayerView {
  seat: Seat;
  name: string;
  handCount: number;
  isHuman: boolean;
}

export interface PlayRecord {
  seat: Seat;
  cards: Card[];
  pass: boolean;
}

export interface GameState {
  phase: Phase;
  players: PlayerView[];
  landlord: Seat | null;
  bottomCards: Card[];
  lastPlay: { seat: Seat; pattern: CardPattern } | null;
  /** 当前实际需要压过的牌（连续两家不要后为 null，即首出） */
  toBeat: { seat: Seat; pattern: CardPattern } | null;
  currentPlayer: Seat | null;
  currentBid: number;
  bidMultiplier: number;
  bombCount: number;
  history: PlayRecord[];
  winner: 'landlord' | 'farmer' | null;
  spring: boolean;
  scoreDelta: [number, number, number];
}

interface GameOptions {
  aiDelayMs?: number;
  autoPlay?: boolean;
  /** 每次叫分后触发（含 AI），参数为座位与叫分（0=不叫） */
  onBid?: (seat: Seat, score: 0 | 1 | 2 | 3) => void;
}

export class DdzGame {
  private opts: Required<Pick<GameOptions, 'aiDelayMs' | 'autoPlay'>>;
  private onBidCb: ((seat: Seat, score: 0 | 1 | 2 | 3) => void) | null = null;
  private listeners = new Set<(s: GameState) => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private gen = 0;

  private hands: [Card[], Card[], Card[]] = [[], [], []];
  private phase: Phase = 'idle';
  private landlord: Seat | null = null;
  private bottomCards: Card[] = [];
  private lastPlay: { seat: Seat; pattern: CardPattern } | null = null;
  private passStreak = 0;
  private currentPlayer: Seat | null = null;
  private bidMax = 0;
  private bidWinner: Seat | null = null;
  private bidTurn: Seat = 0;
  private bidCount = 0;
  private bombCount = 0;
  private playCounts: [number, number, number] = [0, 0, 0];
  private history: PlayRecord[] = [];
  private winner: 'landlord' | 'farmer' | null = null;
  private spring = false;
  private scoreDelta: [number, number, number] = [0, 0, 0];

  private hintIdx = 0;
  private hintKey = '';

  constructor(opts: GameOptions = {}) {
    this.opts = { aiDelayMs: 600, autoPlay: true, ...opts };
    this.onBidCb = opts.onBid ?? null;
    this.cachedState = this.buildState();
  }

  /** 缓存的不可变快照：useSyncExternalStore 要求 getSnapshot 返回稳定引用 */
  private cachedState: GameState;

  getState(): GameState {
    return this.cachedState;
  }

  /**
   * 动态玩家名：叫地主前都显示"农民"；
   * 确定地主后，地主显示"地主"，农民按序编号，主角（seat 0）是农民时固定为"农民 1"
   */
  private nameFor(seat: Seat): string {
    if (this.landlord === null) return '农民';
    if (seat === this.landlord) return '地主';
    const other = ([0, 1, 2] as const).filter(s => s !== this.landlord && s !== seat)[0];
    // 主角是农民时主角为农民 1；否则按座位顺序编号
    if (this.landlord !== 0) {
      return seat === 0 ? '农民 1' : '农民 2';
    }
    return seat < other ? '农民 1' : '农民 2';
  }

  private buildState(): GameState {
    return {
      phase: this.phase,
      players: ([0, 1, 2] as const).map(seat => ({
        seat,
        name: this.nameFor(seat),
        handCount: this.hands[seat].length,
        isHuman: seat === 0,
      })) as [PlayerView, PlayerView, PlayerView],
      landlord: this.landlord,
      bottomCards: [...this.bottomCards],
      lastPlay: this.lastPlay ? { ...this.lastPlay } : null,
      toBeat: this.passStreak >= 2 || !this.lastPlay ? null : { ...this.lastPlay },
      currentPlayer: this.currentPlayer,
      currentBid: this.bidMax,
      bidMultiplier: Math.max(1, this.bidMax),
      bombCount: this.bombCount,
      history: [...this.history],
      winner: this.winner,
      spring: this.spring,
      scoreDelta: [...this.scoreDelta] as [number, number, number],
    };
  }

  /** 真人默认 seat 0；测试/调试可取任意座位手牌 */
  getHand(seat: Seat = 0): Card[] {
    return sortHand(this.hands[seat]);
  }

  subscribe(fn: (s: GameState) => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit() {
    this.cachedState = this.buildState();
    const s = this.cachedState;
    for (const fn of this.listeners) fn(s);
  }

  private clearTimer() {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  start(): void {
    this.clearTimer();
    const gen = ++this.gen;
    const deck = shuffle(createDeck());
    this.hands = [
      sortHand(deck.slice(0, 17)),
      sortHand(deck.slice(17, 34)),
      sortHand(deck.slice(34, 51)),
    ];
    this.bottomCards = deck.slice(51);
    this.phase = 'bidding';
    this.landlord = null;
    this.lastPlay = null;
    this.passStreak = 0;
    this.currentPlayer = null;
    this.bidMax = 0;
    this.bidWinner = null;
    this.bidTurn = (Math.floor(Math.random() * 3)) as Seat;
    this.bidCount = 0;
    this.currentPlayer = this.bidTurn;
    this.bombCount = 0;
    this.playCounts = [0, 0, 0];
    this.history = [];
    this.winner = null;
    this.spring = false;
    this.scoreDelta = [0, 0, 0];
    this.hintIdx = 0;
    this.hintKey = '';
    this.emit();
    this.scheduleAI(gen);
  }

  /** 叫分。UI 层保证真人只在轮到自己时调用；autoPlay=false 时测试可驱动任意座位 */
  bid(score: 0 | 1 | 2 | 3): boolean {
    if (this.phase !== 'bidding') return false;
    const gen = this.gen;
    this.onBidCb?.(this.bidTurn, score);
    if (score > this.bidMax) {
      this.bidMax = score;
      this.bidWinner = this.bidTurn;
    }
    this.bidCount++;
    if (score === 3 || this.bidCount === 3) {
      if (this.bidWinner === null) {
        this.start(); // 全不叫重新发牌
        return true;
      }
      this.becomeLandlord(this.bidWinner);
      return true;
    }
    this.bidTurn = ((this.bidTurn + 1) % 3) as Seat;
    this.currentPlayer = this.bidTurn;
    this.emit();
    this.scheduleAI(gen);
    return true;
  }

  private becomeLandlord(seat: Seat): void {
    this.landlord = seat;
    this.hands[seat] = sortHand([...this.hands[seat], ...this.bottomCards]);
    this.phase = 'playing';
    this.currentPlayer = seat;
    this.emit();
    this.scheduleAI(this.gen);
  }

  /** 出牌。返回 false 表示非法（不出牌不变更状态） */
  play(cardIds: string[]): boolean {
    if (this.phase !== 'playing' || this.currentPlayer === null) return false;
    const gen = this.gen;
    const seat = this.currentPlayer;
    const byId = new Map(this.hands[seat].map(c => [c.id, c]));    const cards: Card[] = [];
    for (const id of cardIds) {
      const c = byId.get(id);
      if (!c) return false;
      cards.push(c);
    }
    const pattern = parseCards(cards);
    if (!pattern) return false;
    const toBeat = this.effectiveLast();
    if (!canBeat(pattern, toBeat ? toBeat.pattern : null)) return false;

    this.hands[seat] = this.hands[seat].filter(c => !cardIds.includes(c.id));
    this.playCounts[seat]++;
    if (pattern.kind === 'bomb' || pattern.kind === 'rocket') this.bombCount++;
    this.history.push({ seat, cards, pass: false });
    this.lastPlay = { seat, pattern };
    this.passStreak = 0;
    this.hintIdx = 0;
    this.hintKey = '';

    if (this.hands[seat].length === 0) {
      this.settle(seat);
      return true;
    }
    this.currentPlayer = ((seat + 1) % 3) as Seat;
    this.emit();
    this.scheduleAI(gen);
    return true;
  }

  /** 过。首出时无效 */
  pass(): boolean {
    if (this.phase !== 'playing' || this.currentPlayer === null) return false;
    if (!this.lastPlay || this.passStreak >= 2) return false;
    const gen = this.gen;
    const seat = this.currentPlayer;
    this.history.push({ seat, cards: [], pass: true });
    this.passStreak++;
    if (this.passStreak >= 2) {
      // 轮回上家首出
      this.currentPlayer = this.lastPlay.seat;
    } else {
      this.currentPlayer = ((seat + 1) % 3) as Seat;
    }
    this.hintIdx = 0;
    this.hintKey = '';
    this.emit();
    this.scheduleAI(gen);
    return true;
  }

  /** 循环给出下一个合法出牌建议（针对当前真人回合） */
  hint(): Card[] | null {
    if (this.phase !== 'playing' || this.currentPlayer !== 0) return null;
    const hand = this.hands[0];
    const toBeat = this.effectiveLast();
    const key = `${hand.length}-${toBeat?.pattern.cards.map(c => c.id).join('') ?? ''}`;
    if (key !== this.hintKey) {
      this.hintKey = key;
      this.hintIdx = 0;
    }
    const list = findHints(hand, toBeat ? toBeat.pattern : null);
    list.sort((a, b) => a.length - b.length || a[0].rank - b[0].rank);
    if (!list.length) return null;
    const res = list[this.hintIdx % list.length];
    this.hintIdx++;
    return res;
  }

  private effectiveLast(): { seat: Seat; pattern: CardPattern } | null {
    if (!this.lastPlay || this.passStreak >= 2) return null;
    return this.lastPlay;
  }

  private settle(winnerSeat: Seat): void {
    this.clearTimer();
    const landlord = this.landlord!;
    const landlordWin = winnerSeat === landlord;
    this.winner = landlordWin ? 'landlord' : 'farmer';
    const farmerPlays = this.playCounts.filter((_, i) => i !== landlord).reduce((a, b) => a + b, 0);
    this.spring =
      (landlordWin && farmerPlays === 0) ||
      (!landlordWin && this.playCounts[landlord] <= 1);
    const total = calcScore(BASE_SCORE, Math.max(1, this.bidMax), this.bombCount, this.spring);
    this.scoreDelta = ([0, 1, 2] as const).map(i => {
      if (i === landlord) return landlordWin ? 2 * total : -2 * total;
      return landlordWin ? -total : total;
    }) as [number, number, number];
    this.phase = 'over';
    this.emit();
  }

  private scheduleAI(gen: number): void {
    if (!this.opts.autoPlay) return;
    this.clearTimer();
    if (gen !== this.gen) return;
    let action: (() => void) | null = null;
    if (this.phase === 'bidding' && this.bidTurn !== 0) {
      action = () => {
        if (gen !== this.gen) return;
        this.bid(bidAi(this.hands[this.bidTurn], this.bidMax) as 0 | 1 | 2 | 3);
      };
    } else if (this.phase === 'playing' && this.currentPlayer !== null && this.currentPlayer !== 0) {
      action = () => {
        if (gen !== this.gen) return;
        this.aiMove(this.currentPlayer!);
      };
    }
    if (action) {
      this.timer = setTimeout(action, this.opts.aiDelayMs + Math.random() * 300);
    }
  }

  private aiMove(seat: Seat): void {
    const s = this.getState();
    const toBeat = this.effectiveLast();
    const ctx = {
      seat,
      landlordSeat: this.landlord,
      lastPlaySeat: this.lastPlay?.seat ?? null,
      handCounts: [s.players[0].handCount, s.players[1].handCount, s.players[2].handCount] as [number, number, number],
    };
    const cards = playAi(this.hands[seat], toBeat ? toBeat.pattern : null, ctx);
    if (cards && cards.length) {
      this.play(cards.map(c => c.id));
    } else {
      this.pass();
    }
  }
}
