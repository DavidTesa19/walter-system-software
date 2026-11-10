// What the "?" panel and the Nápověda section say: every keyboard shortcut,
// and a short guide to each screen. One place, so a new shortcut or screen is
// added here once and shows in both.
//
// A new keyboard shortcut belongs in SHORTCUTS; a new screen gets its views
// listed in one of HELP_TOPICS (or a topic of its own).

import type { AppView } from "../types/appView";
import { THEME_SHORTCUT_LABEL } from "../theme/ThemeContext";

export interface Shortcut {
  /** Each entry is one key combination; several mean "or". */
  keys: string[];
  action: string;
  where?: string;
}

export const SHORTCUTS: Shortcut[] = [
  { keys: ["?"], action: "Nápověda k obrazovce, na které jste", where: "kdekoli mimo textové pole" },
  { keys: ["Alt+J"], action: "Otevřít nebo zavřít Jarvise" },
  {
    keys: ["Alt+M"],
    action: "Mluvit s Jarvisem: klepnutí začne poslouchat, druhé odešle; podržené klávesy = mluvte a puštěním odešlete",
  },
  { keys: ["Alt+T"], action: "Otevřít nebo složit okno Úkolů" },
  { keys: [THEME_SHORTCUT_LABEL], action: "Přepnout světlý / tmavý režim", where: "mimo textové pole" },
  { keys: ["Ctrl+Z"], action: "Vrátit poslední změnu", where: "tabulky subjektů a zakázek, Budoucí funkce" },
  { keys: ["Ctrl+Y", "Ctrl+Shift+Z"], action: "Zopakovat vrácenou změnu", where: "tamtéž" },
  { keys: ["Esc"], action: "Zavřít okno, panel nebo dialog", where: "u Jarvise nejdřív zastaví nahrávání, čtení nebo odpověď" },
  { keys: ["Enter"], action: "Odeslat zprávu nebo uložit pole", where: "Shift+Enter = nový řádek" },
  { keys: ["Ctrl+V"], action: "Vložit obrázek ze schránky", where: "hlášení chyby, Budoucí funkce, přílohy pro Jarvise" },
  { keys: ["↑", "↓", "Enter"], action: "Procházet a otevřít výsledky hledání", where: "vyhledávání v levém menu" },
];

export interface HelpTopic {
  id: string;
  title: string;
  /** The screens this guide is about. */
  views: AppView[];
  summary: string;
  points: string[];
}

const SUBJECT_VIEWS: AppView[] = [
  "entities_active", "entities_pending", "entities_archived",
  "projects_subjects_active", "projects_subjects_pending", "projects_subjects_archived",
  "growth_subjects_active", "growth_subjects_pending", "growth_subjects_archived",
];

const COMMISSION_VIEWS: AppView[] = [
  "active", "pending", "archived",
  "projects_active", "projects_pending", "projects_archived",
  "growth_active", "growth_pending", "growth_archived",
];

