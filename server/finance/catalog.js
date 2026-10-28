// Everything the app pays for or depends on, as found in the code
// (2026-10-24). The finance screen offers to import these as cost entries;
// once imported, an entry is an ordinary record the admin edits, so the
// amounts here are only starting estimates (isEstimate stays true until
// someone confirms the real price).
//
// envKeys name environment variables only. The finance API reports whether
// each one is set on the server, never its value. Keys with scope 'client'
// are baked into the browser build (VITE_*), so the server cannot see them.

export const CATEGORY_LABELS = {
  hosting: 'Hosting a databáze',
  domain: 'Domény',
  ai: 'AI a API',
  email: 'E-mail',
  maps: 'Mapy',
  storage: 'Úložiště a zálohy',
  dev: 'Vývoj',
  software: 'Software a licence',
  other: 'Ostatní',
};

export const BILLING_CYCLES = ['monthly', 'yearly', 'one_time', 'usage'];
export const EXPENSE_STATUSES = ['active', 'planned', 'paused', 'cancelled'];
export const CURRENCIES = ['CZK', 'USD', 'EUR'];

// Where real billed amounts can come from (providers.js).
export const COST_SOURCES = ['anthropic', 'openai', 'railway', 'cloudflare', 'google'];

export const CATALOG = [
  {
    key: 'railway-plan',
    name: 'Railway – tarif',
    vendor: 'Railway',
    category: 'hosting',
    billingCycle: 'monthly',
    amount: 5,
    currency: 'USD',
    costSource: 'railway',
    description:
      'Měsíční poplatek za hosting. Tarif Hobby stojí $5 a obsahuje $5 kreditu na spotřebu; tarif Pro $20 za člena týmu. ' +
      'Railway účtuje kartou; s tokenem se načítají skutečné faktury včetně DPH (tarif i spotřeba dohromady).',
    usedFor:
      'Běží tu celá aplikace: API (api.waltersystem.cz), webová aplikace (app.waltersystem.cz), ' +
      'veřejný formulář (form.waltersystem.cz) a databáze PostgreSQL.',
    envKeys: [{ name: 'RAILWAY_API_TOKEN', optional: true }],
    dashboardUrl: 'https://railway.com/dashboard',
    pricingUrl: 'https://railway.com/pricing',
  },
  {
    key: 'railway-usage',
    name: 'Railway – spotřeba nad rámec tarifu',
    vendor: 'Railway',
    category: 'hosting',
    billingCycle: 'usage',
    amount: 5,
    currency: 'USD',
    costSource: 'railway',
    description:
      'CPU, paměť, síť a disk všech služeb nad kredit, který je v tarifu. Čtyři služby (tři weby a databáze) kredit $5 obvykle přesáhnou. ' +
      'Skutečnou částku ukazuje Railway v Usage.',
    usedFor: 'Provoz API, aplikace, formuláře a databáze PostgreSQL (zálohy uvnitř databáze zabírají místo na disku).',
    envKeys: [{ name: 'DATABASE_URL' }, { name: 'RAILWAY_API_TOKEN', optional: true }],
    dashboardUrl: 'https://railway.com/dashboard',
    pricingUrl: 'https://docs.railway.com/pricing/plans',
  },
  {
    key: 'domain-waltersystem',
    name: 'Doména waltersystem.cz',
    vendor: 'WEDOS Internet, a.s.',
    // Registrar and expiry date are read from the public .cz registry (checks.js).
    domain: 'waltersystem.cz',
    category: 'domain',
    billingCycle: 'yearly',
    amount: 250,
    currency: 'CZK',
    description:
      'Roční obnova domény .cz u registrátora WEDOS. Datum expirace se čte z veřejného registru CZ.NIC; ' +
      'cenu doplňte podle faktury od WEDOS.',
    usedFor: 'Adresy app.waltersystem.cz, api.waltersystem.cz a form.waltersystem.cz; odesílatel e-mailů noreply@waltersystem.cz.',
    envKeys: [{ name: 'ALLOWED_ORIGIN', optional: true }, { name: 'APP_BASE_URL', optional: true }],
    dashboardUrl: 'https://client.wedos.com/',
    pricingUrl: 'https://www.wedos.cz/domeny',
  },
  {
    key: 'anthropic-api',
    name: 'Anthropic API (Claude)',
    vendor: 'Anthropic',
    category: 'ai',
    billingCycle: 'usage',
    amount: 20,
    currency: 'USD',
    costSource: 'anthropic',
    description:
      'Platí se za tokeny. Claude Opus 5.5: $4 za milion vstupních a $20 za milion výstupních tokenů, čtení z cache $0,20. ' +
      'Claude Sonnet 4.5: $3 / $15. Kredit se dobíjí předem v Claude Console.',
    usedFor:
      'Jarvis (claude-opus-5-5), Claude v AI Asistentovi (claude-sonnet-4-5), přepis naskenovaných dokumentů a fotek, ' +
      'přílohy Jarvise (Files API – soubory se platí jako vstupní tokeny, když je Jarvis čte).',
    envKeys: [{ name: 'ANTHROPIC_API_KEY' }, { name: 'ANTHROPIC_ADMIN_KEY', optional: true }],
    dashboardUrl: 'https://platform.claude.com/cost',
    pricingUrl: 'https://platform.claude.com/docs/en/about-claude/pricing',
  },
  {
    key: 'openai-api',
    name: 'OpenAI API',
    vendor: 'OpenAI',
    category: 'ai',
    billingCycle: 'usage',
    amount: 5,
    currency: 'USD',
    costSource: 'openai',
    description:
      'Platí se za tokeny. GPT-5: $1,25 / $10 za milion tokenů, GPT-5 mini $0,25 / $2, GPT-4o $2,50 / $10, GPT-4o mini $0,15 / $0,60. ' +
      'Přepis řeči gpt-transcribe zhruba $0,0045 za minutu, předčítání gpt-4o-mini-tts zhruba $0,015 za minutu.',
    usedFor:
      'AI Asistent (modely GPT-5, GPT-5 mini, GPT-4o, GPT-4o mini) a hlas Jarvise: přepis mluveného dotazu a předčítání odpovědí.',
    envKeys: [{ name: 'OPENAI_API_KEY' }, { name: 'OPENAI_ADMIN_KEY', optional: true }],
    dashboardUrl: 'https://platform.openai.com/settings/organization/usage',
    pricingUrl: 'https://developers.openai.com/api/docs/pricing',
  },
  {
    key: 'brave-search',
    name: 'Brave Search API',
    vendor: 'Brave',
    category: 'ai',
    billingCycle: 'usage',
    amount: 0,
    currency: 'USD',
    description:
      '$5 za 1 000 dotazů, každý měsíc je $5 kreditu zdarma (zhruba 1 000 dotazů). Nad kredit se strhává z karty.',
    usedFor: 'Vyhledávání na webu v AI Asistentovi (přepínač „Web Search“).',
    envKeys: [{ name: 'BRAVE_SEARCH_API_KEY' }],
    dashboardUrl: 'https://api-dashboard.search.brave.com/',
    pricingUrl: 'https://brave.com/search/api/',
  },
  {
    key: 'brevo',
    name: 'Brevo – e-maily',
    vendor: 'Brevo',
    category: 'email',
    billingCycle: 'monthly',
    amount: 0,
    currency: 'USD',
    description: 'Tarif Free: 300 e-mailů denně zdarma. Tarif Starter od $9 měsíčně (5 000 e-mailů).',
    usedFor:
      'Upozornění e-mailem: nové záznamy z veřejného formuláře a upozornění pro adminy (např. nezdařená záloha).',
    envKeys: [{ name: 'BREVO_API_KEY' }, { name: 'MAIL_FROM', optional: true }, { name: 'PUBLIC_SUBMISSION_NOTIFY_TO', optional: true }],
    dashboardUrl: 'https://app.brevo.com/',
    pricingUrl: 'https://www.brevo.com/pricing/',
  },
  {
    key: 'google-maps',
    name: 'Google Maps Platform',
    vendor: 'Google Cloud',
    category: 'maps',
    billingCycle: 'usage',
    amount: 0,
    currency: 'USD',
    description:
      'Platí se za požadavky nad měsíční limit zdarma (u našeptávače Places zhruba 10 000 požadavků měsíčně). ' +
      'Vyžaduje platební účet v Google Cloud.',
    usedFor: 'Našeptávání adres a lokalit a výběr místa na mapě u subjektů (Places API, Maps JavaScript API).',
    costSource: 'google',
    envKeys: [
      { name: 'VITE_GOOGLE_MAPS_API_KEY', scope: 'client' },
      { name: 'GOOGLE_BILLING_SERVICE_ACCOUNT', optional: true },
      { name: 'GOOGLE_BILLING_EXPORT_TABLE', optional: true },
    ],
    dashboardUrl: 'https://console.cloud.google.com/billing',
    pricingUrl: 'https://developers.google.com/maps/billing-and-pricing/pricing',
  },
  {
    key: 'cloudflare-r2',
    name: 'Cloudflare R2 – zálohy mimo Railway',
    vendor: 'Cloudflare',
    category: 'storage',
    billingCycle: 'usage',
    amount: 0,
    currency: 'USD',
    description: '10 GB úložiště měsíčně zdarma, pak $0,015 za GB a měsíc. Stahování dat je zdarma.',
    usedFor: 'Šifrované kopie nočních záloh databáze mimo Railway (Bezpečnost a zálohy › Zálohy).',
    costSource: 'cloudflare',
    envKeys: [
      { name: 'CLOUDFLARE_API_TOKEN', optional: true },
      { name: 'CLOUDFLARE_ACCOUNT_ID', optional: true },
      { name: 'BACKUP_S3_ENDPOINT' },
      { name: 'BACKUP_S3_BUCKET' },
      { name: 'BACKUP_S3_ACCESS_KEY_ID' },
      { name: 'BACKUP_S3_SECRET_ACCESS_KEY' },
      { name: 'BACKUP_ENCRYPTION_KEY' },
    ],
    dashboardUrl: 'https://dash.cloudflare.com/',
    pricingUrl: 'https://developers.cloudflare.com/r2/pricing/',
  },
  {
    key: 'github',
    name: 'GitHub – repozitář kódu',
    vendor: 'GitHub',
    category: 'dev',
    billingCycle: 'monthly',
    amount: 0,
    currency: 'USD',
    description: 'Soukromý repozitář je v tarifu Free zdarma. Upravte, pokud platíte GitHub Pro nebo Team.',
    usedFor: 'Zdrojový kód aplikace (DavidTesa19/walter-system-software); Railway z něj nasazuje.',
    envKeys: [],
    dashboardUrl: 'https://github.com/settings/billing',
    pricingUrl: 'https://github.com/pricing',
  },
  {
    key: 'ares',
    name: 'ARES – registr ekonomických subjektů',
    vendor: 'Ministerstvo financí ČR',
    category: 'other',
    billingCycle: 'monthly',
    amount: 0,
    currency: 'CZK',
    isEstimate: false,
    description: 'Veřejné rozhraní státu, zdarma a bez klíče.',
    usedFor: 'Ověření IČO v profilu subjektu a vyhledávání firem Jarvisem.',
    envKeys: [],
    dashboardUrl: '',
    pricingUrl: 'https://ares.gov.cz/',
  },
  {
    key: 'cnb-rates',
    name: 'ČNB – kurzovní lístek',
    vendor: 'Česká národní banka',
    category: 'other',
    billingCycle: 'monthly',
    amount: 0,
    currency: 'CZK',
    isEstimate: false,
    description: 'Veřejné denní kurzy, zdarma.',
    usedFor: 'Přepočet nákladů v USD a EUR na koruny v této sekci.',
    envKeys: [],
    dashboardUrl: '',
    pricingUrl: 'https://www.cnb.cz/cs/financni-trhy/devizovy-trh/kurzy-devizoveho-trhu/',
  },
  {
    key: 'ag-grid',
    name: 'AG Grid Community',
    vendor: 'AG Grid',
    category: 'software',
    billingCycle: 'yearly',
    amount: 0,
    currency: 'USD',
    isEstimate: false,
    description:
      'Bezplatná edice tabulek. Edice Enterprise (seskupování, export do Excelu, kopírování oblastí…) se licencuje ročně za vývojáře.',
    usedFor: 'Všechny tabulky subjektů a zakázek.',
    envKeys: [],
    dashboardUrl: '',
    pricingUrl: 'https://www.ag-grid.com/license-pricing/',
  },
  {
    key: 'fullcalendar',
    name: 'FullCalendar',
    vendor: 'FullCalendar',
    category: 'software',
    billingCycle: 'yearly',
    amount: 0,
    currency: 'USD',
    isEstimate: false,
    description: 'Použité moduly (den, týden, měsíc, seznam, opakování) jsou zdarma (licence MIT).',
    usedFor: 'Sekce Kalendář.',
    envKeys: [],
    dashboardUrl: '',
    pricingUrl: 'https://fullcalendar.io/pricing',
  },
];

