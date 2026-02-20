export interface FieldOption {
  value: string;
  label: string;
}

export interface FieldCategory {
  label: string;
  options: FieldOption[];
}

// Helper to create options
const createOption = (name: string) => ({ value: name, label: name });

export const groupedFieldOptions: FieldCategory[] = [
  {
    label: "IT, Technologie a Data",
    options: [
      createOption("Automatizace"),
      createOption("Civic Tech (technologie pro občany a stát)"),
      createOption("Čisté technologie"),
      createOption("Datová analytika"),
      createOption("Digitální technologie / IT služby"),
      createOption("Etika v technologiích"),
      createOption("Fintech"),
      createOption("Geoinformatika"),
      createOption("Informatika"),
      createOption("Informatika a vývoj software"),
      createOption("Kyberbezpečnost"),
      createOption("Nanotechnologie"),
      createOption("Počítačové vědy"),
      createOption("Programování"),
      createOption("Quantum computing (kvantové výpočty)"),
      createOption("Robotika a automatizace"),
      createOption("Softwarové inženýrství"),
      createOption("Statistika a analýza dat"),
      createOption("Systémové inženýrství"),
      createOption("Technologie umělé inteligence"),
      createOption("Telekomunikace"),
      createOption("Testování softwaru"),
      createOption("Tvorba her (game design)"),
      createOption("Umělá inteligence (AI)"),
      createOption("Webdesign"),
      createOption("Vývoj software")
    ]
  },
  {
    label: "Průmysl, Inženýrství a Výroba",
    options: [
      createOption("Aeronautika a letectví"),
      createOption("Automobilový průmysl"),
      createOption("Civilní inženýrství"),
      createOption("Chemická technologie"),
      createOption("Chemické inženýrství"),
      createOption("Chemie a chemický průmysl"),
      createOption("Dřevozpracující průmysl"),
      createOption("Elektrotechnika"),
      createOption("Energetika (tradiční i obnovitelné zdroje)"),
      createOption("Geodézie a kartografie"),
      createOption("Geologie a hornictví"),
      createOption("Hutnictví"),
      createOption("Hutnictví a metalurgie"),
      createOption("Inženýrství (stavební, strojní, chemické, elektro, průmyslové, výrobní)"),
      createOption("Jaderná energetika"),
      createOption("Konstrukce a strojírenství"),
      createOption("Mechanika a montáž"),
      createOption("Mechatronika"),
      createOption("Montážní a údržbářské práce"),
      createOption("Nábytkářství"),
      createOption("Obnovitelné zdroje energie"),
      createOption("Organizace a řízení výroby"),
      createOption("Stavebnictví"),
      createOption("Strojírenství"),
      createOption("Svářečství"),
      createOption("Textilní a oděvní průmysl"),
      createOption("Textilní průmysl"),
      createOption("Údržba a servis technologií"),
      createOption("Údržba technických zařízení"),
      createOption("Vodohospodářství"),
      createOption("Výroba (strojní, potravinářská, textilní, automobilová)"),
      createOption("Wind energy (větrná energetika)")
    ]
  },
  {
    label: "Obchod, Finance a Právo",
    options: [
      createOption("Administrativa"),
      createOption("Bankovnictví"),
      createOption("Burzovnictví"),
      createOption("Bydlení a reality"),
      createOption("Cirkulární ekonomika"),
      createOption("Daňové poradenství"),
      createOption("Digitální marketing"),
      createOption("E-commerce"),
      createOption("Ekonomie"),
      createOption("Ekonomika a management"),
      createOption("Finance"),
      createOption("HR (lidské zdroje, personalistika)"),
      createOption("Inovační management"),
      createOption("Inspekční a kontrolní činnost"),
      createOption("Investiční poradenství"),
      createOption("Justiční služby"),
      createOption("Management"),
      createOption("Marketing"),
      createOption("Mezinárodní obchod"),
      createOption("Národní hospodářství"),
      createOption("Nemovitosti a reality"),
      createOption("Notářství"),
      createOption("Obchod a prodej"),
      createOption("Online marketing"),
      createOption("Personalistika"),
      createOption("Personalistika (HR)"),
      createOption("Podnikání"),
      createOption("Pojišťovnictví"),
      createOption("Právo"),
      createOption("Public relations (PR)"),
      createOption("Quality management (řízení kvality)"),
      createOption("Realitní činnost"),
      createOption("Reklama"),
      createOption("Řízení lidských zdrojů"),
      createOption("Soudnictví"),
      createOption("Účetnictví"),
      createOption("Účetnictví a daně"),
      createOption("Vztahy s veřejností")
    ]
  },
  {
    label: "Zdravotnictví, Ošetřovatelství a Sport",
    options: [
      createOption("Celostní medicína"),
      createOption("Dermatologie (zdravotnictví)"),
      createOption("Farmacie"),
      createOption("Farmacie alternativní (bylinkářství, homeopatie)"),
      createOption("Farmakologie"),
      createOption("Fitness a sport"),
      createOption("Fyzioterapie"),
      createOption("Gymnastika a sportovní trenérství"),
      createOption("Histologie"),
      createOption("Kinanthropologie (věda o pohybu člověka)"),
      createOption("Lékárenství"),
      createOption("Lékařství"),
      createOption("Logopedie"),
      createOption("Medicína (klasická i alternativní)"),
      createOption("Neurovědy"),
      createOption("Nutriční terapie"),
      createOption("Nutriční vědy"),
      createOption("Oftalmologie"),
      createOption("Optika"),
      createOption("Optometrie"),
      createOption("Ortopedie"),
      createOption("Ošetřovatelství"),
      createOption("Psychologie"),
      createOption("Psychologie a terapie"),
      createOption("Radiologie"),
      createOption("Sport a tělovýchova"),
      createOption("Veterinářství"),
      createOption("Wellness a lázeňství"),
      createOption("Zdravotnictví"),
      createOption("Zubní lékařství")
    ]
  },
  {
    label: "Věda, Výzkum a Životní prostředí",
    options: [
      createOption("Archeologie"),
      createOption("Biochemie"),
      createOption("Biologie"),
      createOption("Biotechnologie"),
      createOption("Chemie"),
      createOption("Ekologie a ochrana životního prostředí"),
      createOption("Ekologie a životní prostředí"),
      createOption("Fyzika"),
      createOption("Fyzika aplikovaná"),
      createOption("Geografie"),
      createOption("Geologie"),
      createOption("Historie"),
      createOption("Matematika"),
      createOption("Meteorologie"),
      createOption("Molekulární biologie"),
      createOption("Oceánografie"),
      createOption("Ochrana přírody"),
      createOption("Statistika"),
      createOption("Věda a výzkum"),
      createOption("Vědecký výzkum"),
      createOption("Xenobiologie (teoretický obor, výzkum života)"),
      createOption("Zoologie")
    ]
  },
  {
    label: "Umění, Design a Média",
    options: [
      createOption("Architektura"),
      createOption("Audiovizuální tvorba"),
      createOption("Copywriting"),
      createOption("Dějiny umění"),
      createOption("Design (grafický, průmyslový, produktový, interiérový, UX/UI)"),
      createOption("Divadelní a filmová tvorba"),
      createOption("Dramaturgie a film"),
      createOption("Film a televize"),
      createOption("Fotografie"),
      createOption("Grafika a vizualizace"),
      createOption("Grafika (počítačová, umělecká, reklamní)"),
      createOption("Herectví a divadlo"),
      createOption("Hudba a hudební věda"),
      createOption("Hudba a umění"),
      createOption("Interiérový design"),
      createOption("Journalism (žurnalistika)"),
      createOption("Kulturní management"),
      createOption("Literatura"),
      createOption("Literatura a nakladatelství"),
      createOption("Loutkoherectví"),
      createOption("Média (TV, rádio, online média)"),
      createOption("Mediální studia"),
      createOption("Multimediální tvorba"),
      createOption("Muzejnictví"),
      createOption("Publikační činnost"),
      createOption("Restaurátorství"),
      createOption("Šperkařství"),
      createOption("Tisk a vydavatelství"),
      createOption("Umění (sochařství, malířství, hudba, dramatické)"),
      createOption("Výtvarnictví"),
      createOption("Výtvarné umění"),
      createOption("Xylografie (umělecké rytí do dřeva)"),
      createOption("Žurnalistika")
    ]
  },
  {
    label: "Služby, Gastronomie a Cestovní ruch",
    options: [
      createOption("Catering"),
      createOption("Cestovní ruch"),
      createOption("Cukrářství"),
      createOption("Event management"),
      createOption("Gastronomie"),
      createOption("Gastronomie a pohostinství"),
      createOption("Hotelnictví"),
      createOption("Jachting a lodní doprava"),
      createOption("Kadeřnictví a kosmetické služby"),
      createOption("Kosmetologie"),
      createOption("Potravinářství"),
      createOption("Technologie potravin"),
      createOption("Turismus"),
      createOption("Vinařství"),
      createOption("Yachting (jachting a lodní služby)")
    ]
  },
  {
    label: "Vzdělávání, Humanitní vědy a Ostatní",
    options: [
      createOption("Bohemistika (čeština, jazykověda)"),
      createOption("Bohosloví / Teologie"),
      createOption("Bohoslužby a duchovní péče"),
      createOption("Cizí jazyky a lingvistika"),
      createOption("Český jazyk a literatura"),
      createOption("Filosofie"),
      createOption("Historie a památková péče"),
      createOption("Humanitární činnost"),
      createOption("Jazyková výuka"),
      createOption("Jazykové služby (tlumočení, překlady, jazyková výuka)"),
      createOption("Jazykověda"),
      createOption("Knihovnictví a informační vědy"),
      createOption("Obnova památek"),
      createOption("Pedagogika"),
      createOption("Politologie"),
      createOption("Politologie a veřejná správa"),
      createOption("Regionální rozvoj"),
      createOption("Religionistika"),
      createOption("Sociologie"),
      createOption("Sociální služby"),
      createOption("Školství"),
      createOption("Teologie a církevní činnost"),
      createOption("Tlumočnictví a překladatelství"),
      createOption("Urbanismus a územní plánování"),
      createOption("Vzdělávání dospělých"),
      createOption("Youth work (práce s mládeží, volnočasové aktivity)")
    ]
  },
  {
    label: "Doprava, Logistika a Veřejná správa",
    options: [
      createOption("Armáda a obrana"),
      createOption("Autodoprava"),
      createOption("Bezpečnostní služby"),
      createOption("Celní správa"),
      createOption("Doprava (silniční, železniční, letecká, námořní)"),
      createOption("Doprava a logistika"),
      createOption("Hasičství a záchranářství"),
      createOption("Kriminalistika"),
      createOption("Letectví a kosmonautika"),
      createOption("Logistika"),
      createOption("Logistika a skladování"),
      createOption("Námořní doprava"),
      createOption("Námořnictví"),
      createOption("Policie a bezpečnost"),
      createOption("Požární ochrana"),
      createOption("Provoz a doprava"),
      createOption("Transport a logistika"),
      createOption("Vojenské služby"),
      createOption("Železniční doprava")
    ]
  },
  {
    label: "Zemědělství a Řemesla",
    options: [
      createOption("Agronomie"),
      createOption("Akvakultura"),
      createOption("Automechanik"),
      createOption("Čalounictví"),
      createOption("Instalace a údržba (instalatér, opravář)"),
      createOption("Kovářství"),
      createOption("Lesnictví"),
      createOption("Quarantine services (veterinární, hygienické)"),
      createOption("Řemesla (zedník, truhlář, instalatér, krejčí)"),
      createOption("Veterinární služby"),
      createOption("Zahradnictví"),
      createOption("Zemědělství")
    ]
  }
];

// Flat list for backward compatibility
// Using Set to ensure uniqueness in case of cross-categorization, though current categorization is strict
const uniqueOptions = new Map<string, FieldOption>();
groupedFieldOptions.forEach(group => {
  group.options.forEach(opt => {
    uniqueOptions.set(opt.value, opt);
  });
});

export const fieldOptions: FieldOption[] = Array.from(uniqueOptions.values()).sort((a, b) =>
  a.label.localeCompare(b.label, 'cs', { sensitivity: 'base' })
);