// ARES, the Czech public register of businesses (ares.gov.cz): looking a
// company or sole trader up by IČO or name. Public data, no key needed.
// Read-only and outside the app's own data, so it is called directly rather
// than through the app's API.

const BASE = 'https://ares.gov.cz/ekonomicke-subjekty-v-be/rest';
const TIMEOUT_MS = 10_000;
const CACHE_MS = 3600 * 1000;
const CACHE_SIZE = 200;

export class AresError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

// Answers kept for an hour: the same company comes up again within a
// conversation, and ARES limits how often it may be asked.
const cache = new Map();

async function request(path, { body, signal } = {}) {
  const key = `${path} ${body ? JSON.stringify(body) : ''}`;
  const hit = cache.get(key);
  if (hit && hit.at > Date.now() - CACHE_MS) return hit.data;

  const signals = [AbortSignal.timeout(TIMEOUT_MS), signal].filter(Boolean);
  let response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: signals.length > 1 ? AbortSignal.any(signals) : signals[0],
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new AresError('Rejstřík ARES teď neodpovídá. Zkuste to za chvíli.', 503);
  }
  if (response.status === 404) return null;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = String(data?.popis ?? '').split('|')[0].trim();
    if (/příliš mnoho výsledků/i.test(message)) {
      throw new AresError(`${message.replace(/\.?\s*Povoleno.*$/, '')}. Upřesni název nebo přidej město.`, 400);
    }
    throw new AresError(message || `ARES vrátil chybu ${response.status}.`, response.status);
  }
  cache.set(key, { at: Date.now(), data });
  while (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value);
  return data;
}

// IČO is 8 digits, the last one a mod-11 check digit — which catches most
// mistyped or misheard numbers before ARES is even asked.
export function normalizeIco(value) {
  const digits = String(value ?? '').replace(/\s+/g, '');
  if (!/^\d{1,8}$/.test(digits)) return null;
  return digits.padStart(8, '0');
}

export function isValidIco(ico) {
  const sum = [...ico.slice(0, 7)].reduce((total, digit, index) => total + Number(digit) * (8 - index), 0);
  const check = (11 - (sum % 11)) % 10;
  return check === Number(ico[7]);
}

let legalForms = null;
let legalFormsAt = 0;

async function legalFormName(code, signal) {
  if (!code) return undefined;
  if (!legalForms || legalFormsAt < Date.now() - 24 * CACHE_MS) {
    try {
      const data = await request('/ciselniky-nazevniky/vyhledat', { body: { kodCiselniku: 'PravniForma', zdrojCiselniku: 'res' }, signal });
      legalForms = new Map(
        (data?.ciselniky?.[0]?.polozkyCiselniku ?? []).map((item) => [String(item.kod), item.nazev?.find((name) => name.kodJazyka === 'cs')?.nazev ?? item.nazev?.[0]?.nazev])
      );
      legalFormsAt = Date.now();
    } catch {
      return `kód ${code}`;
    }
  }
  return legalForms.get(String(code)) ?? `kód ${code}`;
}

const titleCase = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/(^|[\s-])(\p{L})/gu, (_, before, letter) => before + letter.toUpperCase());

// One company, compact, in Czech.
async function describe(subject, signal) {
  const registrations = subject.seznamRegistraci ?? {};
  const dissolved = subject.datumZaniku;
  return {
    ico: subject.ico,
    nazev: subject.obchodniJmeno,
    sidlo: subject.sidlo?.textovaAdresa,
    kraj: subject.sidlo?.nazevKraje,
    pravni_forma: await legalFormName(subject.pravniForma, signal),
    dic: subject.dic,
    platce_dph: registrations.stavZdrojeDph === 'AKTIVNI' ? true : undefined,
    vznik: subject.datumVzniku,
    zanik: dissolved,
    stav: dissolved
      ? 'zaniklý'
      : /v likvidaci/i.test(subject.obchodniJmeno ?? '')
        ? 'v likvidaci'
        : registrations.stavZdrojeRos === 'AKTIVNI' || registrations.stavZdrojeRes === 'AKTIVNI'
          ? 'aktivní'
          : 'neaktivní',
    odkaz: `https://ares.gov.cz/ekonomicke-subjekty?ico=${subject.ico}`,
  };
}

const current = (items) => (items ?? []).filter((item) => !item.datumVymazu);

