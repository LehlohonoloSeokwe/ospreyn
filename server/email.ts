/**
 * Ospreyn Transactional Email Service
 * Supports Resend (recommended), SendGrid, and Postmark.
 * Falls back to detailed console logging in development or when API keys are unset.
 */

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

interface ContributorInviteEmailParams {
  to: string;
  contributorName: string;
  songTitle: string;
  primaryArtist: string;
  reviewUrl: string;
  expiresAt: string;
  ownerName?: string;
  roles?: string[];
}

interface OwnerConfirmationEmailParams {
  to: string;
  ownerName: string;
  contributorName: string;
  songTitle: string;
  action: 'confirmed' | 'change_requested';
  versionNumber: number;
  comment?: string;
  timestamp: string;
}

export class EmailService {
  private resendApiKey: string | undefined;
  private sendgridApiKey: string | undefined;
  private postmarkToken: string | undefined;
  private emailFrom: string;
  private appOrigin: string;

  constructor() {
    this.resendApiKey = process.env.RESEND_API_KEY;
    this.sendgridApiKey = process.env.SENDGRID_API_KEY;
    this.postmarkToken = process.env.POSTMARK_SERVER_TOKEN;
    this.emailFrom = process.env.EMAIL_FROM || 'Ospreyn Music Rights <notifications@ospreyn.com>';
    this.appOrigin = process.env.APP_ORIGIN || 'http://localhost:3000';
  }

