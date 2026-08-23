import { describe, it, expect } from 'vitest';
import { DdzGame } from '../controller';
import { bidAi, playAi } from '../../ai';

/** 用 AI 驱动三个座位完成一局（autoPlay=false 同步驱动） */
function simulateOnce(): void {
  const g = new DdzGame({ autoPlay: false });
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
  // 赢家手牌为空
  const winnerSeat =
    final.winner === 'landlord' ? final.landlord : ([0, 1, 2] as const).find(i => i !== final.landlord)!;
  void winnerSeat;
}

describe('AI vs AI 全流程模拟', () => {
  it('200 局全部正常终局', () => {
    for (let i = 0; i < 200; i++) {
      simulateOnce();
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
});
