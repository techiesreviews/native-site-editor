// The verdict of native-edit-latency.spec.ts (ticket 38): an action passes when one of its
// rounds meets both budgets, the slowest keystroke and the longest task.
export interface LatencyRound { nextInput: number; longest: number }

/** The round that met both budgets, else the closest one (the least over both, summed). */
export function bestRound<T extends LatencyRound>(tries: readonly T[], budget: LatencyRound): { passed: boolean; round: T } {
  const over = (round: T) => Math.max(0, round.nextInput - budget.nextInput) + Math.max(0, round.longest - budget.longest);
  const round = tries.reduce((best, next) => over(next) < over(best) ? next : best);
  return { passed: over(round) === 0, round };
}
