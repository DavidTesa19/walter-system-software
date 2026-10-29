// The made-up company the Jarvis test set runs against: a small Czech CRM with
// clients, partners and tipaři in all three sections, zakázky with deadlines
// around today, calendar events, to-dos. Nothing here is real data, so the
// set can live in the repo and run on any machine.
//
// Dates are relative to the day of the run (Prague time), so "po termínu",
// "dnes" and "zítra" mean the same thing whenever the set runs.

import { DAY_MS, pragueMidnight, pragueParts } from '../../jarvis/time.js';

// IČO: seven digits and a mod-11 check digit (the same rule as ico.ts).
export function withCheckDigit(seven) {
  const sum = [...seven].reduce((total, digit, index) => total + Number(digit) * (8 - index), 0);
  return `${seven}${(11 - (sum % 11)) % 10}`;
}

const pad = (value) => String(value).padStart(2, '0');

export function fixtureDates(now = new Date()) {
  const today = pragueMidnight(pragueParts(now));
  const day = (offset) => new Date(today.getTime() + offset * DAY_MS + 12 * 3600 * 1000);
  const ymd = (offset) => {
    const { year, month, day: dayOfMonth } = pragueParts(day(offset));
    return `${year}-${pad(month)}-${pad(dayOfMonth)}`;
  };
  return {
    // A deadline as the app stores it: Prague midnight as an ISO instant.
    deadline: (offset) => pragueMidnight(pragueParts(day(offset))).toISOString(),
    // Calendar events are zone-less Prague time ("2026-10-20T10:00").
    at: (offset, time) => `${ymd(offset)}T${time}`,
    ymd,
    // An updated_at this many days ago.
    ago: (days) => new Date(now.getTime() - days * DAY_MS).toISOString(),
  };
}

export const USERS = {
  admin: { id: 1, username: 'eval.admin', role: 'admin', access_scope: 'all' },
  jana: { id: 2, username: 'jana.horakova', role: 'salesman', access_scope: 'all' },
  petr: { id: 3, username: 'petr.kral', role: 'salesman', access_scope: 'standard' },
};

const subject = (id, code, status, data, d) => ({
  id,
  entity_id: code,
  status,
  company_name: null,
  first_name: null,
  last_name: null,
  email: null,
  phone: null,
  website: null,
  ico: null,
  field: null,
  region: null,
  location: null,
  info: null,
  category: null,
  created_at: d.ago(120),
  updated_at: d.ago(10),
  ...data,
});

const commission = (id, code, entityId, data, d) => ({
  id,
  commission_id: code,
  entity_id: entityId,
  entity_code: code.split('-')[0],
  status: 'accepted',
  position: null,
  service: null,
  budget: null,
  state: null,
  assigned_to: null,
  assigned_user_ids: [],
  deadline: null,
  priority: null,
  commission_value: null,
  info: null,
  notes: null,
  created_at: d.ago(60),
  updated_at: d.ago(3),
  ...data,
});

const assign = (user) => ({ assigned_to: user.username, assigned_user_ids: [user.id] });

