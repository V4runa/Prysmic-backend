import { RESET_PASSWORD_PATH, VERIFY_EMAIL_PATH } from '../account.constants';

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function verificationLink(appUrl: string, token: string): string {
  return actionLink(appUrl, VERIFY_EMAIL_PATH, token);
}

export function resetLink(appUrl: string, token: string): string {
  return actionLink(appUrl, RESET_PASSWORD_PATH, token);
}

export function renderVerificationEmail(url: string): RenderedEmail {
  const subject = 'Confirm your Prysmic email';
  const text = [
    'Prysmic',
    '',
    'Confirm your email',
    '',
    'You opened a journal. Confirm this address so it knows the way back to you.',
    '',
    'The link lasts 48 hours and can be used only once.',
    url,
    '',
    'If you did not create an account, let this pass by. Nothing will change.',
  ].join('\n');
  const html = layout({
    preheader: 'A quiet confirmation for your journal.',
    heading: 'Confirm your email',
    paragraphs: [
      'You opened a journal. Confirm this address so it knows the way back to you.',
      'The link lasts 48 hours and can be used only once.',
    ],
    actionLabel: 'Confirm this address',
    url,
    footnote:
      'If you did not create an account, let this pass by. Nothing will change.',
  });
  return { subject, html, text };
}

export function renderPasswordResetEmail(url: string): RenderedEmail {
  const subject = 'Reset your Prysmic password';
  const text = [
    'Prysmic',
    '',
    'A way back in',
    '',
    'Someone asked to choose a new password for this journal. If that was you, use the link below. It lasts one hour, then it goes quiet.',
    '',
    url,
    '',
    'If it was not you, ignore this note. The password stays as it is.',
  ].join('\n');
  const html = layout({
    preheader: 'A way back to your journal.',
    heading: 'A way back in',
    paragraphs: [
      'Someone asked to choose a new password for this journal. If that was you, follow the link. It lasts one hour, then it goes quiet.',
    ],
    actionLabel: 'Choose a new password',
    url,
    footnote:
      'If it was not you, ignore this note. The password stays as it is.',
  });
  return { subject, html, text };
}

function actionLink(appUrl: string, path: string, token: string): string {
  const base = appUrl.replace(/\/$/, '');
  return `${base}${path}?token=${encodeURIComponent(token)}`;
}

function layout(input: {
  preheader: string;
  heading: string;
  paragraphs: string[];
  actionLabel: string;
  url: string;
  footnote: string;
}): string {
  const href = escapeHtml(input.url);
  const paragraphs = input.paragraphs
    .map(
      (paragraph) =>
        `<p style="margin:0 0 16px;font-family:Georgia,'Iowan Old Style',Palatino,serif;font-size:16px;line-height:1.6;color:#e4dccc;">${escapeHtml(paragraph)}</p>`,
    )
    .join('');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <title>Prysmic</title>
</head>
<body style="margin:0;padding:0;background:#141311;color:#e8e2d6;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(input.preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#141311;">
    <tr>
      <td align="center" style="padding:48px 20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;">
          <tr>
            <td style="font-family:Georgia,'Iowan Old Style',Palatino,serif;font-size:12px;letter-spacing:0.22em;text-transform:uppercase;color:#a39886;">Prysmic</td>
          </tr>
          <tr>
            <td style="padding-top:28px;font-family:Georgia,'Iowan Old Style',Palatino,serif;font-size:28px;line-height:1.3;color:#f4efe6;">${escapeHtml(input.heading)}</td>
          </tr>
          <tr>
            <td style="padding-top:18px;">${paragraphs}</td>
          </tr>
          <tr>
            <td style="padding-top:12px;">
              <a href="${href}" style="display:inline-block;padding:12px 22px;background:#2a2622;color:#f4efe6;text-decoration:none;border:1px solid #6e6352;font-family:Georgia,'Iowan Old Style',Palatino,serif;font-size:15px;">${escapeHtml(input.actionLabel)}</a>
            </td>
          </tr>
          <tr>
            <td style="padding-top:28px;font-family:Georgia,'Iowan Old Style',Palatino,serif;font-size:13px;line-height:1.6;color:#9c9284;">
              If the button is shy, copy this link into your browser:<br>
              <a href="${href}" style="color:#cfc3ae;word-break:break-all;">${href}</a>
            </td>
          </tr>
          <tr>
            <td style="padding-top:32px;font-family:Georgia,'Iowan Old Style',Palatino,serif;font-size:13px;line-height:1.6;color:#7f7668;">${escapeHtml(input.footnote)}</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
