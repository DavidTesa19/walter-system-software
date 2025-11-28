export interface FieldOption {
  value: string;
  label: string;
}

// Unsorted list of all field options
const unsortedFieldOptions: FieldOption[] = [
  // A
  { value: 'Administrativa', label: 'Administrativa' },
  { value: 'Aeronautika a letectví', label: 'Aeronautika a letectví' },
  { value: 'Agronomie', label: 'Agronomie' },
  { value: 'Akvakultura', label: 'Akvakultura' },
  { value: 'Archeologie', label: 'Archeologie' },
  { value: 'Architektura', label: 'Architektura' },
  { value: 'Armáda a obrana', label: 'Armáda a obrana' },
  { value: 'Automobilový průmysl', label: 'Automobilový průmysl' },
  { value: 'Automatizace', label: 'Automatizace' },
  { value: 'Autodoprava', label: 'Autodoprava' },
  { value: 'Automechanik', label: 'Automechanik' },
  { value: 'Audiovizuální tvorba', label: 'Audiovizuální tvorba' },

  // B
  { value: 'Bankovnictví', label: 'Bankovnictví' },
  { value: 'Bezpečnostní služby', label: 'Bezpečnostní služby' },
  { value: 'Biochemie', label: 'Biochemie' },
  { value: 'Biologie', label: 'Biologie' },
  { value: 'Biotechnologie', label: 'Biotechnologie' },
  { value: 'Bohemistika (čeština, jazykověda)', label: 'Bohemistika (čeština, jazykověda)' },
  { value: 'Bohosloví / Teologie', label: 'Bohosloví / Teologie' },
  { value: 'Bohoslužby a duchovní péče', label: 'Bohoslužby a duchovní péče' },
  { value: 'Burzovnictví', label: 'Burzovnictví' },
  { value: 'Bydlení a reality', label: 'Bydlení a reality' },

  // C
  { value: 'Catering', label: 'Catering' },
  { value: 'Celní správa', label: 'Celní správa' },
  { value: 'Cestovní ruch', label: 'Cestovní ruch' },
  { value: 'Chemie', label: 'Chemie' },
  { value: 'Chemie a chemický průmysl', label: 'Chemie a chemický průmysl' },
  { value: 'Chemické inženýrství', label: 'Chemické inženýrství' },
  { value: 'Chemická technologie', label: 'Chemická technologie' },
  { value: 'Civilní inženýrství', label: 'Civilní inženýrství' },
  { value: 'Cirkulární ekonomika', label: 'Cirkulární ekonomika' },
  { value: 'Civic Tech (technologie pro občany a stát)', label: 'Civic Tech (technologie pro občany a stát)' },
  { value: 'Copywriting', label: 'Copywriting' },
  { value: 'Celostní medicína', label: 'Celostní medicína' },
  { value: 'Cizí jazyky a lingvistika', label: 'Cizí jazyky a lingvistika' },
  { value: 'Cukrářství', label: 'Cukrářství' },
  { value: 'Čalounictví', label: 'Čalounictví' },
  { value: 'Český jazyk a literatura', label: 'Český jazyk a literatura' },
  { value: 'Čisté technologie', label: 'Čisté technologie' },

  // D
  { value: 'Datová analytika', label: 'Datová analytika' },
  { value: 'Daňové poradenství', label: 'Daňové poradenství' },
  { value: 'Dermatologie (zdravotnictví)', label: 'Dermatologie (zdravotnictví)' },
  { value: 'Dějiny umění', label: 'Dějiny umění' },
  { value: 'Design (grafický, průmyslový, produktový, interiérový, UX/UI)', label: 'Design (grafický, průmyslový, produktový, interiérový, UX/UI)' },
  { value: 'Digitální marketing', label: 'Digitální marketing' },
  { value: 'Digitální technologie / IT služby', label: 'Digitální technologie / IT služby' },
  { value: 'Divadelní a filmová tvorba', label: 'Divadelní a filmová tvorba' },
  { value: 'Doprava (silniční, železniční, letecká, námořní)', label: 'Doprava (silniční, železniční, letecká, námořní)' },
  { value: 'Doprava a logistika', label: 'Doprava a logistika' },
  { value: 'Dramaturgie a film', label: 'Dramaturgie a film' },
  { value: 'Dřevozpracující průmysl', label: 'Dřevozpracující průmysl' },

  // E
  { value: 'E-commerce', label: 'E-commerce' },
  { value: 'Ekologie a ochrana životního prostředí', label: 'Ekologie a ochrana životního prostředí' },
  { value: 'Ekologie a životní prostředí', label: 'Ekologie a životní prostředí' },
  { value: 'Ekonomie', label: 'Ekonomie' },
  { value: 'Ekonomika a management', label: 'Ekonomika a management' },
  { value: 'Elektrotechnika', label: 'Elektrotechnika' },
  { value: 'Energetika (tradiční i obnovitelné zdroje)', label: 'Energetika (tradiční i obnovitelné zdroje)' },
  { value: 'Ergonomie', label: 'Ergonomie' },
  { value: 'Etika v technologiích', label: 'Etika v technologiích' },
  { value: 'Event management', label: 'Event management' },

  // F
  { value: 'Farmacie', label: 'Farmacie' },
  { value: 'Farmacie alternativní (bylinkářství, homeopatie)', label: 'Farmacie alternativní (bylinkářství, homeopatie)' },
  { value: 'Farmakologie', label: 'Farmakologie' },
  { value: 'Filosofie', label: 'Filosofie' },
  { value: 'Film a televize', label: 'Film a televize' },
  { value: 'Finance', label: 'Finance' },
  { value: 'Fintech', label: 'Fintech' },
  { value: 'Fitness a sport', label: 'Fitness a sport' },
  { value: 'Fotografie', label: 'Fotografie' },
  { value: 'Fyzika', label: 'Fyzika' },
  { value: 'Fyzika aplikovaná', label: 'Fyzika aplikovaná' },
  { value: 'Fyzioterapie', label: 'Fyzioterapie' },

  // G
  { value: 'Gastronomie', label: 'Gastronomie' },
  { value: 'Gastronomie a pohostinství', label: 'Gastronomie a pohostinství' },
  { value: 'Geodézie a kartografie', label: 'Geodézie a kartografie' },
  { value: 'Geografie', label: 'Geografie' },
  { value: 'Geoinformatika', label: 'Geoinformatika' },
  { value: 'Geologie', label: 'Geologie' },
  { value: 'Geologie a hornictví', label: 'Geologie a hornictví' },
  { value: 'Grafika a vizualizace', label: 'Grafika a vizualizace' },
  { value: 'Grafika (počítačová, umělecká, reklamní)', label: 'Grafika (počítačová, umělecká, reklamní)' },
  { value: 'Gymnastika a sportovní trenérství', label: 'Gymnastika a sportovní trenérství' },

  // H
  { value: 'Hasičství a záchranářství', label: 'Hasičství a záchranářství' },
  { value: 'Herectví a divadlo', label: 'Herectví a divadlo' },
  { value: 'Historie', label: 'Historie' },
  { value: 'Historie a památková péče', label: 'Historie a památková péče' },
  { value: 'Histologie', label: 'Histologie' },
  { value: 'Hudba a hudební věda', label: 'Hudba a hudební věda' },
  { value: 'Hudba a umění', label: 'Hudba a umění' },
  { value: 'Humanitární činnost', label: 'Humanitární činnost' },
  { value: 'HR (lidské zdroje, personalistika)', label: 'HR (lidské zdroje, personalistika)' },
  { value: 'Hotelnictví', label: 'Hotelnictví' },
  { value: 'Hutnictví', label: 'Hutnictví' },
  { value: 'Hutnictví a metalurgie', label: 'Hutnictví a metalurgie' },

  // I
  { value: 'Informatika', label: 'Informatika' },
  { value: 'Informatika a vývoj software', label: 'Informatika a vývoj software' },
  { value: 'Inovační management', label: 'Inovační management' },
  { value: 'Inženýrství (stavební, strojní, chemické, elektro, průmyslové, výrobní)', label: 'Inženýrství (stavební, strojní, chemické, elektro, průmyslové, výrobní)' },
  { value: 'Instalace a údržba (instalatér, opravář)', label: 'Instalace a údržba (instalatér, opravář)' },
  { value: 'Inspekční a kontrolní činnost', label: 'Inspekční a kontrolní činnost' },
  { value: 'Investiční poradenství', label: 'Investiční poradenství' },
  { value: 'Interiérový design', label: 'Interiérový design' },

  // J
  { value: 'Jaderná energetika', label: 'Jaderná energetika' },
  { value: 'Jazyková výuka', label: 'Jazyková výuka' },
  { value: 'Jazykové služby (tlumočení, překlady, jazyková výuka)', label: 'Jazykové služby (tlumočení, překlady, jazyková výuka)' },
  { value: 'Jazykověda', label: 'Jazykověda' },
  { value: 'Jachting a lodní doprava', label: 'Jachting a lodní doprava' },
  { value: 'Journalism (žurnalistika)', label: 'Journalism (žurnalistika)' },
  { value: 'Justiční služby', label: 'Justiční služby' },

  // K
  { value: 'Kadeřnictví a kosmetické služby', label: 'Kadeřnictví a kosmetické služby' },
  { value: 'Kartografie', label: 'Kartografie' },
  { value: 'Konstrukce a strojírenství', label: 'Konstrukce a strojírenství' },
  { value: 'Kosmetologie', label: 'Kosmetologie' },
  { value: 'Kovářství', label: 'Kovářství' },
  { value: 'Kriminalistika', label: 'Kriminalistika' },
  { value: 'Kulturní management', label: 'Kulturní management' },
  { value: 'Kyberbezpečnost', label: 'Kyberbezpečnost' },
  { value: 'Knihovnictví a informační vědy', label: 'Knihovnictví a informační vědy' },
  { value: 'Kinanthropologie (věda o pohybu člověka)', label: 'Kinanthropologie (věda o pohybu člověka)' },

  // L
  { value: 'Lékárenství', label: 'Lékárenství' },
  { value: 'Lékařství', label: 'Lékařství' },
  { value: 'Lesnictví', label: 'Lesnictví' },
  { value: 'Letectví a kosmonautika', label: 'Letectví a kosmonautika' },
  { value: 'Literatura', label: 'Literatura' },
  { value: 'Literatura a nakladatelství', label: 'Literatura a nakladatelství' },
  { value: 'Logistika', label: 'Logistika' },
  { value: 'Logistika a skladování', label: 'Logistika a skladování' },
  { value: 'Logopedie', label: 'Logopedie' },
  { value: 'Loutkoherectví', label: 'Loutkoherectví' },

  // M
  { value: 'Management', label: 'Management' },
  { value: 'Marketing', label: 'Marketing' },
  { value: 'Matematika', label: 'Matematika' },
  { value: 'Média (TV, rádio, online média)', label: 'Média (TV, rádio, online média)' },
  { value: 'Mechanika a montáž', label: 'Mechanika a montáž' },
  { value: 'Mediální studia', label: 'Mediální studia' },
  { value: 'Mechatronika', label: 'Mechatronika' },
  { value: 'Mezinárodní obchod', label: 'Mezinárodní obchod' },
  { value: 'Meteorologie', label: 'Meteorologie' },
  { value: 'Molekulární biologie', label: 'Molekulární biologie' },
  { value: 'Montážní a údržbářské práce', label: 'Montážní a údržbářské práce' },
  { value: 'Multimediální tvorba', label: 'Multimediální tvorba' },
  { value: 'Muzejnictví', label: 'Muzejnictví' },
  { value: 'Medicína (klasická i alternativní)', label: 'Medicína (klasická i alternativní)' },

  // N
  { value: 'Nanotechnologie', label: 'Nanotechnologie' },
  { value: 'Nábytkářství', label: 'Nábytkářství' },
  { value: 'Námořnictví', label: 'Námořnictví' },
  { value: 'Námořní doprava', label: 'Námořní doprava' },
  { value: 'Národní hospodářství', label: 'Národní hospodářství' },
  { value: 'Nemovitosti a reality', label: 'Nemovitosti a reality' },
  { value: 'Neurovědy', label: 'Neurovědy' },
  { value: 'Notářství', label: 'Notářství' },
  { value: 'Nutriční terapie', label: 'Nutriční terapie' },
  { value: 'Nutriční vědy', label: 'Nutriční vědy' },

  // O
  { value: 'Obchod a prodej', label: 'Obchod a prodej' },
  { value: 'Obnova památek', label: 'Obnova památek' },
  { value: 'Obnovitelné zdroje energie', label: 'Obnovitelné zdroje energie' },
  { value: 'Ochrana přírody', label: 'Ochrana přírody' },
  { value: 'Oceánografie', label: 'Oceánografie' },
  { value: 'Oftalmologie', label: 'Oftalmologie' },
  { value: 'Online marketing', label: 'Online marketing' },
  { value: 'Optika', label: 'Optika' },
  { value: 'Optometrie', label: 'Optometrie' },
  { value: 'Organizace a řízení výroby', label: 'Organizace a řízení výroby' },
  { value: 'Ortopedie', label: 'Ortopedie' },
  { value: 'Ošetřovatelství', label: 'Ošetřovatelství' },

  // P
  { value: 'Pedagogika', label: 'Pedagogika' },
  { value: 'Personalistika', label: 'Personalistika' },
  { value: 'Personalistika (HR)', label: 'Personalistika (HR)' },
  { value: 'Podnikání', label: 'Podnikání' },
  { value: 'Počítačové vědy', label: 'Počítačové vědy' },
  { value: 'Pojišťovnictví', label: 'Pojišťovnictví' },
  { value: 'Policie a bezpečnost', label: 'Policie a bezpečnost' },
  { value: 'Politologie', label: 'Politologie' },
  { value: 'Politologie a veřejná správa', label: 'Politologie a veřejná správa' },
  { value: 'Potravinářství', label: 'Potravinářství' },
  { value: 'Požární ochrana', label: 'Požární ochrana' },
  { value: 'Právo', label: 'Právo' },
  { value: 'Provoz a doprava', label: 'Provoz a doprava' },
  { value: 'Programování', label: 'Programování' },
  { value: 'Psychologie', label: 'Psychologie' },
  { value: 'Psychologie a terapie', label: 'Psychologie a terapie' },
  { value: 'Public relations (PR)', label: 'Public relations (PR)' },
  { value: 'Publikační činnost', label: 'Publikační činnost' },

  // Q
  { value: 'Quality management (řízení kvality)', label: 'Quality management (řízení kvality)' },
  { value: 'Quarantine services (veterinární, hygienické)', label: 'Quarantine services (veterinární, hygienické)' },
  { value: 'Quantum computing (kvantové výpočty)', label: 'Quantum computing (kvantové výpočty)' },

  // R
  { value: 'Radiologie', label: 'Radiologie' },
  { value: 'Realitní činnost', label: 'Realitní činnost' },
  { value: 'Reklama', label: 'Reklama' },
  { value: 'Regionální rozvoj', label: 'Regionální rozvoj' },
  { value: 'Religionistika', label: 'Religionistika' },
  { value: 'Restaurátorství', label: 'Restaurátorství' },
  { value: 'Robotika a automatizace', label: 'Robotika a automatizace' },
  { value: 'Řemesla (zedník, truhlář, instalatér, krejčí)', label: 'Řemesla (zedník, truhlář, instalatér, krejčí)' },
  { value: 'Řízení lidských zdrojů', label: 'Řízení lidských zdrojů' },

  // S
  { value: 'Sociologie', label: 'Sociologie' },
  { value: 'Sociální práce', label: 'Sociální práce' },
  { value: 'Sociální služby', label: 'Sociální služby' },
  { value: 'Softwarové inženýrství', label: 'Softwarové inženýrství' },
  { value: 'Sport a tělovýchova', label: 'Sport a tělovýchova' },
  { value: 'Statistika', label: 'Statistika' },
  { value: 'Statistika a analýza dat', label: 'Statistika a analýza dat' },
  { value: 'Stavebnictví', label: 'Stavebnictví' },
  { value: 'Strojírenství', label: 'Strojírenství' },
  { value: 'Soudnictví', label: 'Soudnictví' },
  { value: 'Systémové inženýrství', label: 'Systémové inženýrství' },
  { value: 'Svářečství', label: 'Svářečství' },
  { value: 'Školství', label: 'Školství' },
  { value: 'Šperkařství', label: 'Šperkařství' },

  // T
  { value: 'Technologie potravin', label: 'Technologie potravin' },
  { value: 'Technologie umělé inteligence', label: 'Technologie umělé inteligence' },
  { value: 'Telekomunikace', label: 'Telekomunikace' },
  { value: 'Textilní a oděvní průmysl', label: 'Textilní a oděvní průmysl' },
  { value: 'Textilní průmysl', label: 'Textilní průmysl' },
  { value: 'Testování softwaru', label: 'Testování softwaru' },
  { value: 'Tlumočnictví a překladatelství', label: 'Tlumočnictví a překladatelství' },
  { value: 'Transport a logistika', label: 'Transport a logistika' },
  { value: 'Turismus', label: 'Turismus' },
  { value: 'Tvorba her (game design)', label: 'Tvorba her (game design)' },
  { value: 'Tisk a vydavatelství', label: 'Tisk a vydavatelství' },
  { value: 'Teologie a církevní činnost', label: 'Teologie a církevní činnost' },

  // U
  { value: 'Umění (sochařství, malířství, hudba, dramatické)', label: 'Umění (sochařství, malířství, hudba, dramatické)' },
  { value: 'Umělá inteligence (AI)', label: 'Umělá inteligence (AI)' },
  { value: 'Účetnictví', label: 'Účetnictví' },
  { value: 'Účetnictví a daně', label: 'Účetnictví a daně' },
  { value: 'Údržba a servis technologií', label: 'Údržba a servis technologií' },
  { value: 'Údržba technických zařízení', label: 'Údržba technických zařízení' },
  { value: 'Urbanismus a územní plánování', label: 'Urbanismus a územní plánování' },

  // V
  { value: 'Veterinární služby', label: 'Veterinární služby' },
  { value: 'Veterinářství', label: 'Veterinářství' },
  { value: 'Věda a výzkum', label: 'Věda a výzkum' },
  { value: 'Vědecký výzkum', label: 'Vědecký výzkum' },
  { value: 'Vinařství', label: 'Vinařství' },
  { value: 'Vojenské služby', label: 'Vojenské služby' },
  { value: 'Výtvarnictví', label: 'Výtvarnictví' },
  { value: 'Výtvarné umění', label: 'Výtvarné umění' },
  { value: 'Vzdělávání dospělých', label: 'Vzdělávání dospělých' },
  { value: 'Výroba (strojní, potravinářská, textilní, automobilová)', label: 'Výroba (strojní, potravinářská, textilní, automobilová)' },
  { value: 'Vývoj software', label: 'Vývoj software' },
  { value: 'Vztahy s veřejností', label: 'Vztahy s veřejností' },
  { value: 'Vodohospodářství', label: 'Vodohospodářství' },

  // W
  { value: 'Webdesign', label: 'Webdesign' },
  { value: 'Wellness a lázeňství', label: 'Wellness a lázeňství' },
  { value: 'Wind energy (větrná energetika)', label: 'Wind energy (větrná energetika)' },

  // X
  { value: 'Xenobiologie (teoretický obor, výzkum života)', label: 'Xenobiologie (teoretický obor, výzkum života)' },
  { value: 'Xylografie (umělecké rytí do dřeva)', label: 'Xylografie (umělecké rytí do dřeva)' },

  // Y
  { value: 'Yachting (jachting a lodní služby)', label: 'Yachting (jachting a lodní služby)' },
  { value: 'Youth work (práce s mládeží, volnočasové aktivity)', label: 'Youth work (práce s mládeží, volnočasové aktivity)' },

  // Z
  { value: 'Zahradnictví', label: 'Zahradnictví' },
  { value: 'Zemědělství', label: 'Zemědělství' },
  { value: 'Zdravotnictví', label: 'Zdravotnictví' },
  { value: 'Zoologie', label: 'Zoologie' },
  { value: 'Zubní lékařství', label: 'Zubní lékařství' },
  { value: 'Železniční doprava', label: 'Železniční doprava' },
  { value: 'Žurnalistika', label: 'Žurnalistika' }
];

// Sort alphabetically using Czech locale (handles Č, Ř, Š, Ž properly)
export const fieldOptions: FieldOption[] = unsortedFieldOptions.sort((a, b) =>
  a.label.localeCompare(b.label, 'cs', { sensitivity: 'base' })
);