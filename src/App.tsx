import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { DdzGame } from './game/controller';
import type { GameState } from './game/controller';
import type { Card } from './engine/types';
import { PlayingCard } from './ui/PlayingCard';
import { cardLabel } from './ui/cardPresentation';
import { sfx, initMuteState, setMuted, announcePlay, speak, unlockAudio, resumeOnVisible } from './ui/sounds';

function useGame(game: DdzGame): GameState {
  const subscribe = useMemo(
    () => (cb: () => void) => game.subscribe(() => cb()),
    [game]
  );
  return useSyncExternalStore(subscribe, () => game.getState());
}

/** 每个座位最近一次动作（出牌或不出） */
function lastActionPerSeat(state: GameState) {
  const res: [Card[] | null, Card[] | null, Card[] | null] = [null, null, null];
  const pass: [boolean, boolean, boolean] = [false, false, false];
  for (const rec of state.history) {
    if (rec.pass) {
      pass[rec.seat] = true;
      res[rec.seat] = null;
    } else {
      pass[rec.seat] = false;
      res[rec.seat] = rec.cards;
    }
  }
  return { res, pass };
}

export default function App() {
  // 惰性创建唯一实例：渲染期不再读写 ref（消除 react(refs) 警告）
  const [game] = useState(() => new DdzGame({
    aiDelayMs: 3000,
    onBid: (_seat, score) => speak(score === 0 ? '不叫' : `${score} 分`),
  }));
  const state = useGame(game);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [invalidMsg, setInvalidMsg] = useState('');
  const [muteUi, setMuteUi] = useState(() => initMuteState());
  const [rotateDismissed, setRotateDismissed] = useState(false);

  // 卸载时释放游戏实例（清 AI 定时器与订阅，由 controller 的 dispose 负责）
  useEffect(() => {
    return () => game.dispose();
  }, [game]);

  // 换局时清空选择与错误提示：渲染期派生，避免 effect 内同步 setState
  const [prevPhase, setPrevPhase] = useState(state.phase);
  if (prevPhase !== state.phase) {
    setPrevPhase(state.phase);
    setSelected(new Set());
    setInvalidMsg('');
  }

  // 移动端：首次用户手势解锁音频与语音；切回前台恢复音频
  useEffect(() => {
    const unlock = () => unlockAudio();
    const onVisible = () => resumeOnVisible();
    window.addEventListener('pointerdown', unlock, { once: false });
    window.addEventListener('keydown', unlock);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // 音效：监听对局事件（AI 动作、炸弹、地主确定、胜负）
  const prevRef = useRef({ historyLen: 0, bombCount: 0, phase: state.phase, landlord: state.landlord });
  useEffect(() => {
    const prev = prevRef.current;
    // 新增的出牌/不出记录（含 AI）
    if (state.history.length > prev.historyLen) {
      const rec = state.history[state.history.length - 1];
      if (rec && !rec.pass) {
        if (rec.seat !== 0) sfx.play(); // 真人自己的出牌音在 onPlay 里触发
        announcePlay(rec.cards); // 语音报牌：所有玩家出牌都播报
      } else if (rec && rec.pass && rec.seat !== 0) {
        sfx.pass();
        speak('不要');
      }
    }
    if (state.bombCount > prev.bombCount) sfx.bomb();
    if (state.landlord !== null && prev.landlord === null) sfx.landlord();
    if (state.phase === 'over' && prev.phase !== 'over') {
      const iAmLandlord = state.landlord === 0;
      const won = iAmLandlord === (state.winner === 'landlord');
      if (won) sfx.win();
      else sfx.lose();
    }
    prevRef.current = {
      historyLen: state.history.length,
      bombCount: state.bombCount,
      phase: state.phase,
      landlord: state.landlord,
    };
  }, [state]);

  const hand = state.phase !== 'idle' ? game.getHand(0) : [];
  const { res: lastPlays, pass: lastPass } = lastActionPerSeat(state);
  const myTurn =
    state.currentPlayer === 0 &&
    ((state.phase === 'bidding') || (state.phase === 'playing'));

  const toggleCard = (id: string) => {
    setInvalidMsg('');
    sfx.select();
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handRef = useRef<HTMLDivElement>(null);

  // 把最右侧选中牌滚进手牌视野（提示选牌可能落在屏幕外）
  const scrollSelectedIntoView = () => {
    const container = handRef.current;
    if (!container) return;
    const sel = container.querySelectorAll<HTMLElement>('[data-card-id].is-selected');
    const last = sel[sel.length - 1];
    if (!last) return;
    const cardLeft = last.offsetLeft;
    const cardRight = cardLeft + last.offsetWidth;
    const viewLeft = container.scrollLeft;
    const viewRight = viewLeft + container.clientWidth;
    if (cardRight > viewRight || cardLeft < viewLeft) {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      container.scrollTo({
        left: Math.max(0, cardRight - container.clientWidth + 16),
        behavior: reduce ? 'auto' : 'smooth',
      });
    }
  };

  // 选牌变化后（含「提示」）自动滚动；尊重 prefers-reduced-motion
  useEffect(() => {
    const raf = requestAnimationFrame(scrollSelectedIntoView);
    return () => cancelAnimationFrame(raf);
  }, [selected]);

  const onHint = () => {
    const h = game.hint();
    if (h) {
      setSelected(new Set(h.map(c => c.id)));
    } else {
      speak('要不起');
    }
  };

  const onPlay = () => {
    if (!selected.size) return;
    const ok = game.play([...selected]);
    if (ok) {
      sfx.play();
      setSelected(new Set());
      setInvalidMsg('');
    } else {
      setInvalidMsg('不符合出牌规则，试试"提示"');
    }
  };

  const onPass = () => {
    if (!game.pass()) {
      setInvalidMsg('本轮首出，必须出牌');
    } else {
      sfx.pass();
      speak('不要');
      setSelected(new Set());
      setInvalidMsg('');
    }
  };

  const onBid = (score: 0 | 1 | 2 | 3) => {
    sfx.bid(score);
    game.bid(score);
  };

  const onStart = () => {
    sfx.deal();
    game.start();
  };

  const onToggleMute = () => {
    const next = !muteUi;
    setMuteUi(next);
    setMuted(next);
    if (!next) sfx.select();
  };

  const bombShake =
    state.lastPlay &&
    (state.lastPlay.pattern.kind === 'bomb' || state.lastPlay.pattern.kind === 'rocket');

  return (
    <div className="table">
      {/* 顶部信息条 */}
      <header className="topbar">
        <div className="topbar-title">🃏 欢乐斗地主 · 人机对战</div>
        <div className="topbar-info">
          <button
            type="button"
            className="btn btn-ghost btn-mute"
            aria-label={muteUi ? '开启音效' : '关闭音效'}
            aria-pressed={muteUi}
            title={muteUi ? '开启音效' : '关闭音效'}
            onClick={onToggleMute}
          >
            {muteUi ? '🔇' : '🔊'}
          </button>
          <span className="pill">倍数 ×{state.bidMultiplier}</span>
          {state.bombCount > 0 && <span className="pill pill-bomb">炸弹 ×{state.bombCount}</span>}
          <div className="bottom-cards">
            <span className="bottom-label">底牌</span>
            {state.landlord !== null
              ? state.bottomCards.map(c => (
                  <PlayingCard key={c.id} card={c} small />
                ))
              : [0, 1, 2].map(i => <PlayingCard key={i} card={{ id: `bk${i}`, rank: 3, suit: 'spade' }} small faceDown />)}
          </div>
        </div>
      </header>

      {/* 对局区 */}
      <main className={`arena ${bombShake ? 'shake' : ''}`}>
        {/* 左侧 AI（seat 1） */}
        <SeatPanel
          state={state}
          seat={1}
          side="left"
          lastCards={lastPlays[1]}
          isPass={lastPass[1]}
        />

        {/* 右侧 AI（seat 2） */}
        <SeatPanel
          state={state}
          seat={2}
          side="right"
          lastCards={lastPlays[2]}
          isPass={lastPass[2]}
        />

        {/* 中央 */}
        <section className="center">
          <div className="center-msg" aria-live="polite">
            {state.phase === 'bidding' && (
              <p className="hint-text">
                {state.currentPlayer === 0
                  ? '轮到你叫分'
                  : state.currentPlayer !== null && `${state.players[state.currentPlayer].name} 正在叫分…`}
                {state.currentBid > 0 && `（当前 ${state.currentBid} 分）`}
              </p>
            )}
            {state.phase === 'playing' && !myTurn && state.currentPlayer !== null && (
              <p className="hint-text">{state.players[state.currentPlayer].name} 思考中…</p>
            )}
          </div>
          {/* 我的最近出牌展示在中央下方 */}
          {state.phase === 'playing' && lastPlays[0] && (
            <div className="played-cards">
              {lastPlays[0].map(c => <PlayingCard key={c.id} card={c} small />)}
            </div>
          )}
          {state.phase === 'playing' && !lastPlays[0] && lastPass[0] && (
            <div className="pass-bubble">不要</div>
          )}
        </section>
      </main>

      {/* 操作区 + 手牌 */}
      <footer className="bottom">
        <div className="controls">
          {state.phase === 'bidding' && myTurn && (
            <>
              <button type="button" className="btn btn-ghost" onClick={() => onBid(0)}>不叫</button>
              {[1, 2, 3].map(s => (
                <button
                  key={s}
                  type="button"
                  className="btn btn-primary"
                  disabled={s <= state.currentBid}
                  onClick={() => onBid(s as 1 | 2 | 3)}
                >
                  {s} 分
                </button>
              ))}
            </>
          )}
          {state.phase === 'playing' && myTurn && (
            <>
              <button type="button" className="btn btn-ghost" onClick={onHint}>💡 提示</button>
              <button
                type="button"
                className="btn btn-skip"
                disabled={!canPass(state)}
                onClick={onPass}
              >
                不要
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!selected.size}
                onClick={onPlay}
              >
                出牌
              </button>
            </>
          )}
          {invalidMsg && <span className="invalid-msg" role="status">{invalidMsg}</span>}
        </div>

        <div
          className="hand"
          ref={handRef}
          role="group"
          aria-label="我的手牌"
        >
          {hand.map(c => (
            <PlayingCard
              key={c.id}
              card={c}
              selected={selected.has(c.id)}
              onClick={() => toggleCard(c.id)}
            />
          ))}
        </div>

        <div className="me-bar">
          <span className="avatar">🙂</span>
          <span>{state.players[0].name}</span>
          {state.landlord === 0 && <span className="badge badge-landlord">👑</span>}
          <span className="count">{hand.length} 张</span>
        </div>
      </footer>

      {/* 开始界面 */}
      {state.phase === 'idle' && (
        <div className="overlay">
          <div className="panel panel-start">
            <h1>🃏 欢乐斗地主</h1>
            <p>与两位 AI 对战 · 经典规则</p>
            <button type="button" className="btn btn-primary btn-lg" onClick={onStart}>
              开始游戏
            </button>
          </div>
        </div>
      )}

      {/* 结算面板 */}
      {state.phase === 'over' && (
        <div className="overlay">
          <div className="panel panel-settle">
            <h1 className={iWon(state) ? 'win' : 'lose'} role="status">
              {iWon(state) ? '🏆 胜利！' : '💔 失败'}
            </h1>
            <p className="settle-sub">
              {state.winner === 'landlord' ? '地主' : '农民'}阵营获胜
              {state.spring && <span className="spring-tag">春天 ×2</span>}
            </p>
            <table className="score-table">
              <tbody>
                {state.players.map(p => (
                  <tr key={p.seat}>
                    <td>{p.name}{state.landlord === p.seat ? ' 👑' : ''}</td>
                    <td className={state.scoreDelta[p.seat] >= 0 ? 'pos' : 'neg'}>
                      {state.scoreDelta[p.seat] >= 0 ? '+' : ''}
                      {state.scoreDelta[p.seat]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button type="button" className="btn btn-primary btn-lg" onClick={onStart}>
              再来一局
            </button>
          </div>
        </div>
      )}

      {/* 手机竖屏引导（仅会话内记忆；转回横屏由媒体查询自动隐藏） */}
      {!rotateDismissed && (
        <div className="rotate-guard" role="dialog" aria-label="请横屏游玩">
          <div className="rotate-guard-box">
            <span className="rotate-icon" aria-hidden="true">📱</span>
            <p className="rotate-text">请将手机横过来，牌会更大、更好点。</p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setRotateDismissed(true)}
            >
              仍然继续
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function canPass(state: GameState): boolean {
  return state.toBeat !== null;
}

function iWon(state: GameState): boolean {
  if (state.landlord === null || state.winner === null) return false;
  const iAmLandlord = state.landlord === 0;
  return iAmLandlord === (state.winner === 'landlord');
}

interface SeatPanelProps {
  state: GameState;
  seat: 1 | 2;
  side: 'left' | 'right';
  lastCards: Card[] | null;
  isPass: boolean;
}

function SeatPanel({ state, seat, side, lastCards, isPass }: SeatPanelProps) {
  const p = state.players[seat];
  const active = state.currentPlayer === seat && state.phase !== 'over';
  return (
    <aside className={`seat seat-${side} ${active ? 'is-active' : ''}`}>
      <div className="seat-head">
        <span className="avatar">🤖</span>
        <div className="seat-meta">
          <span className="seat-name">{p.name}</span>
          <span className="count">{p.handCount} 张</span>
        </div>
        {state.landlord === seat
          ? <span className="badge badge-landlord">地主</span>
          : state.landlord !== null && <span className="badge badge-farmer">农民</span>}
      </div>
      <div className="seat-backs">
        {Array.from({ length: Math.min(p.handCount, 17) }).map((_, i) => (
          <PlayingCard key={i} faceDown small card={{ id: `b${seat}-${i}`, rank: 3, suit: 'spade' }} />
        ))}
      </div>
      {lastCards && (
        <div className="played-cards">
          {lastCards.map(c => (
            <div key={c.id} title={cardLabel(c)}>
              <PlayingCard card={c} small />
            </div>
          ))}
        </div>
      )}
      {isPass && !lastCards && <div className="pass-bubble">不要</div>}
    </aside>
  );
}
