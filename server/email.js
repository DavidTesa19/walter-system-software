import nodemailer from 'nodemailer';

let cachedTransporter = null;
let configWarningLogged = false;

const parseBoolean = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
};

const parseRecipientList = (value) => {
  if (!value || typeof value !== 'string') return [];
  return value.split(/[,;]/).map((item) => item.trim()).filter(Boolean);
};

export const isEmailConfigured = () => {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
};

const getTransporter = () => {
  if (cachedTransporter) return cachedTransporter;

  if (!isEmailConfigured()) {
    if (!configWarningLogged) {
      console.warn('[email] SMTP not configured (need SMTP_HOST, SMTP_USER, SMTP_PASS). Emails will be skipped.');
      configWarningLogged = true;
    }
    return null;
  }

  const port = Number(process.env.SMTP_PORT) || 587;
  // Auto-detect TLS: port 465 implicit TLS; otherwise STARTTLS unless SMTP_SECURE explicitly set.
  const secure = process.env.SMTP_SECURE !== undefined ? parseBoolean(process.env.SMTP_SECURE) : port === 465;

  cachedTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return cachedTransporter;
};

const TYPE_LABEL_CZ = {
  partner: 'Partner',
  client: 'Klient',
  tiper: 'Tipař',
};

const FIELD_LABELS_CZ = {
  first_name: 'Jméno',
  last_name: 'Příjmení',
  company_name: 'Společnost',
  field: 'Obor',
  location: 'Lokalita',
  phone: 'Telefon',
  email: 'E-mail',
  website: 'Web',
  info: 'Info / poznámky',
  position: 'Zakázka / pozice',
  service_position: 'Typ služby',
  service: 'Požadovaná služba',
  assigned_to: 'Přiřazeno komu',
  budget: 'Rozpočet',
  commission_value: 'Provize',
  priority: 'Priorita',
  state: 'Stav',
  deadline: 'Termín',
  notes: 'Poznámky',
  is_tipped: 'Tipovaná',
};

const formatValue = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'Ano' : 'Ne';
  if (Array.isArray(value)) return value.filter((item) => item !== null && item !== undefined && item !== '').join(', ');
  return String(value).trim();
};

const formatRecord = (record) => {
  if (!record || typeof record !== 'object') return [];
  const lines = [];
  for (const [key, rawValue] of Object.entries(record)) {
    if (key === 'id' || key === 'status' || key === 'created_at' || key === 'updated_at') continue;
    const value = formatValue(rawValue);
    if (!value) continue;
    const label = FIELD_LABELS_CZ[key] || key;
    lines.push({ label, value });
  }
  return lines;
};

const renderTextSection = (title, lines) => {
  if (!lines.length) return '';
  const body = lines.map(({ label, value }) => `  ${label}: ${value}`).join('\n');
  return `${title}\n${body}`;
};

const escapeHtml = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const renderHtmlSection = (title, lines) => {
  if (!lines.length) return '';
  const rows = lines
    .map(({ label, value }) =>
      `<tr><td style="padding:4px 12px 4px 0;color:#555;vertical-align:top;white-space:nowrap;">${escapeHtml(label)}</td>` +
      `<td style="padding:4px 0;color:#111;">${escapeHtml(value).replace(/\n/g, '<br>')}</td></tr>`,
    )
    .join('');
  return `<h3 style="margin:24px 0 8px;color:#111;font-size:15px;">${escapeHtml(title)}</h3>` +
    `<table style="border-collapse:collapse;font-size:14px;">${rows}</table>`;
};

