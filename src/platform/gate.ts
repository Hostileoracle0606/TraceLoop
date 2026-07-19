import type { PlatformModel, Ambiguity } from './types';

/** A critical derived fact below this confidence blocks auto-proceed. */
export const CRITICAL_THRESHOLD = 0.6;

export function classifyConfidence(model: PlatformModel): { autoProceed: boolean; blocking: Ambiguity[] } {
  const blocking: Ambiguity[] = model.confidence
    .filter((c) => c.criticality === 'critical' && c.score < CRITICAL_THRESHOLD)
    .map((c) => ({
      field: c.fact,
      question: `Confirm ${c.fact} — automatic extraction is only ${Math.round(c.score * 100)}% confident.`,
      reason: c.provenance,
    }));
  return { autoProceed: blocking.length === 0, blocking };
}
