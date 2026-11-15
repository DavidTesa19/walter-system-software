// What Jarvis can do, grouped the way people ask for it: the Jarvis screen's
// "Schopnosti" section and the cards on its welcome screen. Each area names
// the tools behind it (server/jarvis/tools.js) and a few example questions;
// a question ending in "…" is a start to finish typing, the others can be sent
// as they are. Keep this in step with the tools when one is added.

import type { LucideIcon } from 'lucide-react';
import { Brain, CalendarDays, ClipboardCheck, FileText, Globe, IdCard, Mail, Mic, Search } from 'lucide-react';

export interface JarvisCapability {
  id: string;
  icon: LucideIcon;
  title: string;
  summary: string;
  points: string[];
  examples: string[];
}

export const CAPABILITIES: JarvisCapability[] = [
  {
    id: 'search',
    icon: Search,
    title: 'Hledání a přehledy',
    summary: 'Klienti, partneři, tipaři a zakázky ve všech sekcích, kam máte přístup.',
    points: [
      'Hledá i s překlepy a bez diakritiky („nowak“ najde Nováka, K12 najde K012).',
      'Seznamy podle stavu, termínu, priority, odpovědné osoby, oboru nebo kraje.',
      'Celý profil subjektu i zakázky, poslední změny a kdo je udělal.',
    ],
    examples: [
      'Které moje zakázky jsou po termínu?',
      'Co se v datech změnilo od včerejška?',
      'Kdo z týmu má nejvíc otevřených zakázek?',
      'Najdi klienta …',
    ],
  },
  {
    id: 'changes',
    icon: ClipboardCheck,
    title: 'Změny se schválením',
    summary: 'Jarvis nic nezmění sám: navrhne to na kartě a provede, až potvrdíte.',
    points: [
      'Úprava polí, poznámka, Obor a Zaměření z katalogu, přiřazení lidí.',
      'Nový subjekt i s první zakázkou, upozorní na možné duplicity.',
      'Hromadně jednou kartou: stav, termín, priorita nebo přiřazení až u 50 záznamů najednou.',
      'Každá potvrzená změna je v historii změn pod vaším jménem a značkou AI.',
    ],
    examples: [
      'Přidej poznámku k …',
      'Založ nového klienta …',
      'Přiřaď zakázku … kolegovi …',
      'Všem mým zakázkám po termínu posuň termín na …',
      'Přeřaď všechny zakázky kolegy … na …',
    ],
  },
  {
    id: 'calendar',
    icon: CalendarDays,
    title: 'Kalendář, úkoly a připomínky',
    summary: 'Události přidá a přesune hned (s tlačítkem Vrátit zpět), smazání potvrzujete.',
    points: [
      'Váš kalendář i termíny zakázek, v pražském čase.',
      'Úkoly osobní i týmové, s termínem a přiřazením.',
      'Ranní přehled: co je po termínu, co dnes a co dlouho stojí.',
    ],
    examples: [
      'Připrav mi ranní přehled na dnešek.',
      'Co mám tento týden v kalendáři?',
      'Připomeň mi zítra v 9 zavolat …',
      'Přidej mi úkol …',
    ],
  },
  {
    id: 'documents',
    icon: FileText,
    title: 'Dokumenty a soubory',
    summary: 'Čte nahrané dokumenty a přílohy, vytváří Word, PDF a Excel.',
    points: [
      'PDF, Word, Excel, PowerPoint i naskenované dokumenty a fotky.',
      'Přílohu přetáhněte do okna nebo vložte Ctrl+V.',
      'Export záznamů do Excelu se při stažení načte vždy znovu, aktuální.',
    ],
    examples: [
      'Exportuj aktivní zakázky do Excelu.',
      'Shrň mi dokumenty u klienta …',
      'Připrav nabídku v PDF pro …',
    ],
  },
  {
    id: 'web',
    icon: Globe,
    title: 'Web a rejstřík ARES',
    summary: 'Hledá na webu (česky, se zdroji) a ověřuje firmy v obchodním rejstříku.',
    points: [
      'ARES: IČO, sídlo, právní forma, statutární orgán.',
      'Web: aktuality o firmě, kontakty, ceníky; na konci vždy zdroje.',
    ],
    examples: [
      'Ověř v ARES firmu s IČO …',
      'Co je nového u firmy … na webu?',
      'Doplň klientovi … údaje z ARES',
    ],
  },
  {
    id: 'email',
    icon: Mail,
    title: 'E-maily a týmový chat',
    summary: 'Napíše koncept e-mailu; po kontrole ho odešlete z karty, nebo otevřete ve své poště.',
    points: [
      'Koncept upravíte přímo na kartě a odešlete tlačítkem Odeslat (s potvrzením); odpovědi přijdou vám.',
      'Jarvis sám nikdy nic neodešle. Kopii si můžete poslat do své schránky.',
      'V Týmovém chatu odpoví na @Jarvis celé místnosti (jen veřejná sekce, nic nemění).',
    ],
    examples: ['Napiš e-mail klientovi … s připomenutím schůzky', 'Navrhni follow-up e-mail po schůzce s …'],
  },
  {
    id: 'memory',
    icon: Brain,
    title: 'Paměť',
    summary: 'Pamatuje si, jak s vámi pracovat: formu odpovědí, podpis, na co se zaměřujete.',
    points: [
      'Řekněte „pamatuj si…“ nebo „příště…“; poznámka platí ve všech dalších konverzacích.',
      'Uložení vždy ukáže kartou s tlačítkem Zapomenout; vše je v sekci Paměť.',
      'Soukromé: poznámky vidíte jen vy. Paměť jde vypnout.',
    ],
    examples: ['Pamatuj si, že chci odpovědi stručně a v bodech.', 'Co si o mně pamatuješ?', 'Pamatuj si, že se podepisuji …'],
  },
  {
    id: 'voice',
    icon: Mic,
    title: 'Hlas',
    summary: 'Ptejte se hlasem a nechte si odpovědi číst, i v plynulém rozhovoru.',
    points: [
      'Alt+M: klepnutí začne poslouchat, podržení = mluvte a puštěním odešlete.',
      'Režim rozhovoru: po přečtené odpovědi se mikrofon otevře sám.',
      'Hlasy OpenAI a nativní české hlasy ElevenLabs; výběr v Nastavení.',
    ],
    examples: [],
  },
  {
    id: 'card',
    icon: IdCard,
    title: 'Vizitka → nový kontakt',
    summary: 'Vyfoťte vizitku a Jarvis z ní navrhne nový subjekt.',
    points: ['V telefonu se otevře fotoaparát, na počítači výběr souboru.', 'Opíše jen to, co na vizitce je; Kraj odvodí z města.'],
    examples: [],
  },
];

// Four questions for the welcome screen that work as they are (the morning
// overview has its own button there).
const QUICK: Array<[string, string]> = [
  ['search', 'Které moje zakázky jsou po termínu?'],
  ['calendar', 'Co mám tento týden v kalendáři?'],
  ['search', 'Co se v datech změnilo od včerejška?'],
  ['documents', 'Exportuj aktivní zakázky do Excelu.'],
];
export const QUICK_EXAMPLES = QUICK.flatMap(([id, example]) => {
  const capability = CAPABILITIES.find((item) => item.id === id);
  return capability ? [{ capability, example }] : [];
});