const buildAdminMessage = ({ type, entity, commissions }) => {
  const typeLabel = TYPE_LABEL_CZ[type] || type;
  const entityLines = formatRecord(entity);
  const entityIdentifier = entity?.entity_id ? ` (${entity.entity_id})` : '';
  const subject = `[Walter System] Nová žádost o spolupráci – ${typeLabel}${entityIdentifier}`;

  const textParts = [
    `Byla odeslána nová žádost o spolupráci k schválení.`,
    `Typ subjektu: ${typeLabel}`,
    entity?.entity_id ? `Subjekt ID: ${entity.entity_id}` : null,
    '',
    renderTextSection('Údaje o subjektu:', entityLines),
  ].filter(Boolean);

  commissions.forEach((commission, index) => {
    const lines = formatRecord(commission);
    if (!lines.length) return;
    const heading = commissions.length > 1 ? `Zakázka ${index + 1}${commission?.commission_id ? ` (${commission.commission_id})` : ''}:` : `Zakázka${commission?.commission_id ? ` (${commission.commission_id})` : ''}:`;
    textParts.push('', renderTextSection(heading, lines));
  });

  textParts.push('', 'Žádost čeká na schválení v aplikaci Walter System.');

  const htmlParts = [
    `<p>Byla odeslána nová žádost o spolupráci k schválení.</p>`,
    `<p><strong>Typ subjektu:</strong> ${escapeHtml(typeLabel)}` +
      (entity?.entity_id ? `<br><strong>Subjekt ID:</strong> ${escapeHtml(entity.entity_id)}` : '') + `</p>`,
    renderHtmlSection('Údaje o subjektu', entityLines),
  ];

  commissions.forEach((commission, index) => {
    const lines = formatRecord(commission);
    if (!lines.length) return;
    const heading = commissions.length > 1
      ? `Zakázka ${index + 1}${commission?.commission_id ? ` (${commission.commission_id})` : ''}`
      : `Zakázka${commission?.commission_id ? ` (${commission.commission_id})` : ''}`;
    htmlParts.push(renderHtmlSection(heading, lines));
  });

  htmlParts.push(`<p style="margin-top:24px;color:#555;font-size:13px;">Žádost čeká na schválení v aplikaci Walter System.</p>`);

  return {
    subject,
    text: textParts.join('\n'),
    html: `<div style="font-family:Inter,Arial,sans-serif;color:#111;font-size:14px;line-height:1.5;">${htmlParts.join('')}</div>`,
  };
};

const buildSubmitterMessage = ({ type, entity }) => {
  const typeLabel = TYPE_LABEL_CZ[type] || type;
  const idSuffix = entity?.entity_id ? ` Vaše ID žádosti je ${entity.entity_id}.` : '';
  const subject = `Walter System – potvrzení žádosti o spolupráci`;
  const text = [
    `Dobrý den,`,
    ``,
    `děkujeme za odeslání žádosti o spolupráci (${typeLabel}). Vaše žádost byla úspěšně přijata a čeká na schválení.${idSuffix}`,
    ``,
    `Brzy se Vám ozveme.`,
    ``,
    `S pozdravem,`,
    `Walter System`,
  ].join('\n');

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;color:#111;font-size:14px;line-height:1.6;">
      <p>Dobrý den,</p>
      <p>děkujeme za odeslání žádosti o spolupráci (<strong>${escapeHtml(typeLabel)}</strong>). Vaše žádost byla úspěšně přijata a čeká na schválení.${
        entity?.entity_id ? ` Vaše ID žádosti je <strong>${escapeHtml(entity.entity_id)}</strong>.` : ''
      }</p>
      <p>Brzy se Vám ozveme.</p>
      <p style="margin-top:24px;">S pozdravem,<br>Walter System</p>
    </div>
  `;

  return { subject, text, html };
};

const sendMail = async (mailOptions) => {
  const transporter = getTransporter();
  if (!transporter) return null;
  return transporter.sendMail(mailOptions);
};

export const notifyPublicSubmission = async ({ type, entity, commissions = [] }) => {
  if (!isEmailConfigured()) return;

  const adminRecipients = parseRecipientList(process.env.PUBLIC_SUBMISSION_NOTIFY_TO);
  const fromAddress = process.env.MAIL_FROM || process.env.SMTP_USER;

  const tasks = [];

  if (adminRecipients.length > 0) {
    const message = buildAdminMessage({ type, entity, commissions });
    tasks.push(
      sendMail({
        from: fromAddress,
        to: adminRecipients.join(', '),
        subject: message.subject,
        text: message.text,
        html: message.html,
      }).then(
        () => console.log(`[email] Admin notification sent for ${type} submission ${entity?.entity_id || entity?.id || ''}`),
        (err) => console.error('[email] Failed to send admin notification:', err?.message || err),
      ),
    );
  } else {
    console.warn('[email] PUBLIC_SUBMISSION_NOTIFY_TO is not set; skipping admin notification.');
  }

  const submitterEmail = typeof entity?.email === 'string' ? entity.email.trim() : '';
  if (submitterEmail) {
    const message = buildSubmitterMessage({ type, entity });
    tasks.push(
      sendMail({
        from: fromAddress,
        to: submitterEmail,
        subject: message.subject,
        text: message.text,
        html: message.html,
      }).then(
        () => console.log(`[email] Submitter confirmation sent to ${submitterEmail}`),
        (err) => console.error('[email] Failed to send submitter confirmation:', err?.message || err),
      ),
    );
  }

  await Promise.allSettled(tasks);
};
