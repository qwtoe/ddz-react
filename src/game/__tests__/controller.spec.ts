import { describe, it, expect, vi } from 'vitest';
import { DdzGame } from '../controller';
import { bidAi, playAi } from '../../ai';

/** mulberry32：固定种子的可复现 PRNG */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 用 AI 驱动三个座位完成一局（autoPlay=false 同步驱动，默认注入固定 seed 保证可复现） */
function simulateOnce(rng: () => number = mulberry32(42)): void {
  const g = new DdzGame({ autoPlay: false, rng });
  g.start();
  let steps = 0;
  while (g.getState().phase !== 'over') {
    if (++steps > 500) throw new Error('game did not terminate in 500 steps');
    const s = g.getState();
    if (s.phase === 'bidding') {
      g.bid(bidAi(g.getHand(s.currentPlayer!), s.currentBid));
      continue;
    }
    const seat = s.currentPlayer!;
    const toBeat = s.toBeat;
    const play = playAi(g.getHand(seat), toBeat ? toBeat.pattern : null, {
      seat,
      landlordSeat: s.landlord,
      lastPlaySeat: s.lastPlay?.seat ?? null,
      handCounts: [s.players[0].handCount, s.players[1].handCount, s.players[2].handCount],
    });
    if (play && play.length) {
      expect(g.play(play.map(x => x.id))).toBe(true);
    } else {
      expect(g.pass()).toBe(true);
    }
  }
  const final = g.getState();
  expect(final.winner).not.toBeNull();
  expect(final.landlord).not.toBeNull();
  // 三家分数变化代数和为 0
  const sum = final.scoreDelta.reduce((a, b) => a + b, 0);
  expect(sum).toBe(0);
  // 从 history 最后一条非 pass 记录确定真实胜者座位
  const lastNonPass = [...final.history].reverse().find(r => !r.pass);
  expect(lastNonPass).toBeDefined();
  const winnerSeat = lastNonPass!.seat;
  // 胜者手牌为 0，其阵营与 state.winner 一致
  expect(g.getHand(winnerSeat)).toHaveLength(0);
  expect(final.winner).toBe(winnerSeat === final.landlord ? 'landlord' : 'farmer');
  // 另两家手牌数非负
  for (const seat of [0, 1, 2] as const) {
    if (seat !== winnerSeat) expect(g.getHand(seat).length).toBeGreaterThanOrEqual(0);
  }
}

describe('AI vs AI 全流程模拟', () => {
  it('200 局全部正常终局（固定 seed，可复现）', () => {
    for (let i = 0; i < 200; i++) {
      simulateOnce(mulberry32(1000 + i));
    }
  });

  it('真实随机 20 局冒烟', () => {
    for (let i = 0; i < 20; i++) {
      simulateOnce(Math.random);
    }
  });
});

describe('DdzGame 基本行为', () => {
  it('非法操作被拒绝且不改变状态', () => {
    const g = new DdzGame({ autoPlay: false });
    expect(g.play(['S3'])).toBe(false); // idle 阶段
    g.start();
    const before = JSON.stringify(g.getState());
    expect(g.pass()).toBe(false); // bidding 阶段不能 pass
    expect(JSON.stringify(g.getState())).toBe(before);
  });

  it('发牌数量正确', () => {
    const g = new DdzGame({ autoPlay: false });
    g.start();
    expect(g.getHand(0)).toHaveLength(17);
    expect(g.getHand(1)).toHaveLength(17);
    expect(g.getHand(2)).toHaveLength(17);
    expect(g.getState().bottomCards).toHaveLength(3);
  });

  it('地主确定后手牌为 20 张', () => {
    const g = new DdzGame({ autoPlay: false });
    g.start();
    let guard = 0;
    while (g.getState().phase === 'bidding' && guard++ < 10) {
      const s = g.getState();
      g.bid(bidAi(g.getHand(s.currentPlayer!), s.currentBid));
    }
    if (g.getState().phase === 'playing') {
      const landlord = g.getState().landlord!;
      expect(g.getHand(landlord)).toHaveLength(20);
    }
  });

  it('play 拒绝空/重复牌 ID/不在手牌的牌，且不改变任何状态', () => {
    const g = new DdzGame({ autoPlay: false });
    g.start();
    expect(g.bid(3)).toBe(true); // 叫 3 分立即成为地主，进入 playing
    const seat = g.getState().landlord!;
    const id = g.getHand(seat)[0].id;
    const before = JSON.stringify(g.getState());
    const handsBefore = [g.getHand(0), g.getHand(1), g.getHand(2)];
    expect(g.play([])).toBe(false); // 空
    expect(g.play([id, id])).toBe(false); // 重复单张不能当对子
    expect(g.play([id, id, id])).toBe(false); // 重复三次不能当三张
    expect(g.play([id, id, id, id])).toBe(false); // 重复四次不能当炸弹
    expect(g.play(['NO-SUCH-1', 'NO-SUCH-2'])).toBe(false); // 不在手牌
    expect(JSON.stringify(g.getState())).toBe(before);
    expect(g.getHand(0)).toEqual(handsBefore[0]);
    expect(g.getHand(1)).toEqual(handsBefore[1]);
    expect(g.getHand(2)).toEqual(handsBefore[2]);
  });

  it('dispose 后挂起的 AI timer 不再触发监听器/状态变更', () => {
    vi.useFakeTimers();
    try {
      const g = new DdzGame({ aiDelayMs: 50, autoPlay: true });
      const cb = vi.fn();
      g.subscribe(cb);
      g.start();
      const callsAfterStart = cb.mock.calls.length;
      g.dispose();
      vi.advanceTimersByTime(100_000);
      expect(cb.mock.calls.length).toBe(callsAfterStart);
      expect(g.getState().phase).toBe('bidding'); // AI 未推进任何动作
    } finally {
      vi.useRealTimers();
    }
  });
});