// Domains whose registrar and expiry the finance screen looks up.
export const CATALOG_DOMAINS = CATALOG.filter((entry) => entry.domain).map((entry) => ({ key: entry.key, domain: entry.domain }));

// The catalog entry as a new expense row.
export const catalogExpense = (entry) => ({
  catalogKey: entry.key,
  name: entry.name,
  vendor: entry.vendor,
  category: entry.category,
  billingCycle: entry.billingCycle,
  amount: entry.amount,
  currency: entry.currency,
  isEstimate: entry.isEstimate ?? true,
  status: 'active',
  startedOn: null,
  renewsOn: null,
  description: entry.description,
  usedFor: entry.usedFor,
  envKeys: entry.envKeys.map((key) => key.name),
  dashboardUrl: entry.dashboardUrl,
  costSource: entry.costSource ?? null,
  notes: '',
});

// Every environment variable the catalog mentions, with whether it is set.
export function describeKeys(env = process.env) {
  const keys = new Map();
  for (const entry of CATALOG) {
    for (const key of entry.envKeys) {
      const current = keys.get(key.name) ?? {
        name: key.name,
        scope: key.scope ?? 'server',
        optional: Boolean(key.optional),
        services: [],
      };
      current.services.push(entry.name);
      keys.set(key.name, current);
    }
  }
  return [...keys.values()].map((key) => ({
    ...key,
    configured: key.scope === 'server' ? Boolean(String(env[key.name] ?? '').trim()) : null,
  }));
}
