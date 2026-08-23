export const BASE_SCORE = 100;

/** 底分 × 叫分倍数 × 2^炸弹数 × 春天(×2) */
export function calcScore(
  baseScore: number,
  bidMultiplier: number,
  bombCount: number,
  spring: boolean
): number {
  return baseScore * bidMultiplier * Math.pow(2, bombCount) * (spring ? 2 : 1);
}
