/**
 * WhatsApp Business notifications, via Twilio's WhatsApp API.
 *
 * Mirrors email.ts: nothing here throws on a missing provider or a failed
 * send — a WhatsApp notification should never break the request that
 * triggered it, and every outbound attempt (and its provider response) is
 * handed back to the caller so it can be written to the audit trail.
 *
 * Two message shapes:
 *  - Contributor invitations need interactive quick-reply buttons
 *    ("Confirm Agreement" / "Request Change"), which WhatsApp only allows
 *    outside an open customer-service session through a pre-approved
 *    Content Template. Configure one via TWILIO_WHATSAPP_INVITE_CONTENT_SID
 *    (create it in the Twilio Console > Content Template Builder, submit it
 *    to Meta for approval, then paste the resulting Content SID here).
 *  - Owner notifications ("X confirmed their split") are plain text and
 *    send fine as freeform messages without a template.
 *
 * Without a configured content template, invitation sends fall back to a
 * plain-text message carrying the same review link with no tappable
 * buttons — contributors can still confirm from the web link, they just
 * lose the one-tap WhatsApp buttons until a template is approved.
 */

type Provider = 'twilio' | 'console';

export interface WhatsAppSendResult {
  ok: boolean;
  provider: Provider;
  messageSid: string | null;
  status: string;
  error?: string;
  raw?: unknown;
}

function resolveProvider(): Provider {
  const forced = (process.env.WHATSAPP_PROVIDER || '').toLowerCase();
  if (forced === 'twilio' || forced === 'console') return forced;
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) return 'twilio';
  return 'console';
}

/**
 * Normalises a South African number to WhatsApp's `whatsapp:+E164` form.
 * Accepts local format (0659639623), national without leading zero
 * (659639623) or already-international (+27659639623 / 27659639623).
 * Returns null if the input doesn't look like a usable number.
 */
export function toWhatsAppAddress(rawPhone: string | null | undefined): string | null {
  if (!rawPhone) return null;
  const digits = rawPhone.replace(/[^\d+]/g, '');
  if (!digits) return null;

  let e164: string;
  if (digits.startsWith('+')) {
    e164 = digits;
  } else if (digits.startsWith('0')) {
    e164 = `+27${digits.slice(1)}`;
  } else if (digits.startsWith('27')) {
    e164 = `+${digits}`;
  } else {
    e164 = `+27${digits}`;
  }

  if (!/^\+\d{8,15}$/.test(e164)) return null;
  return `whatsapp:${e164}`;
}

function fromAddress(): string {
  const configured = process.env.TWILIO_WHATSAPP_FROM || '';
  if (!configured) return '';
  return configured.startsWith('whatsapp:') ? configured : `whatsapp:${configured}`;
}

interface TwilioSendInput {
  to: string; // already in whatsapp:+E164 form
  body?: string;
  contentSid?: string;
  contentVariables?: Record<string, string>;
}

async function sendViaTwilio(input: TwilioSendInput): Promise<WhatsAppSendResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID || '';
  const authToken = process.env.TWILIO_AUTH_TOKEN || '';
  const from = fromAddress();

  if (!from) {
    return {
      ok: false,
      provider: 'twilio',
      messageSid: null,
      status: 'failed',
      error: 'TWILIO_WHATSAPP_FROM is not configured.',
    };
  }

  const params = new URLSearchParams();
  params.set('To', input.to);
  params.set('From', from);
  if (input.contentSid) {
    params.set('ContentSid', input.contentSid);
    if (input.contentVariables) {
      params.set('ContentVariables', JSON.stringify(input.contentVariables));
    }
  } else if (input.body) {
    params.set('Body', input.body);
  }

  const statusCallback = process.env.TWILIO_STATUS_CALLBACK_URL;
  if (statusCallback) params.set('StatusCallback', statusCallback);

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      },
    );
    const json: any = await res.json().catch(() => ({}));

    if (!res.ok) {
      return {
        ok: false,
        provider: 'twilio',
        messageSid: json?.sid || null,
        status: 'failed',
        error: json?.message || `Twilio responded ${res.status}`,
        raw: json,
      };
    }

    return {
      ok: true,
      provider: 'twilio',
      messageSid: json?.sid || null,
      status: json?.status || 'sent',
      raw: json,
    };
  } catch (err) {
    return {
      ok: false,
      provider: 'twilio',
      messageSid: null,
      status: 'failed',
      error: (err as Error).message,
    };
  }
}

/**
 * Sends a WhatsApp message. Never throws. With no provider configured,
 * logs to the console (same shape as email.ts's console fallback) so local
 * dev and unconfigured staging environments still show what would have
 * been sent.
 */
export async function sendWhatsApp(input: TwilioSendInput): Promise<WhatsAppSendResult> {
  const provider = resolveProvider();

  if (provider === 'console') {
    console.log(
      `[ospreyn:whatsapp] (no provider configured — set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN to send for real)\n` +
        `  to: ${input.to}\n  ${input.contentSid ? `contentSid: ${input.contentSid}` : `body: ${input.body}`}\n`,
    );
    return { ok: true, provider: 'console', messageSid: null, status: 'logged' };
  }

  return sendViaTwilio(input);
}