export const HELP_TOPICS: HelpTopic[] = [
  {
    id: "subjects",
    title: "Subjekty",
    views: SUBJECT_VIEWS,
    summary:
      "Klienti, partneři a tipaři jedné sekce (Veřejné, Neveřejné, Growth Club). Každý řádek je jeden subjekt; kdo má víc společností, má řádek za každou.",
    points: [
      "Záložky nahoře přepínají Aktivní / Ke schválení / Archiv a Klienti / Partneři / Tipaři.",
      "Ikona profilu v levém sloupci otevře profil: všechny údaje, poznámky, dokumenty a zakázky subjektu.",
      "Většinu hodnot upravíte přímo v buňce. Společnost / Obor a Kraj / Lokalita se upravují v profilu, protože jsou do sebe vnořené.",
      "Pod IČO profil ukáže, co o firmě říká rejstřík ARES; „Doplnit z ARES“ zapíše společnost a sídlo.",
      "Filtry jsou v záhlaví sloupců. Tečka u řádku a číslo v menu znamenají změnu od kolegy, kterou jste ještě neviděli; „Potvrdit vše“ v menu je označí jako přečtené.",
      "Stejný subjekt může být klientem i partnerem nebo v jiné sekci: profil ukáže všechny jeho role pohromadě.",
    ],
  },
  {
    id: "commissions",
    title: "Zakázky",
    views: COMMISSION_VIEWS,
    summary:
      "Zakázky jedné sekce: každá patří k jednomu subjektu a má stav, prioritu, termín a přiřazené lidi.",
    points: [
      "Nová zakázka čeká na záložce Ke schválení, hotové a zrušené jsou v Archivu.",
      "V profilu zakázky je „Propojení zakázky“: ke klientovi připojíte partnera a případně tipaře, z kterékoli sekce.",
      "Zakázky přiřazené vám hlídá Jarvis: ty po termínu nebo s termínem do 3 dnů ukáže ve zvonečku a počet na svém tlačítku.",
      "Filtry v záhlaví sloupců, tečky u změn a Ctrl+Z / Ctrl+Y fungují stejně jako u subjektů.",
    ],
  },
  {
    id: "calendar",
    title: "Kalendář",
    views: ["calendar"],
    summary: "Vaše události a termíny zakázek. Na telefonu se otevře jako seznam týdne.",
    points: [
      "Událost přidáte kliknutím do dne, v týdenním a denním pohledu tažením přes čas. Kliknutím na událost ji upravíte.",
      "Pohled (měsíc, týden, den, seznam, rok) přepnete vpravo nahoře.",
      "Jarvis umí události přidat, posunout i smazat („Připomeň mi zítra v 9 zavolat Novákovi“); smazání vždy potvrzujete vy.",
    ],
  },
  {
    id: "tasks",
    title: "Úkoly",
    views: ["tasks"],
    summary: "Jednoduchý seznam úkolů: váš osobní a společný týmový.",
    points: [
      "Úkol je K udělání, Později nebo Hotovo. Úkol „Později“ s datem se v ten den sám vrátí do K udělání.",
      "Okno úkolů otevřete odkudkoli tlačítkem vpravo nahoře nebo Alt+T.",
      "Osobní seznam vidí i kolegové, upravit ho můžete jen vy (a admin).",
    ],
  },
  {
    id: "teamchat",
    title: "Týmový chat",
    views: ["teamchat"],
    summary: "Místnosti pro celý tým.",
    points: [
      "Napište @Jarvis a otázku: Jarvis odpoví do místnosti všem. Vidí přitom jen veřejnou sekci a nic nemění.",
      "Enter odešle zprávu, Shift+Enter udělá nový řádek.",
    ],
  },
  {
    id: "analytics",
    title: "Analytika",
    views: ["analytics"],
    summary: "Jak se aplikace používá.",
    points: [
      "Návštěvy sekcí a čas v nich, aktivita jednotlivých uživatelů a přihlášení.",
      "Kliknutí na veřejný formulář.",
    ],
  },
  {
    id: "finance",
    title: "Finance",
    views: ["finance"],
    summary: "Všechno, co aplikace stojí, a odkud to číslo je.",
    points: [
      "Napojeno = číslo přímo od poskytovatele, Pevná cena = potvrzeno z faktury, Nepotvrzeno = odhad.",
      "Historie ukazuje platby měsíc po měsíci od září 2025, v korunách podle kurzu ČNB toho dne.",
      "Záložka Jarvis: kolik stojí odpovědi, kdo se ptá nejvíc, nejdražší a nejpomalejší otázky a hodnocení 👍/👎.",
    ],
  },
  {
    id: "data_quality",
    title: "Kvalita dat",
    views: ["data_quality"],
    summary: "Co je v datech potřeba opravit.",
    points: [
      "Možné duplicity (stejné IČO, telefon, e-mail nebo název firmy), neplatné IČO, chybějící jméno či kontakt a řádky s výchozími hodnotami.",
      "Zakázky po termínu, bez přiřazení nebo aktivní bez termínu, a schválení čekající déle než 14 dní.",
      "Tlačítko u každé položky otevře daný záznam.",
    ],
  },
  {
    id: "future",
    title: "Budoucí funkce",
    views: ["future"],
    summary: "Nápady a plánované funkce aplikace a jejich stav.",
    points: [
      "Detail funkce má poznámky a přílohy; obrázek vložíte Ctrl+V.",
      "Odložené a zrušené funkce se samy přesunou do archivu.",
    ],
  },
  {
    id: "bugs",
    title: "Hlášení chyb",
    views: ["bugs"],
    summary: "Nahlášené chyby a jejich řešení.",
    points: [
      "Chybu nahlásíte odkudkoli vlaječkou vpravo nahoře; datum, obrazovka a autor se vyplní samy.",
      "Snímek obrazovky vložíte Ctrl+V, přetažením nebo tlačítkem pro snímek.",
      "Hlášení třídí admini a manažeři.",
    ],
  },
  {
    id: "chatbot",
    title: "AI Asistent",
    views: ["chatbot"],
    summary: "Samostatný chat s AI. Pro práci s daty aplikace použijte Jarvise (Alt+J).",
    points: [],
  },
  {
    id: "palettes",
    title: "Motivy",
    views: ["palettes"],
    summary: "Barvy a písma aplikace, zvlášť pro světlý a tmavý režim.",
    points: [`Mezi světlým a tmavým režimem přepnete ${THEME_SHORTCUT_LABEL} nebo tlačítkem v menu.`],
  },
  {
    id: "admin_users",
    title: "Správa uživatelů",
    views: ["admin_users"],
    summary: "Účty, role a sekce, do kterých kdo vidí.",
    points: [
      "Role: Admin (vše), Manager, Salesman a Viewer (jen čtení).",
      "Přístup do sekcí: vše, jen Veřejné, jen Neveřejné nebo jen Growth Club.",
    ],
  },
  {
    id: "safety",
    title: "Bezpečnost a zálohy",
    views: ["safety"],
    summary: "Kdo co kdy změnil, a zálohy, ze kterých jde data obnovit.",
    points: ["Každá změna v databázi se zapisuje i s autorem, včetně změn od Jarvise."],
  },
  {
    id: "help",
    title: "Nápověda",
    views: ["help"],
    summary: "Tato stránka: klávesové zkratky a průvodce všemi obrazovkami.",
    points: ["Nápovědu k obrazovce, na které právě jste, otevřete odkudkoli klávesou ? nebo tlačítkem ? vpravo nahoře."],
  },
];

export const JARVIS_TOPIC: HelpTopic = {
  id: "jarvis",
  title: "Jarvis",
  views: [],
  summary: "AI asistent, který zná data aplikace. Otevřete ho tlačítkem vpravo dole nebo Alt+J.",
  points: [
    "Najde subjekty a zakázky (i s překlepem), otevře záznam, shrne poznámky a dokumenty.",
    "Změny jen navrhuje: zápis proběhne, až kliknete na Potvrdit.",
    "Umí kalendář, připomínky, ranní přehled, koncept e-mailu, dokument ve Wordu, PDF nebo Excelu a hledání na webu.",
    "Mluvit s ním můžete Alt+M nebo tlačítkem mikrofonu; odpověď vám přečte nahlas.",
    "Ví, který záznam máte otevřený: stačí napsat „tenhle klient“.",
  ],
};

export const topicForView = (view: AppView): HelpTopic | undefined =>
  HELP_TOPICS.find((topic) => topic.views.includes(view));
