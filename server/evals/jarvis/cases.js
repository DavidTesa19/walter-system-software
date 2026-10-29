// The Jarvis test set: typical Czech questions against the made-up company in
// fixture.js. Each case is checked by the runner itself where the answer is
// a fact (tools used, cards shown, words in the answer, data left as it was)
// and by a grader model where it takes judgement (`rubric`).
//
//   tools        every entry must be called; an array means "one of these"
//   forbidTools  none of these may be called
//   cards        true: the answer must show that card, false: it must not
//                (proposal, email, document, calendar, action)
//   mentions     the answer must contain each (case-insensitive; spaces
//                between digits ignored, so '25000' matches "25 000")
//   mentionsAny  …at least one of these
//   avoids       the answer must not contain any of these
//   state        (db, tasks) => null when the data is as it should be after
//                the turn, or what is wrong
//   context      sent as the panel would (open record, voice)
//   rubric       what the grader checks, in plain words

import { USERS } from './fixture.js';

const findClient = (db, code) => db.client_entities.find((row) => row.entity_id === code);

export const CASES = [
  // --- Looking up one subject -------------------------------------------
  {
    id: 'lookup-phone',
    tags: ['vyhledání'],
    question: 'Jaký je telefon na Pekárnu Novák?',
    expect: { tools: [['search', 'get_subject', 'list_records']], mentions: ['602111222'] },
  },
  {
    id: 'lookup-by-code',
    tags: ['vyhledání'],
    question: 'Kdo je kontaktní osoba u K004?',
    expect: { mentions: ['Krejčí'] },
  },
  {
    id: 'lookup-typo',
    tags: ['vyhledání', 'překlep'],
    question: 'najdi mi klienta dvorak stavby',
    expect: { mentions: ['Stavby Dvořák'] },
  },
  {
    id: 'lookup-sound-alike',
    tags: ['vyhledání', 'překlep'],
    question: 'Nemáme tam nějakýho Horaka co dělá víno?',
    expect: { mentions: ['Vinařství Horák'] },
  },
  {
    id: 'lookup-code-without-zeros',
    tags: ['vyhledání', 'překlep'],
    question: 'Co je K9 zač?',
    expect: { mentionsAny: ['Vinařství Horák', 'K009'] },
  },
  {
    id: 'lookup-ico',
    tags: ['vyhledání'],
    question: 'Jaké IČO má Hotel Vltava?',
    expect: { mentions: [(db) => findClient(db, 'K005').ico] },
  },
  {
    id: 'lookup-missing',
    tags: ['vyhledání', 'neexistuje'],
    question: 'Jaký je e-mail na Mlékárnu Kunín?',
    expect: { cards: { proposal: false } },
    rubric:
      'Mlékárna Kunín v systému není. Odpověď to jasně řekne a nevymyslí žádný e-mail ani kontakt. ' +
      'Může nabídnout podobné záznamy nebo hledání jinde, ale nesmí tvrdit, že záznam existuje.',
  },
  {
    id: 'lookup-ambiguous-name',
    tags: ['vyhledání', 'nejasné'],
    question: 'Jaké číslo má Novák?',
    rubric:
      'Novák jsou v systému dva: klient Jan Novák (Pekárna Novák, K001, +420 602 111 222) a tipař Filip Novák (T001, +420 608 565 656). ' +
      'Dobrá odpověď uvede oba s jejich čísly, nebo se zeptá, kterého myslí. Špatně je dát jen jedno číslo, jako by Novák byl jediný.',
  },

  // --- Lists and counts ---------------------------------------------------
  {
    id: 'count-active-clients',
    tags: ['seznamy'],
    question: 'Kolik máme aktivních klientů ve Veřejné sekci?',
    expect: { tools: [['list_records', 'search']], mentions: ['7'] },
    rubric: 'Aktivních (schválených) klientů ve Veřejné sekci je přesně 7. Odpověď uvádí 7, ne 10 (to by počítalo i neschválené a archiv).',
  },
  {
    id: 'list-by-region',
    tags: ['seznamy'],
    question: 'Kteří klienti jsou z Jihomoravského kraje?',
    expect: { mentions: ['Pekárna Novák', 'IT Brno Solutions', 'Vinařství Horák'] },
  },
  {
    id: 'list-by-field',
    tags: ['seznamy'],
    question: 'Vypiš mi klienty z oboru zemědělství.',
    expect: { mentions: ['Zahradnictví Zelený svět', 'Vinařství Horák'], avoids: ['Pekárna Novák'] },
  },
  {
    id: 'list-pending',
    tags: ['seznamy'],
    question: 'Kdo všechno u nás čeká na schválení?',
    expect: { mentions: ['Kovárna Procházka', 'Tiskárna Svoboda', 'Energo Consult', 'Růžička'] },
  },
  {
    id: 'list-partners-city',
    tags: ['seznamy'],
    question: 'Jaké máme partnery v Praze?',
    expect: { mentions: ['Účetní kancelář Bílá', 'Marketing Pro'], avoids: ['Marek & Fiala'] },
  },
  {
    id: 'list-projects-section',
    tags: ['seznamy'],
    question: 'Jaké zakázky běží v Neveřejné sekci?',
    expect: { mentions: ['Stromovka'] },
  },

  // --- Zakázky -------------------------------------------------------------
  {
    id: 'my-commissions',
    tags: ['zakázky'],
    question: 'Jaké zakázky mám přiřazené já?',
    expect: { mentions: ['K001-001', 'K002-001', 'K003-001', 'K005-001'], avoids: ['K004-001'] },
  },
  {
    id: 'overdue',
    tags: ['zakázky'],
    question: 'Které zakázky jsou po termínu?',
    expect: { mentions: ['K002-001'] },
    rubric:
      'Po termínu je jen K002-001 (Dotace na fotovoltaiku, termín před 3 dny). K007-001 má termín v minulosti, ale je Uzavřená, ' +
      'takže po termínu není — odpověď ji mezi zpožděné nesmí zařadit.',
  },
  {
    id: 'commission-detail',
    tags: ['zakázky'],
    question: 'V jakém stavu je zakázka K001-001 a kdy má termín?',
    expect: { mentions: ['Probíhá'] },
    rubric: 'Stav je Probíhá a termín je za dva dny od dneška (datum podle <kontext>). Odpověď uvádí obojí a datum sedí.',
  },
  {
    id: 'commission-value',
    tags: ['zakázky'],
    question: 'Jakou máme provizi z rekonstrukce e-shopu pro Pekárnu Novák?',
    expect: { mentions: ['25000'] },
  },
  {
    id: 'colleague-workload',
    tags: ['zakázky'],
    question: 'Na čem teď dělá Jana Horáková?',
    expect: { mentions: ['K001-002'] },
    rubric:
      'Janě Horákové patří K001-002 (Plánováno), P002-001 (Probíhá) a PK001-001 (Plánováno); K009-001 je Odložená a K007-001 Uzavřená. ' +
      'Odpověď zmíní aspoň rozpracované a plánované zakázky a nevydává uzavřenou za aktuální práci.',
  },

  // --- Calendar ------------------------------------------------------------
  {
    id: 'calendar-tomorrow',
    tags: ['kalendář'],
    question: 'Co mám zítra v kalendáři?',
    expect: { tools: ['calendar'], mentions: ['Novák', '10'] },
  },
  {
    id: 'calendar-next-days',
    tags: ['kalendář'],
    question: 'Jaký mám program na příštích sedm dní?',
    expect: { tools: ['calendar'], mentions: ['Porada'] },
    rubric: 'Zítra v 10:00 je schůzka s Janem Novákem, za tři dny v 9:00 porada týmu. Odpověď uvádí obě se správnými dny a časy.',
  },
  {
    id: 'calendar-add',
    tags: ['kalendář', 'zápis'],
    question: 'Naplánuj mi na pozítří ve 14:00 hodinovou schůzku s Hanou Bílou.',
    expect: {
      tools: ['calendar_add_event'],
      cards: { calendar: true },
      state: (db) => {
        const event = db.calendarEvents.find((item) => /Bíl/.test(item.title ?? '') && String(item.start).endsWith('T14:00'));
        return event ? null : 'v kalendáři chybí schůzka ve 14:00 s Hanou Bílou';
      },
    },
  },
  {
    id: 'calendar-reminder',
    tags: ['kalendář', 'zápis'],
    question: 'Připomeň mi za týden, že mám zavolat do Tiskárny Svoboda.',
    expect: { tools: ['calendar_add_event'], cards: { calendar: true } },
  },

  // --- Changes go through a card, never straight in ------------------------
  {
    id: 'propose-phone',
    tags: ['změny'],
    question: 'Změň telefon u Lucie Malé z Hotelu Vltava na +420 777 888 999.',
    expect: {
      tools: ['propose_update'],
      cards: { proposal: true },
      state: (db) => (findClient(db, 'K005').phone === '+420 380 555 666' ? null : 'telefon se změnil bez potvrzení'),
    },
  },
  {
    id: 'propose-state',
    tags: ['změny'],
    question: 'Zakázku K004-001 přepni do stavu Uzavřeno.',
    expect: { tools: ['propose_update'], cards: { proposal: true } },
  },
  {
    id: 'propose-invalid-ico',
    tags: ['změny', 'kontrola'],
    question: 'Nastav Kovárně Procházka IČO 12345678.',
    expect: {
      cards: { proposal: false },
      state: (db) => (findClient(db, 'K006').ico ? 'IČO se uložilo' : null),
    },
    rubric: 'IČO 12345678 nemá platnou kontrolní číslici. Odpověď to řekne a nenabídne změnu ke schválení.',
  },
  {
    id: 'propose-note',
    tags: ['změny'],
    question: 'Přidej k Pekárně Novák poznámku, že chtějí cenovou nabídku do pátku.',
    expect: { tools: ['propose_note'], cards: { proposal: true } },
  },
  {
    id: 'refuse-delete',
    tags: ['změny', 'hranice'],
    question: 'Smaž klienta Tiskárna Svoboda.',
    expect: {
      cards: { proposal: false },
      state: (db) => (findClient(db, 'K010') ? null : 'klient zmizel'),
    },
    rubric: 'Jarvis subjekty mazat neumí. Odpověď to řekne a poradí, jak to udělá uživatel sám v aplikaci; netvrdí, že je smazáno.',
  },

  // --- To-dos and the briefing -------------------------------------------
  {
    id: 'today-todo',
    tags: ['úkoly'],
    question: 'Co mám dneska udělat?',
    expect: { mentions: ['Hotel'] },
    rubric:
      'Dnes je k udělání úkol „Poslat nabídku Hotelu Vltava“ a dnes má termín zakázka K005-001 (Nový rezervační systém). ' +
      'Odpověď zmíní obojí. Zakázka K002-001 je po termínu a je dobré ji připomenout.',
  },
  {
    id: 'briefing',
    tags: ['úkoly'],
    question: 'Připrav mi ranní přehled na dnešek.',
    expect: { mentions: ['K002-001', 'K005-001'] },
    rubric:
      'Přehled je stručný a zmíní: K002-001 po termínu, K005-001 s termínem dnes, K001-001 s termínem za dva dny, ' +
      'zítřejší schůzku s Janem Novákem a úkol pro Hotel Vltava. Nic si nevymýšlí.',
  },

  // --- E-mail, files, opening a record ------------------------------------
  {
    id: 'email-draft',
    tags: ['výstupy'],
    question: 'Napiš Janu Novákovi e-mail, že rekonstrukce e-shopu bude hotová do konce měsíce.',
    expect: { tools: ['draft_email'], cards: { email: true }, cardText: { email: ['jan.novak@pekarnanovak.cz'] } },
    rubric: 'Návrh e-mailu je česky, zdvořilý, krátký, adresovaný Janu Novákovi a říká, že rekonstrukce e-shopu bude hotová do konce měsíce.',
  },
  {
    id: 'pdf-summary',
    tags: ['výstupy'],
    question: 'Udělej mi PDF se shrnutím klienta Stavby Dvořák.',
    expect: { tools: ['create_document'], cards: { document: true }, cardText: { document: ['pdf'] } },
  },
  {
    id: 'excel-export',
    tags: ['výstupy'],
    question: 'Vyexportuj mi do Excelu všechny klienty z Prahy.',
    expect: { tools: ['export_records'], cards: { document: true } },
  },
  {
    id: 'open-record',
    tags: ['výstupy'],
    question: 'Otevři mi kartu Vinařství Horák.',
    expect: { tools: ['open_record'], cards: { action: true } },
  },

  // --- What is open in the app ----------------------------------------------
  {
    id: 'context-open-record',
    tags: ['kontext'],
    question: 'Kdo je kontakt u tohohle klienta a jaké má zakázky?',
    context: { view: 'Veřejné › Subjekty', record: { section: 'public', role: 'client', kind: 'subject', id: 5, label: 'K005 · Hotel Vltava' } },
    expect: { mentions: ['Malá', 'K005-001'] },
  },

  // --- Outside the CRM -------------------------------------------------------
  {
    id: 'ares',
    tags: ['mimo CRM'],
    question: 'Kdo je firma s IČO 45274649? Podívej se do ARES.',
    expect: { tools: ['company_registry'], mentions: ['ČEZ'] },
  },
  {
    id: 'web-search',
    tags: ['mimo CRM'],
    question: 'Najdi na webu, jaká je v Česku sazba DPH na pečivo.',
    expect: { tools: ['web_search'], mentions: ['12'] },
    rubric: 'Od roku 2024 je pečivo ve snížené sazbě 12 %. Odpověď uvádí 12 % a zdroj.',
  },
  {
    id: 'voice-short',
    tags: ['hlas'],
    question: 'kolik máme partnerů',
    context: { voice: true },
    rubric:
      'Otázka byla položena hlasem a odpověď se bude předčítat: má být krátká (jedna až dvě věty), bez tabulek a odrážek. ' +
      'Partnerů je 4, z toho 3 aktivní a 1 čeká na schválení; obě čísla jsou správně, pokud je jasné, co se počítá.',
  },
];

export const ASKER = USERS.admin;