// ---------------------------------------------------------------------------
// Message builders
// ---------------------------------------------------------------------------

/**
 * Body text for the contributor invitation — used as the plain-text
 * fallback body when no approved Content Template is configured, and as
 * the human-readable record we log to the audit trail either way.
 */
export function invitationWhatsAppText(params: {
  contributorName: string;
  songTitle: string;
  artistName: string;
  role: string;
  sharePercent: string;
  reviewUrl: string;
}): string {
  const { contributorName, songTitle, artistName, role, sharePercent, reviewUrl } = params;
  return (
    `*Ospreyn Rights Management — Review Request*\n\n` +
    `You have been added as a contributor to ${songTitle} by ${artistName} on Ospreyn.\n\n` +
    `Proposed Details:\n` +
    `- Role: ${role}\n` +
    `- Share: ${sharePercent}\n\n` +
    `Please review and confirm your participation. If you have questions, reach out to ${supportEmail()}.\n\n` +
    `Review & Confirm Link: ${reviewUrl}`
  );
}

/**
 * Sends the contributor invitation over WhatsApp. If
 * TWILIO_WHATSAPP_INVITE_CONTENT_SID is set, sends the approved interactive
 * template (with "Confirm Agreement" / "Request Change" quick-reply
 * buttons) whose content variables are documented in .env.example next to
 * the setting. Otherwise falls back to a plain-text message with the same
 * information and the review link, but no tappable buttons.
 *
 * The button payload used by the template is the invitation's raw
 * review token — the same secret already carried in the review link sent
 * in the very same message, so embedding it in a button payload discloses
 * nothing beyond what the message already contains.
 */
export async function sendInvitationWhatsApp(params: {
  to: string;
  contributorName: string;
  songTitle: string;
  artistName: string;
  role: string;
  sharePercent: string;
  reviewUrl: string;
  rawToken: string;
}): Promise<WhatsAppSendResult> {
  const contentSid = process.env.TWILIO_WHATSAPP_INVITE_CONTENT_SID;
  const text = invitationWhatsAppText(params);

  if (contentSid) {
    return sendWhatsApp({
      to: params.to,
      contentSid,
      contentVariables: {
        '1': params.contributorName,
        '2': params.songTitle,
        '3': params.artistName,
        '4': params.role,
        '5': params.sharePercent,
        '6': params.reviewUrl,
        // Button payloads: the template's two quick-reply buttons must be
        // configured (in the Content Template Builder) to echo these back
        // verbatim as ButtonPayload on the inbound webhook.
        '7': params.rawToken,
      },
    });
  }

  return sendWhatsApp({ to: params.to, body: text });
}

export function ownerNotificationWhatsAppText(params: {
  ownerName: string;
  contributorName: string;
  songTitle: string;
  action: 'confirmed' | 'change_requested';
  comment?: string | null;
  songUrl: string;
}): string {
  const { ownerName, contributorName, songTitle, action, comment, songUrl } = params;
  const isConfirmed = action === 'confirmed';
  return (
    `Hi ${ownerName},\n\n` +
    `${contributorName} ${isConfirmed ? 'confirmed their split on' : 'requested a change on'} ${songTitle}.` +
    `${!isConfirmed && comment ? `\n\nTheir note: "${comment}"` : ''}\n\n` +
    `View the rights record: ${songUrl}`
  );
}

export async function sendOwnerNotificationWhatsApp(params: {
  to: string;
  ownerName: string;
  contributorName: string;
  songTitle: string;
  action: 'confirmed' | 'change_requested';
  comment?: string | null;
  songUrl: string;
}): Promise<WhatsAppSendResult> {
  return sendWhatsApp({ to: params.to, body: ownerNotificationWhatsAppText(params) });
}

function supportEmail(): string {
  return process.env.SUPPORT_EMAIL || 'help@ospreyn.app';
}

// ---------------------------------------------------------------------------
// Inbound webhook signature verification (Twilio)
// ---------------------------------------------------------------------------

/**
 * Verifies Twilio's X-Twilio-Signature header per Twilio's documented
 * algorithm: HMAC-SHA1 of (full request URL + each POST param, key then
 * value, sorted by key and concatenated with no delimiter), base64-encoded,
 * keyed with the account's auth token. Required so the confirm/reject
 * webhook can't be spoofed by a third party who guesses the URL.
 */
export function verifyTwilioSignature(
  fullUrl: string,
  params: Record<string, string>,
  signatureHeader: string | undefined,
): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken || !signatureHeader) return false;

  const crypto = require('crypto') as typeof import('crypto');
  const sortedKeys = Object.keys(params).sort();
  let data = fullUrl;
  for (const key of sortedKeys) data += key + params[key];

  const expected = crypto.createHmac('sha1', authToken).update(Buffer.from(data, 'utf-8')).digest('base64');

  // Constant-time comparison.
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
