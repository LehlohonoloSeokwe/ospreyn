/**
 * Plan definitions.
 *
 * An organisation's `plan` column (see schema.sql) is the source of truth
 * for what it's entitled to, and `billing_interval` tracks whether it's
 * paying monthly or annually. Both are changed by three paths, all
 * converging on the same underlying update: a Paystack checkout (POST
 * /billing/checkout → GET /billing/verify/:reference, see
 * server/paystack.ts) for self-serve upgrades; the Paystack webhook (POST
 * /webhooks/paystack) for renewals and cancellations; or a platform admin
 * via /admin for manual overrides (e.g. an offline payment, or comping an
 * account). Enforcement here — maxSongs, maxTeamMembers, feature flags —
 * doesn't need to know or care which path set the plan.
 */

export type PlanId = 'free' | 'starter' | 'professional' | 'label' | 'enterprise';
export type BillingInterval = 'monthly' | 'annual';

export interface PlanDefinition {
  id: PlanId;
  name: string;
  /** ZAR. 0 for free. null for enterprise (custom/"contact us" pricing). */
  priceMonthlyZar: number | null;
  /** ZAR/year. Always cheaper per-month than paying monthly (see ANNUAL_DISCOUNT_PERCENT). */
  priceAnnualZar: number | null;
  /** Max Rights Records (songs) the organisation may create. null = unlimited. */
  maxSongs: number | null;
  /** Max distinct people who can hold a role in the workspace (owner counts as 1). null = unlimited. */
  maxTeamMembers: number | null;
  tagline: string;
  features: string[];
  /** Shown on the pricing card as a call to action. */
  cta: string;
  /** True for the plan the landing page visually highlights. */
  recommended?: boolean;
}

/** Percentage saved by paying annually instead of 12x the monthly price. */
export const ANNUAL_DISCOUNT_PERCENT = 17;

function annualPrice(monthlyZar: number): number {
  const fullYear = monthlyZar * 12;
  return Math.round((fullYear * (1 - ANNUAL_DISCOUNT_PERCENT / 100)) / 10) * 10;
}

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: {
    id: 'free',
    name: 'Free',
    priceMonthlyZar: 0,
    priceAnnualZar: 0,
    maxSongs: 5,
    maxTeamMembers: 1,
    tagline: 'Try it on a couple of releases before you commit to anything.',
    features: [
      'Up to 5 Rights Records',
      'Composition & master ownership splits',
      'Email invitations & confirmations',
      'Split-sheet PDF generation',
      'Basic document vault (100 MB)',
    ],
    cta: 'Start free',
  },
  starter: {
    id: 'starter',
    name: 'Starter',
    priceMonthlyZar: 89,
    priceAnnualZar: annualPrice(89),
    maxSongs: 25,
    maxTeamMembers: 1,
    tagline: 'An affordable entry point for one independent artist getting organised.',
    features: [
      'Up to 25 Rights Records',
      'Everything in Free',
      'Full document vault (2 GB) with Evidence Strength scoring',
      'WhatsApp owner notifications',
    ],
    cta: 'Get started',
  },
  professional: {
    id: 'professional',
    name: 'Professional',
    priceMonthlyZar: 249,
    priceAnnualZar: annualPrice(249),
    maxSongs: null,
    maxTeamMembers: 3,
    tagline: 'Full catalogue management and collaboration for an active release schedule.',
    features: [
      'Unlimited Rights Records',
      'Everything in Starter',
      'Up to 3 workspace members',
      'Document vault (25 GB)',
      'Priority support',
    ],
    cta: 'Get started',
    recommended: true,
  },
  label: {
    id: 'label',
    name: 'Label',
    priceMonthlyZar: 699,
    priceAnnualZar: annualPrice(699),
    maxSongs: null,
    maxTeamMembers: 10,
    tagline: 'A multi-user workspace for a small label, publisher or management team.',
    features: [
      'Unlimited Rights Records',
      'Everything in Professional',
      'Up to 10 workspace members with role-based access',
      'Document vault (100 GB)',
      'Team activity oversight across the whole catalogue',
    ],
    cta: 'Get started',
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    priceMonthlyZar: null,
    priceAnnualZar: null,
    maxSongs: null,
    maxTeamMembers: null,
    tagline: 'Custom limits, custom terms, unlimited scale.',
    features: [
      'Unlimited Rights Records, members and storage',
      'Everything in Label',
      'Custom contract & data-retention terms',
      'Dedicated support channel',
    ],
    cta: 'Talk to us',
  },
};

export const PLAN_ORDER: PlanId[] = ['free', 'starter', 'professional', 'label', 'enterprise'];

/**
 * A row-per-dimension view of the same data in PLANS, purely for rendering
 * an apples-to-apples comparison table on the pricing page — the bullet
 * list on each card is the human-readable pitch, this is what lets someone
 * check "does Label have X that Starter doesn't" at a glance.
 */
export interface PlanComparisonRow {
  label: string;
  values: Record<PlanId, string>;
}

export const PLAN_COMPARISON_ROWS: PlanComparisonRow[] = [
  {
    label: 'Rights Records',
    values: {
      free: 'Up to 5',
      starter: 'Up to 25',
      professional: 'Unlimited',
      label: 'Unlimited',
      enterprise: 'Unlimited',
    },
  },
  {
    label: 'Workspace members',
    values: {
      free: '1 (just you)',
      starter: '1 (just you)',
      professional: 'Up to 3',
      label: 'Up to 10',
      enterprise: 'Custom',
    },
  },
  {
    label: 'Document vault storage',
    values: {
      free: '100 MB',
      starter: '2 GB',
      professional: '25 GB',
      label: '100 GB',
      enterprise: 'Custom',
    },
  },
  {
    label: 'Evidence Strength scoring',
    values: { free: '—', starter: '✓', professional: '✓', label: '✓', enterprise: '✓' },
  },
  {
    label: 'WhatsApp owner notifications',
    values: { free: '—', starter: '✓', professional: '✓', label: '✓', enterprise: '✓' },
  },
  {
    label: 'Priority support',
    values: { free: '—', starter: '—', professional: '✓', label: '✓', enterprise: '✓ Dedicated' },
  },
  {
    label: 'Role-based team access',
    values: { free: '—', starter: '—', professional: '—', label: '✓', enterprise: '✓' },
  },
];

export const DEFAULT_PLAN: PlanId = 'free';

export function getPlan(planId: string | null | undefined): PlanDefinition {
  return isValidPlanId(planId) ? PLANS[planId] : PLANS[DEFAULT_PLAN];
}

export function isValidPlanId(value: unknown): value is PlanId {
  return typeof value === 'string' && value in PLANS;
}

export function isValidBillingInterval(value: unknown): value is BillingInterval {
  return value === 'monthly' || value === 'annual';
}

/** The plan immediately above this one in the lineup, for upgrade nudges. null past Enterprise. */
export function nextPlan(current: PlanId): PlanDefinition | null {
  const idx = PLAN_ORDER.indexOf(current);
  if (idx === -1 || idx === PLAN_ORDER.length - 1) return null;
  return PLANS[PLAN_ORDER[idx + 1]];
}

/** Price for a given plan + interval, in ZAR. null for Enterprise (custom). */
export function priceFor(plan: PlanDefinition, interval: BillingInterval): number | null {
  return interval === 'annual' ? plan.priceAnnualZar : plan.priceMonthlyZar;
}
