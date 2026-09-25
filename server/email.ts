/**
 * Transactional email.
 *
 * Supports Resend, SendGrid or Postmark, selected by whichever API key is
 * present in the environment (or forced via EMAIL_PROVIDER). If none is
 * configured, emails are logged to the console instead of sent — useful for
 * local development and for staging environments that don't have a provider
 * wired up yet. Nothing here throws on a missing provider: a failed or
 * unconfigured send is logged and swallowed, since a notification email
 * should never break the request that triggered it.
 */

type Provider = 'resend' | 'sendgrid' | 'postmark' | 'console';

interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

function resolveProvider(): Provider {
  const forced = (process.env.EMAIL_PROVIDER || '').toLowerCase();
  if (forced === 'resend' || forced === 'sendgrid' || forced === 'postmark') return forced;

  if (process.env.RESEND_API_KEY) return 'resend';
  if (process.env.SENDGRID_API_KEY) return 'sendgrid';
  if (process.env.POSTMARK_API_KEY) return 'postmark';
  return 'console';
}

function fromAddress(): string {
  return process.env.EMAIL_FROM || 'Ospreyn <notifications@ospreyn.app>';
}

async function sendViaResend(input: SendEmailInput) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromAddress(),
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
  });
  if (!res.ok) {
    throw new Error(`Resend responded ${res.status}: ${await res.text().catch(() => '')}`);
  }
}

async function sendViaSendgrid(input: SendEmailInput) {
  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: input.to }] }],
      from: { email: parseEmailAddress(fromAddress()) },
      subject: input.subject,
      content: [
        { type: 'text/plain', value: input.text },
        { type: 'text/html', value: input.html },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`SendGrid responded ${res.status}: ${await res.text().catch(() => '')}`);
  }
}

async function sendViaPostmark(input: SendEmailInput) {
  const res = await fetch('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: {
      'X-Postmark-Server-Token': process.env.POSTMARK_API_KEY || '',
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      From: fromAddress(),
      To: input.to,
      Subject: input.subject,
      HtmlBody: input.html,
      TextBody: input.text,
      MessageStream: 'outbound',
    }),
  });
  if (!res.ok) {
    throw new Error(`Postmark responded ${res.status}: ${await res.text().catch(() => '')}`);
  }
}

function parseEmailAddress(display: string): string {
  const match = display.match(/<([^>]+)>/);
  return match ? match[1] : display;
}

/**
 * Sends an email through whichever provider is configured. Never throws —
 * a failed send is logged and the caller proceeds. Callers should not
 * `await` this for correctness; call it and move on.
 */