  /**
   * Sends an email through the configured provider or logs to console.
   */
  async sendEmail(params: SendEmailParams): Promise<{ success: boolean; provider: string; messageId?: string }> {
    const { to, subject, html, text } = params;

    // 1. Resend (Default / Recommended)
    if (this.resendApiKey) {
      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.resendApiKey}`,
          },
          body: JSON.stringify({
            from: this.emailFrom,
            to: [to],
            subject,
            html,
            text: text || html.replace(/<[^>]+>/g, ' ').trim(),
          }),
        });

        if (!response.ok) {
          const errData = await response.text();
          console.error(`[EmailService] Resend API error (${response.status}):`, errData);
          return { success: false, provider: 'resend' };
        }

        const data: any = await response.json();
        console.log(`[EmailService] Sent email to ${to} via Resend. ID: ${data.id}`);
        return { success: true, provider: 'resend', messageId: data.id };
      } catch (err) {
        console.error('[EmailService] Failed to send via Resend:', err);
        return { success: false, provider: 'resend' };
      }
    }

    // 2. SendGrid
    if (this.sendgridApiKey) {
      try {
        const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.sendgridApiKey}`,
          },
          body: JSON.stringify({
            personalizations: [{ to: [{ email: to }] }],
            from: { email: this.emailFrom.replace(/.*<([^>]+)>.*/, '$1') || this.emailFrom },
            subject,
            content: [{ type: 'text/html', value: html }],
          }),
        });

        if (!response.ok) {
          const errData = await response.text();
          console.error(`[EmailService] SendGrid API error (${response.status}):`, errData);
          return { success: false, provider: 'sendgrid' };
        }

        console.log(`[EmailService] Sent email to ${to} via SendGrid.`);
        return { success: true, provider: 'sendgrid' };
      } catch (err) {
        console.error('[EmailService] Failed to send via SendGrid:', err);
        return { success: false, provider: 'sendgrid' };
      }
    }

    // 3. Postmark
    if (this.postmarkToken) {
      try {
        const response = await fetch('https://api.postmarkapp.com/email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Postmark-Server-Token': this.postmarkToken,
          },
          body: JSON.stringify({
            From: this.emailFrom,
            To: to,
            Subject: subject,
            HtmlBody: html,
            TextBody: text || html.replace(/<[^>]+>/g, ' ').trim(),
          }),
        });

        if (!response.ok) {
          const errData = await response.text();
          console.error(`[EmailService] Postmark API error (${response.status}):`, errData);
          return { success: false, provider: 'postmark' };
        }

        const data: any = await response.json();
        console.log(`[EmailService] Sent email to ${to} via Postmark.`);
        return { success: true, provider: 'postmark', messageId: data.MessageID };
      } catch (err) {
        console.error('[EmailService] Failed to send via Postmark:', err);
        return { success: false, provider: 'postmark' };
      }
    }

    // Fallback: Mock / Dev Logging
    console.log('\n================== [TRANSACTIONAL EMAIL (DEV/MOCK)] ==================');
    console.log(`To: ${to}`);
    console.log(`From: ${this.emailFrom}`);
    console.log(`Subject: ${subject}`);
    console.log('Notice: Set RESEND_API_KEY in environment variables to deliver live transactional emails.');
    console.log('=======================================================================\n');

    return { success: true, provider: 'mock' };
  }

  /**
   * Sends an invitation to a collaborator with their single-use review link.
   */
  async sendContributorInvitation(params: ContributorInviteEmailParams) {
    const fullReviewUrl = params.reviewUrl.startsWith('http')
      ? params.reviewUrl
      : `${this.appOrigin.replace(/\/$/, '')}${params.reviewUrl.startsWith('/') ? '' : '/'}${params.reviewUrl}`;

    const expiryDate = new Date(params.expiresAt).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const subject = `Action Required: Review & Confirm Ownership Split for "${params.songTitle}"`;

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #090a0d; color: #c5cbd4; margin: 0; padding: 24px; }
    .container { max-width: 580px; margin: 0 auto; background-color: #0e1116; border: 1px solid #232936; border-radius: 8px; overflow: hidden; }
    .header { background-color: #141820; padding: 24px 32px; border-bottom: 2px solid #e6b359; }
    .header-title { color: #e6b359; font-size: 14px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; margin: 0; }
    .content { padding: 32px; }
    h1 { color: #ffffff; font-size: 20px; margin-top: 0; margin-bottom: 16px; font-weight: 600; }
    p { font-size: 14px; line-height: 1.6; color: #a0a8b5; margin-bottom: 20px; }
    .details-box { background-color: #161a22; border: 1px solid #232936; border-radius: 6px; padding: 18px 20px; margin: 24px 0; }
    .details-row { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 8px; }
    .details-row:last-child { margin-bottom: 0; }
    .label { color: #798394; }
    .value { color: #ffffff; font-weight: 600; text-align: right; }
    .btn-container { text-align: center; margin: 32px 0; }
    .btn { display: inline-block; background-color: #e6b359; color: #0c0e12 !important; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: 700; font-size: 14px; letter-spacing: 0.3px; }
    .footer { background-color: #0a0c10; padding: 20px 32px; border-top: 1px solid #1a1e27; font-size: 11px; color: #5e6675; text-align: center; line-height: 1.5; }
    .direct-link { word-break: break-all; color: #e6b359; font-family: monospace; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="header-title">Ospreyn &bull; Music Rights Infrastructure</div>
    </div>
    <div class="content">
      <h1>Collaborator Split Review Request</h1>
      <p>Hello ${params.contributorName},</p>
      <p>You have been invited by <strong>${params.ownerName || 'the song rights owner'}</strong> to review and confirm your agreed copyright and master recording ownership shares for the following release:</p>
      
      <div class="details-box">
        <div class="details-row"><span class="label">Song Title:</span> <span class="value">${params.songTitle}</span></div>
        <div class="details-row"><span class="label">Primary Artist:</span> <span class="value">${params.primaryArtist}</span></div>
        ${params.roles && params.roles.length > 0 ? `<div class="details-row"><span class="label">Your Role:</span> <span class="value">${params.roles.join(', ')}</span></div>` : ''}
        <div class="details-row"><span class="label">Link Expires:</span> <span class="value">${expiryDate}</span></div>
      </div>

      <p>No login or account creation is required. Click below to view the proposed composition and master recording splits, verify your percentages, and submit your confirmation:</p>

      <div class="btn-container">
        <a href="${fullReviewUrl}" class="btn" target="_blank">Review &amp; Confirm Split</a>
      </div>

      <p style="font-size: 12px; color: #798394;">If the button above does not work, copy and paste this link into your browser:</p>
      <p class="direct-link">${fullReviewUrl}</p>
    </div>
    <div class="footer">
      This is an automated rights documentation message from Ospreyn.<br>
      Notice: Ospreyn provides independent split-recording and workflow evidence infrastructure.
    </div>
  </div>
</body>
</html>
    `;

    return this.sendEmail({ to: params.to, subject, html });
  }

  /**
   * Notifies the song owner when a contributor confirms or requests a change.
   */
  async sendOwnerConfirmationNotification(params: OwnerConfirmationEmailParams) {
    const isConfirmed = params.action === 'confirmed';
    const subject = isConfirmed
      ? `Confirmed: ${params.contributorName} agreed to splits for "${params.songTitle}" (v${params.versionNumber})`
      : `Change Requested: ${params.contributorName} requested changes for "${params.songTitle}" (v${params.versionNumber})`;

    const actionBadge = isConfirmed
      ? '<span style="color: #34d399; font-weight: bold;">Confirmed Split Agreement</span>'
      : '<span style="color: #f87171; font-weight: bold;">Requested Split Modification</span>';

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #090a0d; color: #c5cbd4; margin: 0; padding: 24px; }
    .container { max-width: 580px; margin: 0 auto; background-color: #0e1116; border: 1px solid #232936; border-radius: 8px; overflow: hidden; }
    .header { background-color: #141820; padding: 24px 32px; border-bottom: 2px solid ${isConfirmed ? '#34d399' : '#f87171'}; }
    .header-title { color: ${isConfirmed ? '#34d399' : '#f87171'}; font-size: 14px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; margin: 0; }
    .content { padding: 32px; }
    h1 { color: #ffffff; font-size: 20px; margin-top: 0; margin-bottom: 16px; font-weight: 600; }
    p { font-size: 14px; line-height: 1.6; color: #a0a8b5; margin-bottom: 20px; }
    .details-box { background-color: #161a22; border: 1px solid #232936; border-radius: 6px; padding: 18px 20px; margin: 24px 0; }
    .details-row { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 8px; }
    .details-row:last-child { margin-bottom: 0; }
    .label { color: #798394; }
    .value { color: #ffffff; font-weight: 600; text-align: right; }
    .comment-box { background-color: #1a1616; border: 1px solid #4a2222; border-radius: 6px; padding: 14px; margin: 20px 0; font-size: 13px; color: #fca5a5; }
    .footer { background-color: #0a0c10; padding: 20px 32px; border-top: 1px solid #1a1e27; font-size: 11px; color: #5e6675; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="header-title">Ospreyn &bull; Contributor Confirmation Update</div>
    </div>
    <div class="content">
      <h1>${isConfirmed ? 'Split Confirmed' : 'Modification Requested'}</h1>
      <p>Hello ${params.ownerName},</p>
      <p>Contributor <strong>${params.contributorName}</strong> has reviewed their proposed ownership shares for <strong>"${params.songTitle}"</strong> and took action: ${actionBadge}.</p>

      <div class="details-box">
        <div class="details-row"><span class="label">Song:</span> <span class="value">${params.songTitle}</span></div>
        <div class="details-row"><span class="label">Record Version:</span> <span class="value">v${params.versionNumber}.0</span></div>
        <div class="details-row"><span class="label">Contributor:</span> <span class="value">${params.contributorName}</span></div>
        <div class="details-row"><span class="label">Recorded At:</span> <span class="value">${params.timestamp}</span></div>
      </div>

      ${params.comment ? `
      <p style="font-weight: 600; color: #ffffff; margin-bottom: 6px;">Contributor Note / Reason:</p>
      <div class="comment-box">${params.comment}</div>
      ` : ''}

      <p>You can view the updated rights record status, audit ledger, and split sheets directly inside your Ospreyn workspace.</p>
    </div>
    <div class="footer">
      Ospreyn Music Rights Infrastructure &bull; Automated Ledger Notification
    </div>
  </div>
</body>
</html>
    `;

    return this.sendEmail({ to: params.to, subject, html });
  }
}

export const emailService = new EmailService();
