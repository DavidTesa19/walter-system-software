import nodemailer from 'nodemailer';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SUBMISSION_TYPE_LABELS = {
  partner: 'partner',
  client: 'client',
  tiper: 'tiper',
};

const normalizeWhitespace = (value) => String(value ?? '').trim();

export const normalizeNotificationEmail = (value) => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  return EMAIL_PATTERN.test(normalized) ? normalized : null;
};

const getEnvRecipientEmails = () => {
  const raw = process.env.PUBLIC_SUBMISSION_NOTIFY_TO;
  if (typeof raw !== 'string' || !raw.trim()) {
    return [];
  }

  return raw
    .split(',')
    .map((email) => normalizeNotificationEmail(email))
    .filter(Boolean);
};

export const getNotificationRecipientsFromUsers = (users = []) => {
  const userRecipients = Array.isArray(users)
    ? users
        .map((user) => normalizeNotificationEmail(user?.notification_email ?? user?.notificationEmail))
        .filter(Boolean)
    : [];

  return [...new Set([...userRecipients, ...getEnvRecipientEmails()])];
};

const parsePort = (value) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const isSecureTransport = (value, port) => {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }

  return port === 465;
};

const getMailConfig = () => {
  const host = normalizeWhitespace(process.env.SMTP_HOST);
  const port = parsePort(process.env.SMTP_PORT);
  const user = normalizeWhitespace(process.env.SMTP_USER);
  const pass = normalizeWhitespace(process.env.SMTP_PASS);
  const from = normalizeWhitespace(process.env.MAIL_FROM) || user;

  if (!host || !port || !from) {
    return null;
  }

  return {
    host,
    port,
    secure: isSecureTransport(process.env.SMTP_SECURE, port),
    auth: user && pass ? { user, pass } : undefined,
    from,
  };
};

const createTransporter = (config) => {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.auth,
  });
};

const escapeHtml = (value) => {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

const getEntityDisplayName = (entity = {}) => {
  const fullName = [entity.first_name, entity.last_name]
    .map((part) => normalizeWhitespace(part))
    .filter(Boolean)
    .join(' ');

  return fullName
    || normalizeWhitespace(entity.company_name)
    || normalizeWhitespace(entity.email)
    || 'Bez názvu';
};

const getAppBaseUrl = () => {
  const raw = normalizeWhitespace(process.env.APP_BASE_URL) || normalizeWhitespace(process.env.ALLOWED_ORIGIN);
  return raw ? raw.replace(/\/+$/, '') : null;
};

const buildApprovalHint = () => {
  const appBaseUrl = getAppBaseUrl();
  if (!appBaseUrl) {
    return {
      text: 'Po přihlášení zkontrolujte sekce Ke schválení a Subjekty ke schválení.',
      html: '<p>Po přihlášení zkontrolujte sekce <strong>Ke schválení</strong> a <strong>Subjekty ke schválení</strong>.</p>',
    };
  }

  return {
    text: `Otevřít aplikaci: ${appBaseUrl}`,
    html: `<p><a href="${escapeHtml(appBaseUrl)}">Otevřít aplikaci</a></p>`,
  };
};

const buildMessage = ({ type, entity, commissions, entityId, commissionIds }) => {
  const submissionType = SUBMISSION_TYPE_LABELS[type] ?? 'záznam';
  const entityName = getEntityDisplayName(entity);
  const count = Array.isArray(commissions) ? commissions.length : 0;
  const approvalHint = buildApprovalHint();
  const createdAt = new Date().toLocaleString('cs-CZ');
  const commissionIdLine = Array.isArray(commissionIds) && commissionIds.length
    ? commissionIds.join(', ')
    : 'žádné';

  const subject = `Walter System: Nový ${submissionType} k ověření`;

  const text = [
    `Byl odeslán nový veřejný formulář typu: ${submissionType}.`,
    `Subjekt: ${entityName}`,
    `Subjekt ID: ${entityId || 'neuvedeno'}`,
    `Počet zakázek: ${count}`,
    `Zakázky ID: ${commissionIdLine}`,
    `Vytvořeno: ${createdAt}`,
    '',
    approvalHint.text,
  ].join('\n');

  const html = [
    '<div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">',
    `<h2 style="margin: 0 0 12px;">Nový ${escapeHtml(submissionType)} k ověření</h2>`,
    '<p>Byl odeslán nový veřejný formulář do schvalování.</p>',
    '<ul>',
    `<li><strong>Subjekt:</strong> ${escapeHtml(entityName)}</li>`,
    `<li><strong>Subjekt ID:</strong> ${escapeHtml(entityId || 'neuvedeno')}</li>`,
    `<li><strong>Počet zakázek:</strong> ${count}</li>`,
    `<li><strong>Zakázky ID:</strong> ${escapeHtml(commissionIdLine)}</li>`,
    `<li><strong>Vytvořeno:</strong> ${escapeHtml(createdAt)}</li>`,
    '</ul>',
    approvalHint.html,
    '</div>',
  ].join('');

  return { subject, text, html };
};

export const sendPublicSubmissionNotification = async ({
  recipients,
  type,
  entity,
  commissions,
  entityId,
  commissionIds,
}) => {
  const mailConfig = getMailConfig();
  const normalizedRecipients = [...new Set((Array.isArray(recipients) ? recipients : []).filter(Boolean))];

  if (!mailConfig) {
    return { sent: false, skipped: 'mail-not-configured' };
  }

  if (!normalizedRecipients.length) {
    return { sent: false, skipped: 'no-recipients' };
  }

  const transporter = createTransporter(mailConfig);
  const message = buildMessage({ type, entity, commissions, entityId, commissionIds });

  await transporter.sendMail({
    from: mailConfig.from,
    to: normalizedRecipients,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });

  return { sent: true, recipients: normalizedRecipients };
};