export async function sendEmail(input: SendEmailInput): Promise<void> {
  const provider = resolveProvider();

  if (provider === 'console') {
    console.log(
      `[ospreyn:email] (no provider configured — set RESEND_API_KEY, SENDGRID_API_KEY or POSTMARK_API_KEY to send for real)\n` +
        `  to: ${input.to}\n  subject: ${input.subject}\n  ---\n${input.text}\n  ---`,
    );
    return;
  }

  try {
    if (provider === 'resend') await sendViaResend(input);
    else if (provider === 'sendgrid') await sendViaSendgrid(input);
    else await sendViaPostmark(input);
  } catch (err) {
    console.error(`[ospreyn:email] send via ${provider} failed:`, (err as Error).message);
  }
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

const WRAPPER_STYLE =
  'background:#090a0d;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;';
const CARD_STYLE =
  'max-width:480px;margin:0 auto;background:#0e1116;border:1px solid #1f242e;border-radius:8px;padding:32px;';
const BUTTON_STYLE =
  'display:inline-block;background:#ffffff;color:#0c0e12;text-decoration:none;font-weight:600;font-size:13px;padding:10px 20px;border-radius:6px;';
const MUTED = 'color:#8c94a0;font-size:12px;line-height:1.6;';

function baseTemplate(bodyHtml: string): string {
  return `
  <div style="${WRAPPER_STYLE}">
    <div style="${CARD_STYLE}">
      <div style="color:#ffffff;font-size:13px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;margin-bottom:24px;">
        Ospreyn
      </div>
      ${bodyHtml}
      <div style="margin-top:32px;padding-top:16px;border-top:1px solid #1f242e;${MUTED}">
        Ospreyn provides independent rights-documentation and workflow infrastructure. It does not
        provide legal advice or make claims regarding the statutory enforceability of private confirmations.
      </div>
    </div>
  </div>`;
}

export function invitationEmail(params: {
  contributorName: string;
  songTitle: string;
  organisationName: string;
  reviewUrl: string;
  expiresAt: string;
}) {
  const { contributorName, songTitle, organisationName, reviewUrl, expiresAt } = params;
  const expiry = new Date(expiresAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const html = baseTemplate(`
    <p style="color:#ffffff;font-size:15px;margin:0 0 8px;">Hi ${escapeHtml(contributorName)},</p>
    <p style="${MUTED} margin:0 0 20px;">
      ${escapeHtml(organisationName)} is asking you to review and confirm your share on
      <strong style="color:#c5cbd4;">${escapeHtml(songTitle)}</strong>.
    </p>
    <a href="${reviewUrl}" style="${BUTTON_STYLE}">Review your split</a>
    <p style="${MUTED} margin:20px 0 0;">This link expires on ${expiry}.</p>
  `);

  const text = `Hi ${contributorName},\n\n${organisationName} is asking you to review and confirm your share on "${songTitle}".\n\nReview your split: ${reviewUrl}\n\nThis link expires on ${expiry}.`;

  return {
    subject: `Confirm your split on "${songTitle}"`,
    html,
    text,
  };
}

export function confirmationNotificationEmail(params: {
  ownerName: string;
  contributorName: string;
  songTitle: string;
  action: 'confirmed' | 'change_requested';
  comment?: string | null;
  songUrl: string;
}) {
  const { ownerName, contributorName, songTitle, action, comment, songUrl } = params;
  const isConfirmed = action === 'confirmed';

  const html = baseTemplate(`
    <p style="color:#ffffff;font-size:15px;margin:0 0 8px;">Hi ${escapeHtml(ownerName)},</p>
    <p style="${MUTED} margin:0 0 20px;">
      <strong style="color:#c5cbd4;">${escapeHtml(contributorName)}</strong>
      ${isConfirmed ? 'confirmed their split on' : 'requested a change on'}
      <strong style="color:#c5cbd4;">${escapeHtml(songTitle)}</strong>.
    </p>
    ${
      !isConfirmed && comment
        ? `<div style="background:#141820;border:1px solid #262c38;border-radius:6px;padding:12px 16px;margin:0 0 20px;${MUTED}">
             "${escapeHtml(comment)}"
           </div>`
        : ''
    }
    <a href="${songUrl}" style="${BUTTON_STYLE}">View rights record</a>
  `);

  const text = `Hi ${ownerName},\n\n${contributorName} ${
    isConfirmed ? 'confirmed their split on' : 'requested a change on'
  } "${songTitle}".${!isConfirmed && comment ? `\n\nTheir note: "${comment}"` : ''}\n\nView the rights record: ${songUrl}`;

  return {
    subject: isConfirmed
      ? `${contributorName} confirmed their split on "${songTitle}"`
      : `${contributorName} requested a change on "${songTitle}"`,
    html,
    text,
  };
}

export function passwordResetEmail(params: { fullName: string; resetUrl: string; expiresInMinutes: number }) {
  const { fullName, resetUrl, expiresInMinutes } = params;
  const html = baseTemplate(`
    <p style="color:#ffffff;font-size:15px;margin:0 0 8px;">Hi ${escapeHtml(fullName)},</p>
    <p style="${MUTED} margin:0 0 20px;">
      Someone asked to reset the password on your Ospreyn account. If that was you, choose a
      new one below. If it wasn't, you can safely ignore this email — your password hasn't changed.
    </p>
    <a href="${resetUrl}" style="${BUTTON_STYLE}">Reset your password</a>
    <p style="${MUTED} margin:20px 0 0;">This link expires in ${expiresInMinutes} minutes and can only be used once.</p>
  `);
  const text = `Hi ${fullName},\n\nSomeone asked to reset the password on your Ospreyn account. If that was you, use this link:\n${resetUrl}\n\nIf it wasn't you, you can ignore this email — your password hasn't changed.\n\nThis link expires in ${expiresInMinutes} minutes and can only be used once.`;
  return { subject: 'Reset your Ospreyn password', html, text };
}

export function emailVerificationEmail(params: { fullName: string; verifyUrl: string }) {
  const { fullName, verifyUrl } = params;
  const html = baseTemplate(`
    <p style="color:#ffffff;font-size:15px;margin:0 0 8px;">Hi ${escapeHtml(fullName)},</p>
    <p style="${MUTED} margin:0 0 20px;">
      Confirm this is your email address so we know where to reach you about your rights records.
    </p>
    <a href="${verifyUrl}" style="${BUTTON_STYLE}">Verify email address</a>
  `);
  const text = `Hi ${fullName},\n\nConfirm this is your email address: ${verifyUrl}`;
  return { subject: 'Verify your Ospreyn email address', html, text };
}

export function organisationInviteEmail(params: {
  organisationName: string;
  inviterName: string;
  role: string;
  acceptUrl: string;
  expiresAt: string;
}) {
  const { organisationName, inviterName, role, acceptUrl, expiresAt } = params;
  const expiry = new Date(expiresAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const html = baseTemplate(`
    <p style="color:#ffffff;font-size:15px;margin:0 0 8px;">Hi,</p>
    <p style="${MUTED} margin:0 0 20px;">
      <strong style="color:#c5cbd4;">${escapeHtml(inviterName)}</strong> invited you to join
      <strong style="color:#c5cbd4;">${escapeHtml(organisationName)}</strong>'s workspace on Ospreyn as
      a${role === 'admin' ? 'n' : ''} <strong style="color:#c5cbd4;">${escapeHtml(role)}</strong>.
    </p>
    <a href="${acceptUrl}" style="${BUTTON_STYLE}">Accept invitation</a>
    <p style="${MUTED} margin:20px 0 0;">This invitation expires on ${expiry}. If you don't have an Ospreyn account yet, you'll be asked to create one with this same email address first.</p>
  `);
  const text = `Hi,\n\n${inviterName} invited you to join ${organisationName}'s workspace on Ospreyn as a ${role}.\n\nAccept: ${acceptUrl}\n\nThis invitation expires on ${expiry}. If you don't have an Ospreyn account yet, you'll be asked to create one with this same email address first.`;
  return { subject: `${inviterName} invited you to ${organisationName} on Ospreyn`, html, text };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