/** The data files for a run: db.json and tasks.json for the dev server. */
export function buildFixture({ now = new Date(), passwordHash }) {
  const d = fixtureDates(now);
  const { admin, jana, petr } = USERS;

  const clients = [
    subject(1, 'K001', 'accepted', {
      company_name: 'Pekárna Novák s.r.o.', first_name: 'Jan', last_name: 'Novák', phone: '+420 602 111 222',
      email: 'jan.novak@pekarnanovak.cz', ico: withCheckDigit('2708244'), field: 'Potravinářství',
      region: 'Jihomoravský kraj', location: 'Brno', tier: 'Gold', info: 'Rodinná pekárna, tři prodejny v Brně.',
    }, d),
    subject(2, 'K002', 'accepted', {
      company_name: 'Stavby Dvořák a.s.', first_name: 'Petra', last_name: 'Dvořáková', phone: '+420 731 222 333',
      email: 'dvorakova@stavbydvorak.cz', ico: withCheckDigit('4519032'), field: 'Stavebnictví',
      region: 'Hlavní město Praha', location: 'Praha', tier: 'Silver',
    }, d),
    subject(3, 'K003', 'accepted', {
      company_name: 'Zahradnictví Zelený svět', first_name: 'Tomáš', last_name: 'Zelený', phone: '+420 605 333 444',
      field: 'Zemědělství', region: 'Olomoucký kraj', location: 'Olomouc',
    }, d),
    subject(4, 'K004', 'accepted', {
      company_name: 'AutoServis Krejčí', first_name: 'Martin', last_name: 'Krejčí', phone: '+420 777 444 555',
      field: 'Automobilový průmysl', region: 'Moravskoslezský kraj', location: 'Ostrava',
    }, d),
    subject(5, 'K005', 'accepted', {
      company_name: 'Hotel Vltava', first_name: 'Lucie', last_name: 'Malá', phone: '+420 380 555 666',
      email: 'mala@hotelvltava.cz', ico: withCheckDigit('6283711'), field: 'Cestovní ruch',
      region: 'Jihočeský kraj', location: 'Český Krumlov', tier: 'VIP',
    }, d),
    subject(6, 'K006', 'pending', {
      company_name: 'Kovárna Procházka', first_name: 'Josef', last_name: 'Procházka', phone: '+420 603 666 777',
      field: 'Strojírenství', region: 'Plzeňský kraj', location: 'Plzeň',
    }, d),
    subject(7, 'K007', 'accepted', {
      company_name: 'IT Brno Solutions s.r.o.', first_name: 'Karel', last_name: 'Veselý', phone: '+420 739 777 888',
      field: 'IT', region: 'Jihomoravský kraj', location: 'Brno',
    }, d),
    subject(8, 'K008', 'archived', {
      company_name: 'Lékárna U Anděla', first_name: 'Eva', last_name: 'Černá', phone: '+420 222 888 999',
      field: 'Zdravotnictví', region: 'Hlavní město Praha', location: 'Praha',
    }, d),
    subject(9, 'K009', 'accepted', {
      company_name: 'Vinařství Horák', first_name: 'Pavel', last_name: 'Horák', phone: '+420 519 999 000',
      field: 'Zemědělství', region: 'Jihomoravský kraj', location: 'Mikulov',
    }, d),
    subject(10, 'K010', 'pending', {
      company_name: 'Tiskárna Svoboda', first_name: 'Ivana', last_name: 'Svobodová', phone: '+420 485 000 111',
      field: 'Polygrafie', region: 'Liberecký kraj', location: 'Liberec',
    }, d),
  ];

  const partners = [
    subject(1, 'P001', 'accepted', {
      company_name: 'Účetní kancelář Bílá', first_name: 'Hana', last_name: 'Bílá', phone: '+420 604 121 212',
      email: 'hana@ucetnibila.cz', field: 'Účetnictví', region: 'Hlavní město Praha', location: 'Praha',
    }, d),
    subject(2, 'P002', 'accepted', {
      company_name: 'Advokátní kancelář Marek & Fiala', first_name: 'Ondřej', last_name: 'Marek', phone: '+420 541 232 323',
      field: 'Právo', region: 'Jihomoravský kraj', location: 'Brno',
    }, d),
    subject(3, 'P003', 'accepted', {
      company_name: 'Marketing Pro s.r.o.', first_name: 'Lenka', last_name: 'Kučerová', phone: '+420 720 343 434',
      field: 'Marketing', region: 'Hlavní město Praha', location: 'Praha',
    }, d),
    subject(4, 'P004', 'pending', {
      company_name: 'Energo Consult', first_name: 'Radek', last_name: 'Pokorný', phone: '+420 596 454 545',
      field: 'Energetika', region: 'Moravskoslezský kraj', location: 'Ostrava',
    }, d),
  ];

  const tipers = [
    subject(1, 'T001', 'accepted', {
      first_name: 'Filip', last_name: 'Novák', phone: '+420 608 565 656', region: 'Jihomoravský kraj', location: 'Brno',
    }, d),
    subject(2, 'T002', 'accepted', {
      first_name: 'Klára', last_name: 'Benešová', phone: '+420 702 676 767', region: 'Hlavní město Praha', location: 'Praha',
    }, d),
    subject(3, 'T003', 'pending', {
      first_name: 'Vojtěch', last_name: 'Růžička', phone: '+420 737 787 878', region: 'Plzeňský kraj', location: 'Plzeň',
    }, d),
  ];

  const clientCommissions = [
    commission(1, 'K001-001', 1, {
      position: 'Rekonstrukce e-shopu', service: 'Web a e-shop', state: 'Probíhá', priority: 'Vysoká',
      deadline: d.deadline(2), budget: '250000', commission_value: '25000', ...assign(admin),
    }, d),
    commission(2, 'K001-002', 1, {
      position: 'Kampaň na sociálních sítích', service: 'Marketing', state: 'Plánováno', priority: 'Střední',
      deadline: d.deadline(20), ...assign(jana),
    }, d),
    commission(3, 'K002-001', 2, {
      position: 'Dotace na fotovoltaiku', service: 'Dotace', state: 'Před podepsáním', priority: 'Urgentní',
      deadline: d.deadline(-3), budget: '1200000', commission_value: '60000', ...assign(admin),
    }, d),
    commission(4, 'K003-001', 3, {
      position: 'Zavlažovací systém', service: 'Technologie', state: 'Aktuální', priority: 'Nízká',
      deadline: d.deadline(5), ...assign(admin), updated_at: d.ago(40),
    }, d),
    commission(5, 'K004-001', 4, {
      position: 'Leasing vozového parku', service: 'Financování', state: 'Podepsáno', priority: 'Střední',
      deadline: d.deadline(40), ...assign(petr),
    }, d),
    commission(6, 'K005-001', 5, {
      position: 'Nový rezervační systém', service: 'Software', state: 'Probíhá', priority: 'Vysoká',
      deadline: d.deadline(0), commission_value: '40000', ...assign(admin),
    }, d),
    commission(7, 'K007-001', 7, {
      position: 'Audit kybernetické bezpečnosti', service: 'IT bezpečnost', state: 'Uzavřeno', priority: 'Střední',
      deadline: d.deadline(-30), ...assign(jana),
    }, d),
    commission(8, 'K009-001', 9, {
      position: 'Export vína do Německa', service: 'Export', state: 'Odloženo', ...assign(jana),
    }, d),
  ];

  const partnerCommissions = [
    commission(1, 'P002-001', 2, {
      position: 'Smluvní dokumentace pro Stavby Dvořák', service: 'Právní služby', state: 'Probíhá',
      deadline: d.deadline(10), ...assign(jana),
    }, d),
  ];

  const projectClients = [
    subject(1, 'PK001', 'accepted', {
      company_name: 'Městská část Praha 7', first_name: 'Jiří', last_name: 'Kopecký', field: 'Veřejná správa',
      region: 'Hlavní město Praha', location: 'Praha',
    }, d),
    subject(2, 'PK002', 'accepted', {
      company_name: 'Nadace Dobrý start', first_name: 'Alena', last_name: 'Vondrová', field: 'Neziskový sektor',
      region: 'Jihomoravský kraj', location: 'Brno',
    }, d),
    subject(3, 'PK003', 'accepted', {
      company_name: 'Krajská nemocnice Liberec', first_name: 'Michal', last_name: 'Šimek', field: 'Zdravotnictví',
      region: 'Liberecký kraj', location: 'Liberec',
    }, d),
  ];

  const projectClientCommissions = [
    commission(1, 'PK001-001', 1, {
      position: 'Revitalizace parku Stromovka', service: 'Veřejná zakázka', state: 'Plánováno',
      deadline: d.deadline(60), ...assign(jana),
    }, d),
  ];

  const growthClients = [
    subject(1, 'GK001', 'accepted', {
      company_name: 'Robotika Start s.r.o.', first_name: 'David', last_name: 'Kolář', field: 'IT',
      region: 'Hlavní město Praha', location: 'Praha',
    }, d),
  ];

  const db = {
    users: Object.values(USERS).map((user) => ({ ...user, email: null, password_hash: passwordHash })),
    partners: [],
    clients: [],
    tipers: [],
    employees: [],
    futureFunctions: [],
    client_entities: clients,
    partner_entities: partners,
    tiper_entities: tipers,
    client_commissions: clientCommissions,
    partner_commissions: partnerCommissions,
    tiper_commissions: [],
    project_client_entities: projectClients,
    project_partner_entities: [],
    project_tiper_entities: [],
    project_client_commissions: projectClientCommissions,
    project_partner_commissions: [],
    project_tiper_commissions: [],
    growth_client_entities: growthClients,
    growth_partner_entities: [],
    growth_tiper_entities: [],
    growth_client_commissions: [],
    growth_partner_commissions: [],
    growth_tiper_commissions: [],
    documents: [],
    notes: [],
    calendarEvents: [
      {
        id: 1, userId: admin.id, title: 'Schůzka s Janem Novákem (Pekárna Novák)', start: d.at(1, '10:00'), end: d.at(1, '11:00'),
        allDay: false, color: null, description: 'Probrat rekonstrukci e-shopu.', rrule: null, duration: null, extendedProps: {},
        created_at: d.ago(5), updated_at: d.ago(5),
      },
      {
        id: 2, userId: admin.id, title: 'Porada týmu', start: d.at(3, '09:00'), end: d.at(3, '10:00'),
        allDay: false, color: null, description: '', rrule: null, duration: null, extendedProps: {},
        created_at: d.ago(5), updated_at: d.ago(5),
      },
    ],
    analyticsEvents: [],
    field_options: [],
    field_specialization_options: [],
    entity_counters: { client: clients.length, partner: partners.length, tiper: tipers.length },
    project_entity_counters: { project_client: projectClients.length, project_partner: 0, project_tiper: 0 },
    growth_entity_counters: { growth_client: growthClients.length, growth_partner: 0, growth_tiper: 0 },
  };

  const task = (id, data) => ({
    id, list: 'personal', ownerUserId: admin.id, note: null, status: 'todo', dueDate: null, important: false,
    assigneeUserId: null, createdByUserId: admin.id, createdByName: admin.username, completedAt: null, completedByName: null,
    createdAt: d.ago(4), updatedAt: d.ago(4), ...data,
  });
  const tasks = {
    tasks: [
      task(1, { title: 'Poslat nabídku Hotelu Vltava', dueDate: d.ymd(0), important: true }),
      task(2, { title: 'Zavolat do Kovárny Procházka', status: 'later', dueDate: d.ymd(7) }),
      task(3, { title: 'Připravit podklady k dotacím', list: 'team', ownerUserId: null, assigneeUserId: admin.id }),
    ],
    nextId: 4,
  };

  return { db, tasks };
}
