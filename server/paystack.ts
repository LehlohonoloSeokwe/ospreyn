/**
 * Paystack payment integration for the Pro plan (server/plans.ts).
 *
 * Flow:
 *  1. POST /billing/checkout initializes a Paystack transaction (recurring,
 *     via a Paystack Plan code, if PAYSTACK_PLAN_CODE_PRO is configured —
 *     see .env.example) and returns an authorization_url to redirect to.
 *  2. Paystack redirects back to PAYSTACK_CALLBACK_URL?reference=... after
 *     checkout; the frontend calls GET /billing/verify/:reference, which
 *     confirms the charge and upgrades the organisation's plan.
 *  3. Ongoing: Paystack's webhook (POST /webhooks/paystack) is the source of
 *     truth for subscription renewals and cancellations — step 2 gives the
 *     person an instant "you're upgraded" on their screen, but the webhook
 *     is what keeps the plan correct if they close the tab before the
 *     redirect, and what downgrades them when a subscription lapses.
 *
 * Nothing here throws for an unconfigured PAYSTACK_SECRET_KEY except at the
 * point of actually trying to charge someone — unlike email/WhatsApp, there
 * is no sensible "log it and pretend it worked" fallback for a payment.
 */

const PAYSTACK_BASE = 'https://api.paystack.co';

function secretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) {
    throw Object.assign(new Error('Paystack is not configured on this server.'), {
      statusCode: 503,
    });
  }
  return key;
}

async function paystackRequest<T = any>(
  method: 'GET' | 'POST',
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const json: any = await res.json().catch(() => ({}));

  if (!res.ok || json?.status === false) {
    throw Object.assign(new Error(json?.message || `Paystack responded ${res.status}`), {
      statusCode: res.status >= 400 && res.status < 500 ? 400 : 502,
    });
  }

  return json;
}

export interface InitializeTransactionResult {
  authorizationUrl: string;
  accessCode: string;
  reference: string;
}

/**
 * Starts a checkout. Amount is in the smallest currency unit — for ZAR,
 * cents, so R249.00 is 24900. If PAYSTACK_PLAN_CODE_PRO is set, Paystack
 * creates a subscription from this charge and handles recurring billing
 * itself; without it, this is a one-off charge and the organisation will
 * need to check out again manually each period.
 */
export async function initializeTransaction(params: {
  email: string;
  amountZarCents: number;
  organisationId: string;
  metadata?: Record<string, unknown>;
}): Promise<InitializeTransactionResult> {
  const callbackUrl = process.env.PAYSTACK_CALLBACK_URL;
  const planCode = process.env.PAYSTACK_PLAN_CODE_PRO;

  const json = await paystackRequest<any>('POST', '/transaction/initialize', {
    email: params.email,
    amount: params.amountZarCents,
    currency: 'ZAR',
    callback_url: callbackUrl,
    plan: planCode || undefined,
    metadata: {
      organisationId: params.organisationId,
      ...params.metadata,
    },
  });

  return {
    authorizationUrl: json.data.authorization_url,
    accessCode: json.data.access_code,
    reference: json.data.reference,
  };
}

export interface VerifyTransactionResult {
  ok: boolean;
  status: string;
  reference: string;
  amountZarCents: number;
  customerCode: string | null;
  customerEmail: string | null;
  subscriptionCode: string | null;
  planCode: string | null;
  organisationId: string | null;
  raw: unknown;
}

export async function verifyTransaction(reference: string): Promise<VerifyTransactionResult> {
  const json = await paystackRequest<any>(
    'GET',
    `/transaction/verify/${encodeURIComponent(reference)}`,
  );
  const data = json.data || {};

  return {
    ok: data.status === 'success',
    status: data.status,
    reference: data.reference,
    amountZarCents: data.amount,
    customerCode: data.customer?.customer_code || null,
    customerEmail: data.customer?.email || null,
    subscriptionCode: data.plan_object?.plan_code ? data.subscription_code || null : null,
    planCode: data.plan || data.plan_object?.plan_code || null,
    organisationId: data.metadata?.organisationId || null,
    raw: data,
  };
}

/**
 * Verifies Paystack's `x-paystack-signature` header: HMAC-SHA512 of the raw
 * request body, keyed with the secret key, hex-encoded. Paystack requires
 * this check on every webhook — without it, anyone who finds the webhook
 * URL could POST a fake `charge.success` and upgrade themselves for free.
 */
export function verifyPaystackSignature(rawBody: string, signatureHeader: string | undefined): boolean {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key || !signatureHeader) return false;

  const crypto = require('crypto') as typeof import('crypto');
  const expected = crypto.createHmac('sha512', key).update(rawBody, 'utf8').digest('hex');

  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
