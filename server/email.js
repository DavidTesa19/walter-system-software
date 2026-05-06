import axios from 'axios';

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

let configWarningLogged = false;

const parseRecipientList = (value) => {
  if (!value || typeof value !== 'string') return [];
  return value.split(/[,;]/).map((item) => item.trim()).filter(Boolean);
};

export const isEmailConfigured = () => Boolean(process.env.BREVO_API_KEY);

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
  if (Array.isArray(value)) return value.filter((v) => v !== null && v !== undefined && v !== '').join(', ');
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

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const renderHtmlSection = (title, lines) => {
  if (!lines.length) return '';
  const rows = lines
    .map(
      ({ label, value }) =>
        `<tr>` +
        `<td style="padding:4px 16px 4px 0;color:#666;vertical-align:top;white-space:nowrap;font-size:13px;">${escapeHtml(label)}</td>` +
        `<td style="padding:4px 0;color:#111;font-size:13px;">${escapeHtml(value).replace(/\n/g, '<br>')}</td>` +
        `</tr>`,
    )
    .join('');
  return (
    `<h3 style="margin:20px 0 6px;color:#222;font-size:14px;font-weight:600;">${escapeHtml(title)}</h3>` +
    `<table style="border-collapse:collapse;">${rows}</table>`
  );
};

const renderTextSection = (title, lines) => {
  if (!lines.length) return '';
  return [title, ...lines.map(({ label, value }) => `  ${label}: ${value}`)].join('\n');
};

const buildAdminMessage = ({ type, entity, commissions }) => {
  const typeLabel = TYPE_LABEL_CZ[type] || type;
  const entityId = entity?.entity_id || '';
  const subject = `[Walter System] Nová žádost o spolupráci – ${typeLabel}${entityId ? ` (${entityId})` : ''}`;

  const entityLines = formatRecord(entity);

  const htmlSections = [
    `<p style="font-size:14px;color:#333;">Byla odeslána nová žádost o spolupráci k&nbsp;schválení.</p>`,
    `<p style="font-size:14px;"><strong>Typ subjektu:</strong> ${escapeHtml(typeLabel)}` +
      (entityId ? `&nbsp;&nbsp;<strong>ID:</strong> ${escapeHtml(entityId)}` : '') +
      `</p>`,
    renderHtmlSection('Údaje o subjektu', entityLines),
  ];

  const textSections = [
    `Nová žádost o spolupráci k schválení.\nTyp: ${typeLabel}${entityId ? `  ID: ${entityId}` : ''}`,
    renderTextSection('Údaje o subjektu:', entityLines),
  ];

  commissions.forEach((commission, index) => {
    const lines = formatRecord(commission);
    if (!lines.length) return;
    const heading =
      commissions.length > 1
        ? `Zakázka ${index + 1}${commission?.commission_id ? ` (${commission.commission_id})` : ''}`
        : `Zakázka${commission?.commission_id ? ` (${commission.commission_id})` : ''}`;
    htmlSections.push(renderHtmlSection(heading, lines));
    textSections.push(renderTextSection(`${heading}:`, lines));
  });

  htmlSections.push(
    `<p style="margin-top:24px;font-size:12px;color:#888;">Žádost čeká na schválení v&nbsp;aplikaci Walter System.</p>`,
  );
  textSections.push('\nŽádost čeká na schválení v aplikaci Walter System.');

  const html =
    `<div style="font-family:Inter,Arial,sans-serif;line-height:1.6;color:#111;max-width:600px;">` +
    htmlSections.join('') +
    `</div>`;

  return { subject, htmlContent: html, textContent: textSections.join('\n\n') };
};

const buildSubmitterMessage = ({ type, entity }) => {
  const typeLabel = TYPE_LABEL_CZ[type] || type;
  const entityId = entity?.entity_id;
  const subject = `Walter System – potvrzení žádosti o spolupráci`;

  const idNote = entityId ? ` Vaše ID žádosti je <strong>${escapeHtml(entityId)}</strong>.` : '';
  const idNotePlain = entityId ? ` Vaše ID žádosti je ${entityId}.` : '';

  const html =
    `<div style="font-family:Inter,Arial,sans-serif;line-height:1.6;color:#111;max-width:600px;">` +
    `<p>Dobrý den,</p>` +
    `<p>děkujeme za odeslání žádosti o spolupráci (<strong>${escapeHtml(typeLabel)}</strong>). ` +
    `Vaše žádost byla úspěšně přijata a čeká na schválení.${idNote}</p>` +
    `<p>Brzy se Vám ozveme.</p>` +
    `<p style="margin-top:24px;">S pozdravem,<br><strong>Walter System</strong></p>` +
    `</div>`;

  const text =
    `Dobrý den,\n\n` +
    `děkujeme za odeslání žádosti o spolupráci (${typeLabel}). ` +
    `Vaše žádost byla úspěšně přijata a čeká na schválení.${idNotePlain}\n\n` +
    `Brzy se Vám ozveme.\n\nS pozdravem,\nWalter System`;

  return { subject, htmlContent: html, textContent: text };
};

const getSenderAddress = () => {
  const raw = process.env.MAIL_FROM || '';
  // Accept "Name <email>" or bare "email"
  const match = raw.match(/<(.+?)>/);
  if (match) return { name: raw.slice(0, raw.indexOf('<')).trim() || 'Walter System', email: match[1].trim() };
  const email = raw.trim();
  return email ? { name: 'Walter System', email } : { name: 'Walter System', email: 'noreply@waltersystem.cz' };
};

const sendBrevoEmail = async ({ to, subject, htmlContent, textContent }) => {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return;

  const sender = getSenderAddress();

  await axios.post(
    BREVO_API_URL,
    {
      sender,
      to: to.map((address) => ({ email: address })),
      subject,
      htmlContent,
      textContent,
    },
    {
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    },
  );
};

export const notifyPublicSubmission = async ({ type, entity, commissions = [] }) => {
  if (!isEmailConfigured()) {
    if (!configWarningLogged) {
      console.warn('[email] BREVO_API_KEY is not set — email notifications are disabled.');
      configWarningLogged = true;
    }
    return;
  }

  const tasks = [];

  const adminRecipients = parseRecipientList(process.env.PUBLIC_SUBMISSION_NOTIFY_TO);
  if (adminRecipients.length > 0) {
    const message = buildAdminMessage({ type, entity, commissions });
    tasks.push(
      sendBrevoEmail({ to: adminRecipients, ...message }).then(
        () => console.log(`[email] Admin notification sent — ${type} ${entity?.entity_id || entity?.id || ''}`),
        (err) => {
          const detail = err?.response?.data ? JSON.stringify(err.response.data) : err?.message || String(err);
          console.error(`[email] Failed to send admin notification: ${detail}`);
        },
      ),
    );
  } else {
    console.warn('[email] PUBLIC_SUBMISSION_NOTIFY_TO is not set — skipping admin notification.');
  }

  const submitterEmail = typeof entity?.email === 'string' ? entity.email.trim() : '';
  if (submitterEmail) {
    const message = buildSubmitterMessage({ type, entity });
    tasks.push(
      sendBrevoEmail({ to: [submitterEmail], ...message }).then(
        () => console.log(`[email] Submitter confirmation sent to ${submitterEmail}`),
        (err) => {
          const detail = err?.response?.data ? JSON.stringify(err.response.data) : err?.message || String(err);
          console.error(`[email] Failed to send submitter confirmation: ${detail}`);
        },
      ),
    );
  }

  await Promise.allSettled(tasks);
};
