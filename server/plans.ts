/**
 * Plan definitions.
 *
 * An organisation's `plan` column (see schema.sql) is the source of truth
 * for what it's entitled to. It's changed by three paths, all converging on
 * the same underlying update: a Paystack checkout (POST /billing/checkout →
 * GET /billing/verify/:reference, see server/paystack.ts) for self-serve
 * upgrades; the Paystack webhook (POST /webhooks/paystack) for renewals and
 * cancellations; or a platform admin via /admin for manual overrides (e.g.
 * an offline payment, or comping an account). Enforcement here — maxSongs,
 * feature flags — doesn't need to know or care which path set the plan.
 */

export type PlanId = 'free' | 'pro';

export interface PlanDefinition {
  id: PlanId;
  name: string;
  /** ZAR per month. 0 for free. */
  priceMonthlyZar: number;
  /** Max Rights Records (songs) the organisation may create. null = unlimited. */
  maxSongs: number | null;
  tagline: string;
  features: string[];
}

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: {
    id: 'free',
    name: 'Free',
    priceMonthlyZar: 0,
    maxSongs: 7,
    tagline: 'Get your first releases properly documented.',
    features: [
      'Up to 7 Rights Records',
      'Unlimited contributors per song',
      'Composition & master ownership splits',
      'Email invitations & confirmations',
      'Split-sheet PDF generation',
      'Document vault',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    priceMonthlyZar: 249,
    maxSongs: null,
    tagline: 'For active catalogues and small labels.',
    features: [
      'Unlimited Rights Records',
      'Everything in Free',
      'WhatsApp owner notifications',
      'Priority support',
    ],
  },
};

export const DEFAULT_PLAN: PlanId = 'free';

export function getPlan(planId: string | null | undefined): PlanDefinition {
  return isValidPlanId(planId) ? PLANS[planId] : PLANS[DEFAULT_PLAN];
}

export function isValidPlanId(value: unknown): value is PlanId {
  return typeof value === 'string' && value in PLANS;
}