const COURTS = {
  MSPH: 'Městský soud v Praze',
  KSBR: 'Krajský soud v Brně',
  KSOS: 'Krajský soud v Ostravě',
  KSPL: 'Krajský soud v Plzni',
  KSUL: 'Krajský soud v Ústí nad Labem',
  KSHK: 'Krajský soud v Hradci Králové',
  KSCB: 'Krajský soud v Českých Budějovicích',
};

const fileNumber = (entries) => {
  const entry = current(entries)[0] ?? entries?.[entries.length - 1];
  if (!entry) return undefined;
  return `${entry.oddil ?? ''} ${entry.vlozka ?? ''}, ${COURTS[entry.soud] ?? entry.soud ?? ''}`.trim();
};

const share = (value) => (value && /^\d+([.,]\d+)?$/.test(value) ? `${value} %` : value);

const personName = (party) => {
  if (party?.fyzickaOsoba) {
    const person = party.fyzickaOsoba;
    return [person.titulPredJmenem, titleCase(person.jmeno), titleCase(person.prijmeni), person.titulZaJmenem].filter(Boolean).join(' ');
  }
  if (party?.pravnickaOsoba) return party.pravnickaOsoba.obchodniJmeno ?? 'právnická osoba';
  return undefined;
};

// The commercial register's current statutory body (jednatelé, představenstvo),
// shareholders and registered capital. Names and roles only — no home
// addresses or birth dates, which the register lists for people.
async function commercialRegister(ico, signal) {
  const data = await request(`/ekonomicke-subjekty-vr/${ico}`, { signal });
  const record = data?.zaznamy?.find((item) => item.primarniZaznam) ?? data?.zaznamy?.[0];
  if (!record) return null;
  const statutory = current(record.statutarniOrgany).flatMap((organ) =>
    current(organ.clenoveOrganu).map((member) => ({
      jmeno: personName(member),
      funkce: member.clenstvi?.funkce?.nazev ?? organ.nazevOrganu,
      od: member.clenstvi?.funkce?.vznikFunkce ?? member.clenstvi?.clenstvi?.vznikClenstvi ?? member.datumZapisu,
    }))
  );
  const owners = current(record.spolecnici).flatMap((group) =>
    current(group.spolecnik).map((owner) => ({
      nazev: personName(owner.osoba),
      podil: share(current(owner.podil)[0]?.velikostPodilu?.hodnota),
    }))
  );
  const capital = current(record.zakladniKapital)[0]?.vklad;
  return {
    spisova_znacka: fileNumber(record.spisovaZnacka),
    statutarni_organ: statutory.filter((member) => member.jmeno).slice(0, 15),
    jednani: current(current(record.statutarniOrgany)[0]?.zpusobJednani)[0]?.hodnota?.slice(0, 400),
    spolecnici: owners.filter((owner) => owner.nazev).slice(0, 15),
    zakladni_kapital: capital?.hodnota ? `${Number(capital.hodnota).toLocaleString('cs-CZ')} ${capital.typObnos === 'KORUNY' ? 'Kč' : capital.typObnos}` : undefined,
  };
}

export async function lookupByIco(ico, { people = true, signal } = {}) {
  const subject = await request(`/ekonomicke-subjekty/${ico}`, { signal });
  if (!subject) return null;
  const company = await describe(subject, signal);
  if (people && subject.seznamRegistraci?.stavZdrojeVr && subject.seznamRegistraci.stavZdrojeVr !== 'NEEXISTUJICI') {
    try {
      const register = await commercialRegister(ico, signal);
      if (register) Object.assign(company, { obchodni_rejstrik: register });
    } catch (error) {
      if (signal?.aborted) throw error;
      company.obchodni_rejstrik = { chyba: 'Údaje z obchodního rejstříku se nepodařilo načíst.' };
    }
  }
  return company;
}

export async function searchByName(name, { city, limit = 10, signal } = {}) {
  const body = { obchodniJmeno: name, pocet: Math.min(limit, 50), start: 0, ...(city ? { sidlo: { textovaAdresa: city } } : {}) };
  const data = await request('/ekonomicke-subjekty/vyhledat', { body, signal });
  const subjects = data?.ekonomickeSubjekty ?? [];
  return {
    total: data?.pocetCelkem ?? subjects.length,
    companies: await Promise.all(subjects.map((subject) => describe(subject, signal))),
  };
}
