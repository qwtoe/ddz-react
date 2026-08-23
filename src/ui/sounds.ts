/**
 * 轻量音效模块：Web Audio API 实时合成，无外部音频资源。
 * 浏览器自动播放策略要求首次用户交互后才能出声——首次点击"开始游戏"即完成解锁。
 */

import { parseCards } from '../engine/pattern';

let ctx: AudioContext | null = null;
let muted = false;

const MUTE_KEY = 'ddz-muted';

export function initMuteState(): boolean {
  try {
    muted = localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    muted = false; // 读取失败默认不静音
  }
  return muted;
}

export function setMuted(m: boolean): void {
  muted = m;
  try {
    localStorage.setItem(MUTE_KEY, m ? '1' : '0');
  } catch {
    /* 写入失败静默忽略 */
  }
}

export function isMuted(): boolean {
  return muted;
}

function ac(): AudioContext | null {
  if (muted) return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/**
 * 移动端浏览器（iOS/Android）要求在用户手势内解锁 AudioContext 与语音合成。
 * 在首次点击/触摸时调用一次，之后所有音效与语音才可正常播放。
 */
export function unlockAudio(): void {
  try {
    if (!muted && !ctx && 'AudioContext' in window) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
    }
    if (ctx && ctx.state === 'suspended') void ctx.resume();
    // 预热语音合成：iOS 需要在手势内 speak 一次才解锁
    if (!muted && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const warm = new SpeechSynthesisUtterance(' ');
      warm.lang = 'zh-CN';
      window.speechSynthesis.speak(warm);
    }
  } catch {
    /* 忽略解锁失败 */
  }
}

/** 页面从后台回到前台时恢复音频（移动端切后台会挂起 AudioContext） */
export function resumeOnVisible(): void {
  try {
    if (ctx && ctx.state === 'suspended') void ctx.resume();
  } catch {
    /* ignore */
  }
}

/** 单音 */
function tone(
  freq: number,
  dur: number,
  opts: { type?: OscillatorType; gain?: number; delay?: number; slideTo?: number } = {}
): void {
  const c = ac();
  if (!c) return;
  const { type = 'sine', gain = 0.12, delay = 0, slideTo } = opts;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** 白噪声（出牌摩擦声 / 爆炸声） */
function noise(dur: number, opts: { gain?: number; delay?: number; lowpass?: number } = {}): void {
  const c = ac();
  if (!c) return;
  const { gain = 0.15, delay = 0, lowpass } = opts;
  const t0 = c.currentTime + delay;
  const frames = Math.ceil(c.sampleRate * dur);
  const buf = c.createBuffer(1, frames, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  let node: AudioNode = src;
  if (lowpass) {
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lowpass;
    node.connect(f);
    node = f;
  }
  node.connect(g).connect(c.destination);
  src.start(t0);
}

export const sfx = {
  /** 发牌 */
  deal(): void {
    for (let i = 0; i < 6; i++) {
      tone(700 + i * 60, 0.04, { type: 'square', gain: 0.04, delay: i * 0.06 });
    }
  },
  /** 选牌 */
  select(): void {
    tone(660, 0.05, { type: 'triangle', gain: 0.08 });
  },
  /** 出牌 */
  play(): void {
    noise(0.12, { gain: 0.12, lowpass: 3200 });
    tone(320, 0.08, { type: 'triangle', gain: 0.06, slideTo: 180 });
  },
  /** 不出 */
  pass(): void {
    tone(220, 0.12, { type: 'sine', gain: 0.07, slideTo: 160 });
  },
  /** 叫分 */
  bid(score: number): void {
    const base = 440 + score * 120;
    tone(base, 0.1, { type: 'triangle', gain: 0.1 });
    tone(base * 1.5, 0.12, { type: 'triangle', gain: 0.08, delay: 0.08 });
  },
  /** 确定地主 */
  landlord(): void {
    [523, 659, 784].forEach((f, i) => tone(f, 0.14, { type: 'triangle', gain: 0.1, delay: i * 0.09 }));
  },
  /** 炸弹 / 王炸 */
  bomb(): void {
    noise(0.5, { gain: 0.35, lowpass: 900 });
    tone(90, 0.4, { type: 'sawtooth', gain: 0.25, slideTo: 40 });
  },
  /** 胜利 */
  win(): void {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, { type: 'triangle', gain: 0.12, delay: i * 0.12 }));
  },
  /** 失败 */
  lose(): void {
    [392, 330, 262].forEach((f, i) => tone(f, 0.22, { type: 'sine', gain: 0.1, delay: i * 0.16 }));
  },
};

/* ---------- 语音报牌（Web Speech API，零音频资源） ---------- */

// 用中文读法，避免 TTS 把 J/Q/K/A 读成"大写 xx"
const RANK_CN: Record<number, string> = {
  3: '三', 4: '四', 5: '五', 6: '六', 7: '七', 8: '八', 9: '九', 10: '十',
  11: '勾', 12: '圈', 13: '开', 14: '尖', 15: '二', 16: '小王', 17: '大王',
};

function patternText(kind: string, keyRank: number): string {
  switch (kind) {
    case 'single': return RANK_CN[keyRank];
    case 'pair': return `对${RANK_CN[keyRank]}`;
    case 'triple': return `三个${RANK_CN[keyRank]}`;
    case 'triple1': return '三带一';
    case 'triple2': return '三带二';
    case 'straight': return '顺子';
    case 'pairStraight': return '连对';
    case 'plane':
    case 'plane1':
    case 'plane2': return '飞机';
    case 'four2': return '四带二';
    case 'four2pair': return '四带两对';
    case 'bomb': return `炸弹`;
    case 'rocket': return '王炸';
    default: return '';
  }
}

/** 出牌时语音播报牌型，如"对2""炸弹" */
export function announcePlay(cards: import('../engine/types').Card[]): void {
  const p = parseCards(cards);
  if (!p) return;
  speak(patternText(p.kind, p.keyRank));
}

/** 用中文语音播报文本；静音时跳过 */
export function speak(text: string): void {
  if (muted || !text) return;
  try {
    if (!('speechSynthesis' in window)) return;
    // 打断上一条，避免连播堆积
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN';
    u.rate = 1.15;
    u.pitch = 1;
    const zhVoice = window.speechSynthesis
      .getVoices()
      .find(v => v.lang.toLowerCase().startsWith('zh'));
    if (zhVoice) u.voice = zhVoice;
    window.speechSynthesis.speak(u);
  } catch {
    /* 语音不可用时静默忽略 */
  }
}
