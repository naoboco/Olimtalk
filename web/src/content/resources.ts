export type Lang = 'fr' | 'ru' | 'es' | 'en';
export type ProfileType = 'student' | 'entrepreneur' | 'employee' | 'medical' | 'legal';
export type L = Record<Lang, string>;

export interface OfficialLink {
  id: string;                 // kebab-case unique id, e.g. 'nbn', 'qualita', 'kol-zchut'
  org: string;                // organisation name as commonly written (Latin script), e.g. "Nefesh B'Nefesh"
  hebrew?: string;            // Hebrew name if relevant, e.g. 'משרד העלייה והקליטה'
  emoji: string;              // one emoji used as icon
  kind: 'government' | 'association' | 'info';
  url: string | Partial<L>;   // one URL, or per-language URLs when the site has real localized versions (fallback order used by app: user lang -> en -> first available)
  phone?: string;             // official hotline if one is well known (e.g. '*2994'), otherwise omit
  title: L;                   // short localized label
  desc: L;                    // 1-2 sentence localized description of what it is useful for
  worlds?: Lang[];            // only set when the organisation targets specific language communities (e.g. Qualita -> ['fr']); omit = shown in all worlds
  profiles?: ProfileType[];   // only set when relevant to specific profiles; omit = everyone
}

export interface GuideStep {
  title: L;
  desc: L;                    // 1-3 practical sentences
  links?: string[];           // ids of OfficialLink
}

export interface ProfileGuide {
  profile: ProfileType | 'all';
  emoji: string;
  title: L;                   // e.g. fr: 'Étudiants'
  intro: L;                   // 1-2 sentences
  steps: GuideStep[];         // 5-8 steps, in sensible chronological order
}

// ---------------------------------------------------------------------------
// Official links
// URLs were checked against live search results in November 2026.
// gov.il pages use the /en/, /fr/, /ru/, /es/ variant only where that exact
// localized page was found; otherwise the app falls back to the English page.
// ---------------------------------------------------------------------------

export const OFFICIAL_LINKS: OfficialLink[] = [
  // ----- Government: general -----
  {
    id: "gov-il",
    org: "gov.il",
    emoji: "🇮🇱",
    kind: "government",
    url: "https://www.gov.il/en",
    title: {
      fr: "Portail gov.il",
      ru: "Портал gov.il",
      es: "Portal gov.il",
      en: "gov.il portal",
    },
    desc: {
      fr: "Le site officiel des services et de l'information du gouvernement israélien : formulaires, prises de rendez-vous et démarches en ligne de tous les ministères.",
      ru: "Официальный сайт государственных услуг и информации Израиля: бланки, запись на приём и онлайн-услуги всех министерств в одном месте.",
      es: "El sitio oficial de servicios e información del Gobierno de Israel: formularios, citas y trámites en línea de todos los ministerios en un solo lugar.",
      en: "Israel's official government services and information website: forms, appointments and online services of all ministries in one place.",
    },
  },
  {
    id: "moia",
    org: "Ministry of Aliyah and Integration (Misrad HaAliyah VeHaKlita)",
    hebrew: "משרד העלייה והקליטה",
    emoji: "🏛️",
    kind: "government",
    url: {
      fr: "https://www.gov.il/fr/departments/ministry_of_aliyah_and_integration/govil-landing-page",
      ru: "https://www.gov.il/ru/departments/ministry_of_aliyah_and_integration",
      es: "https://www.gov.il/es/departments/ministry_of_aliyah_and_integration",
      en: "https://www.gov.il/en/departments/ministry_of_aliyah_and_integration/govil-landing-page",
    },
    phone: "*2994",
    title: {
      fr: "Ministère de l'Alyah et de l'Intégration",
      ru: "Министерство алии и интеграции",
      es: "Ministerio de Aliá y de Integración",
      en: "Ministry of Aliyah and Integration",
    },
    desc: {
      fr: "Votre interlocuteur principal après l'alyah : conseiller d'intégration personnel (yoetz klita), sal klita, orientation vers l'oulpan, aides au logement et à l'emploi. Rendez-vous en ligne ou via le centre d'appels *2994.",
      ru: "Главный адрес после репатриации: личный консультант по интеграции (йоэц клита), корзина абсорбции (саль клита), направление в ульпан, помощь с жильём и трудоустройством. Запись на приём — онлайн или через колл-центр *2994.",
      es: "Tu principal referencia tras la aliá: asesor personal de integración (yoetz klitá), sal klitá, derivación al ulpán y ayudas de vivienda y empleo. Pide cita en línea o a través del centro de llamadas *2994.",
      en: "Your main address after aliyah: personal absorption counsellor (yoetz klita), sal klita, ulpan referral, housing and employment assistance. Book appointments online or through the *2994 call centre.",
    },
  },
  {
    id: "moia-personal-area",
    org: "Ministry of Aliyah and Integration – Personal Area (Ezor Ishi)",
    emoji: "👤",
    kind: "government",
    url: {
      fr: "https://www.gov.il/fr/service/private-area-new-immigrants-and-returning-residents",
      ru: "https://www.gov.il/ru/service/private-area-new-immigrants-and-returning-residents",
      es: "https://www.gov.il/es/service/private-area-new-immigrants-and-returning-residents",
      en: "https://www.gov.il/en/service/private-area-new-immigrants-and-returning-residents",
    },
    title: {
      fr: "Espace personnel des olim (Ezor Ishi)",
      ru: "Личный кабинет репатрианта («эзор иши»)",
      es: "Área personal para olim (Ezor Ishí)",
      en: "Olim personal area (Ezor Ishi)",
    },
    desc: {
      fr: "Compte en ligne pour consulter les aides reçues ou auxquelles vous pouvez prétendre, écrire à votre conseiller d'intégration, envoyer des documents et demander des attestations.",
      ru: "Онлайн-кабинет, где видно, какую помощь вы уже получили и на какую ещё можете претендовать; через него можно написать консультанту по интеграции, отправить документы и заказать справки.",
      es: "Cuenta en línea donde ves las ayudas que has recibido o que te pueden corresponder, escribes a tu asesor de integración, envías documentos y solicitas certificados.",
      en: "Online account where you can see the assistance you have received or may be entitled to, write to your absorption counsellor, send documents and request certificates.",
    },
  },
  {
    id: "piba",
    org: "Population and Immigration Authority (Misrad HaPnim)",
    hebrew: "רשות האוכלוסין וההגירה",
    emoji: "🪪",
    kind: "government",
    url: "https://www.gov.il/en/departments/population_and_immigration_authority",
    phone: "*3450",
    title: {
      fr: "Autorité de la population et de l'immigration",
      ru: "Управление народонаселения и иммиграции",
      es: "Autoridad de Población e Inmigración",
      en: "Population and Immigration Authority",
    },
    desc: {
      fr: "Le bureau que les olim appellent encore Misrad HaPnim : téoudat zéout, passeports et documents de voyage, visas, changement d'adresse et état civil. Les rendez-vous se prennent en ligne ou au *3450.",
      ru: "То, что репатрианты по привычке называют «Мисрад ха-Пним» (МВД): теудат зеут, загранпаспорта и проездные документы, визы, смена адреса и регистрация актов гражданского состояния. Запись на приём — онлайн или по номеру *3450.",
      es: "La oficina que los olim siguen llamando Misrad HaPnim: teudat zehut, pasaportes y documentos de viaje, visados, cambio de domicilio y registro civil. Las citas se piden en línea o en el *3450.",
      en: "The office olim still call Misrad HaPnim: teudat zehut, passports and travel documents, visas, change of address and civil-status registration. Appointments are booked online or via *3450.",
    },
  },
  {
    id: "bituach-leumi",
    org: "Bituach Leumi – National Insurance Institute",
    hebrew: "המוסד לביטוח לאומי",
    emoji: "🛡️",
    kind: "government",
    url: {
      fr: "https://www.btl.gov.il/French%20homepage/Pages/default.aspx",
      ru: "https://www.btl.gov.il/RussianHomePage/Pages/default.aspx",
      en: "https://www.btl.gov.il/English%20Homepage/Pages/default.aspx",
    },
    phone: "*6050",
    title: {
      fr: "Bitouah Léoumi (Assurance nationale)",
      ru: "Битуах Леуми (Институт национального страхования)",
      es: "Bituaj Leumí (Seguro Nacional)",
      en: "Bituach Leumi (National Insurance)",
    },
    desc: {
      fr: "La sécurité sociale israélienne : cotisations d'assurance nationale et d'assurance maladie, allocations familiales, maternité, chômage, invalidité et vieillesse. Vérifiez ce qui s'applique aux nouveaux olim et gérez votre dossier en ligne.",
      ru: "Израильская система социального страхования: взносы по национальному и медицинскому страхованию, пособия на детей, по материнству, безработице, инвалидности и старости. Проверьте, что положено новым репатриантам, и ведите дела онлайн.",
      es: "La seguridad social israelí: cotizaciones al seguro nacional y de salud, asignaciones por hijos, maternidad, desempleo, discapacidad y vejez. Comprueba qué corresponde a los nuevos olim y gestiona tu expediente en línea.",
      en: "Israel's social security: national and health insurance contributions, child allowance, maternity, unemployment, disability and old-age benefits. Check what applies to new olim and manage your file online.",
    },
  },
  {
    id: "kupat-holim",
    org: "Kupot Holim – Clalit, Maccabi, Meuhedet, Leumit",
    hebrew: "קופות החולים",
    emoji: "🏥",
    kind: "government",
    url: {
      ru: "https://www.btl.gov.il/RussianHomePage/Gvia_ru/dmeBituhachBriuut_ru/rishumBeKupatCholim/Pages/olimChadashim.aspx",
      en: "https://www.btl.gov.il/English%20Homepage/Insurance/Health%20Insurance/Registration/Pages/olim.aspx",
    },
    title: {
      fr: "Inscription à une koupat holim",
      ru: "Запись в больничную кассу (купат холим)",
      es: "Inscripción en una kupat jolim",
      en: "Kupat holim registration",
    },
    desc: {
      fr: "Page officielle du Bitouah Léoumi expliquant comment les nouveaux olim s'inscrivent dans l'une des quatre caisses de santé (Clalit, Maccabi, Meuhedet, Leumit) et comment fonctionnent les cotisations d'assurance maladie.",
      ru: "Официальная страница Битуах Леуми о том, как новым репатриантам записаться в одну из четырёх больничных касс («Клалит», «Маккаби», «Меухедет», «Леумит») и как платятся взносы по медицинскому страхованию.",
      es: "Página oficial del Bituaj Leumí que explica cómo se inscriben los nuevos olim en una de las cuatro cajas de salud (Clalit, Maccabi, Meuhedet, Leumit) y cómo funcionan las cotizaciones del seguro de salud.",
      en: "Official Bituach Leumi page explaining how new olim register with one of the four health funds (Clalit, Maccabi, Meuhedet, Leumit) and how health insurance contributions work.",
    },
  },
  {
    id: "tax-authority",
    org: "Israel Tax Authority",
    hebrew: "רשות המסים בישראל",
    emoji: "🧾",
    kind: "government",
    url: "https://www.gov.il/en/departments/israel_tax_authority",
    phone: "*4954",
    title: {
      fr: "Autorité fiscale israélienne",
      ru: "Налоговое управление Израиля",
      es: "Autoridad Tributaria de Israel",
      en: "Israel Tax Authority",
    },
    desc: {
      fr: "Impôt sur le revenu, TVA (Maam) et douanes. Les nouveaux olim peuvent bénéficier d'avantages fiscaux, comme des points de crédit d'impôt et des allègements sur les revenus de source étrangère : vérifiez votre éligibilité sur le site ou auprès du centre d'information *4954.",
      ru: "Подоходный налог, НДС (маам) и таможня. Новым репатриантам могут полагаться налоговые льготы — например, зачётные пункты (некудот зикуй) и послабления по зарубежным доходам. Проверьте свои права на сайте или в справочном центре *4954.",
      es: "Impuesto sobre la renta, IVA (maam) y aduanas. Los nuevos olim pueden tener derecho a beneficios fiscales, como puntos de crédito y exenciones sobre ingresos del exterior: comprueba tu caso en el sitio o en el centro de información *4954.",
      en: "Income tax, VAT and customs. New olim may be entitled to tax benefits such as income-tax credit points and reliefs on foreign income — check your eligibility on the site or through the *4954 information centre.",
    },
  },
  {
    id: "ulpan",
    org: "Ulpan – Ministry of Aliyah and Integration & Ministry of Education",
    hebrew: "אולפן",
    emoji: "🗣️",
    kind: "government",
    url: {
      fr: "https://www.gov.il/fr/departments/general/ulpan_main",
      es: "https://www.gov.il/es/departments/general/ulpan_main",
      en: "https://www.gov.il/en/departments/general/ulpan_main",
    },
    title: {
      fr: "Oulpan (cours d'hébreu)",
      ru: "Ульпан (изучение иврита)",
      es: "Ulpán (estudio del hebreo)",
      en: "Ulpan (Hebrew studies)",
    },
    desc: {
      fr: "Informations officielles sur les oulpans publics : types d'oulpan, orientation par votre conseiller d'intégration et alternatives comme les bons (vouchers) pour des cours d'hébreu privés.",
      ru: "Официальная информация о государственных ульпанах: виды ульпанов, как получить направление у консультанта по интеграции и какие есть альтернативы, например ваучеры на частные курсы иврита.",
      es: "Información oficial sobre los ulpanim públicos: tipos de ulpán, cómo obtener la derivación de tu asesor de integración y alternativas como los cupones (vouchers) para cursos privados de hebreo.",
      en: "Official information on state ulpan programmes: types of ulpan, how to get a referral from your absorption counsellor, and alternatives such as vouchers for private Hebrew courses.",
    },
  },
  {
    id: "driving-licence",
    org: "Ministry of Transport and Road Safety – Licensing",
    hebrew: "משרד התחבורה והבטיחות בדרכים",
    emoji: "🚗",
    kind: "government",
    url: {
      ru: "https://www.gov.il/ru/service/convert_driving_license",
      en: "https://www.gov.il/en/service/convert_driving_license",
    },
    phone: "*5678",
    title: {
      fr: "Conversion du permis de conduire",
      ru: "Обмен водительских прав",
      es: "Canje del permiso de conducir",
      en: "Driving licence conversion",
    },
    desc: {
      fr: "Service officiel de conversion d'un permis étranger en permis israélien : conditions, documents et étapes. Vous ne pouvez conduire avec votre permis étranger que pendant une durée limitée après l'arrivée : renseignez-vous tôt.",
      ru: "Официальная услуга по обмену иностранных водительских прав на израильские: условия, документы и порядок действий. Ездить по иностранным правам после приезда можно лишь ограниченное время, поэтому уточните правила заранее.",
      es: "Servicio oficial para canjear un permiso de conducir extranjero por uno israelí: condiciones, documentos y pasos. Solo puedes conducir con tu permiso extranjero durante un tiempo limitado tras la llegada, así que infórmate pronto.",
      en: "Official service for converting a foreign driving licence into an Israeli one: conditions, documents and steps. You can drive on your foreign licence only for a limited time after arrival, so check the rules early.",
    },
  },
  {
    id: "degree-evaluation",
    org: "Department for Evaluation of Academic Degrees from Abroad (Ministry of Aliyah and Integration)",
    hebrew: "המחלקה להערכת תארים אקדמיים מחו״ל",
    emoji: "📜",
    kind: "government",
    url: {
      fr: "https://www.gov.il/fr/pages/foreign-degree-evaluation-faq",
      ru: "https://www.gov.il/ru/service/foreign-degree-evaluation-for-new-olim",
      es: "https://www.gov.il/es/service/foreign-degree-evaluation-for-new-olim",
      en: "https://www.gov.il/en/service/foreign-degree-evaluation-for-new-olim",
    },
    title: {
      fr: "Évaluation des diplômes étrangers",
      ru: "Подтверждение зарубежных дипломов",
      es: "Evaluación de títulos extranjeros",
      en: "Evaluation of foreign degrees",
    },
    desc: {
      fr: "Évaluation officielle des diplômes universitaires obtenus à l'étranger, surtout nécessaire pour les emplois et la grille salariale du secteur public. Pour les nouveaux olim, la demande se fait en ligne via l'espace personnel du ministère de l'Alyah et de l'Intégration.",
      ru: "Официальная оценка академических степеней, полученных за рубежом; нужна прежде всего для работы в госсекторе и определения зарплатного разряда. Новые репатрианты подают просьбу онлайн через личный кабинет Министерства алии и интеграции.",
      es: "Evaluación oficial de los títulos académicos obtenidos en el extranjero, necesaria sobre todo para empleos y escalas salariales del sector público. Los nuevos olim presentan la solicitud en línea desde el área personal del Ministerio de Aliá y de Integración.",
      en: "Official evaluation of academic degrees earned abroad, needed mainly for public-sector jobs and salary grading. New olim file the request online through the Ministry of Aliyah and Integration personal area.",
    },
  },
  {
    id: "degree-evaluation-moe",
    org: "Ministry of Education – Division for Evaluation of Foreign Academic Degrees",
    hebrew: "משרד החינוך – האגף להערכת תארים אקדמיים מחו״ל",
    emoji: "🏫",
    kind: "government",
    url: "https://edu.gov.il/special/students/Services/evaluation-of-foreign-academic-degrees/Pages/evaluation-of-foreign-academic-degrees.aspx",
    title: {
      fr: "Évaluation des diplômes – ministère de l'Éducation",
      ru: "Оценка дипломов — Министерство просвещения",
      es: "Evaluación de títulos – Ministerio de Educación",
      en: "Degree evaluation – Ministry of Education",
    },
    desc: {
      fr: "La division du ministère de l'Éducation qui évalue les diplômes étrangers des personnes non prises en charge par le ministère de l'Alyah et de l'Intégration, par exemple les olim qui s'y étaient adressés avant le transfert de compétence de 2025. Page en hébreu.",
      ru: "Отдел Министерства просвещения, который оценивает зарубежные дипломы тех, чьи дела не ведёт Министерство алии и интеграции, — например, репатриантов, обратившихся туда до передачи полномочий в 2025 году. Страница на иврите.",
      es: "La división del Ministerio de Educación que evalúa los títulos extranjeros de quienes no son atendidos por el Ministerio de Aliá y de Integración, por ejemplo los olim que acudieron a ella antes del traspaso de competencias de 2025. Página en hebreo.",
      en: "The Ministry of Education division that evaluates foreign degrees for people not handled by the Ministry of Aliyah and Integration — for example olim who applied to it before responsibility was transferred in 2025. Page in Hebrew.",
    },
  },

  // ----- Information & nationwide organisations -----
  {
    id: "kol-zchut",
    org: "Kol Zchut (All Rights)",
    hebrew: "כל זכות",
    emoji: "📚",
    kind: "info",
    url: {
      ru: "https://www.kolzchut.org.il/ru/",
      en: "https://www.kolzchut.org.il/he/%D7%A2%D7%95%D7%9C%D7%99%D7%9D",
    },
    title: {
      fr: "Kol Zchut – encyclopédie des droits",
      ru: "Коль Зхут — энциклопедия прав",
      es: "Kol Zchut – enciclopedia de derechos",
      en: "Kol Zchut – rights encyclopedia",
    },
    desc: {
      fr: "Guide gratuit et clair des droits et des aides en Israël, avec une rubrique consacrée aux olim (sal klita, réduction d'arnona, avantages fiscaux, aide au logement). Publié en hébreu, en arabe et en russe ; l'édition anglaise ayant été arrêtée, utilisez au besoin la traduction automatique de votre navigateur.",
      ru: "Бесплатный и понятный справочник по правам и льготам в Израиле с материалами для репатриантов: корзина абсорбции, скидка на арнону, налоговые льготы, помощь с жильём. Есть версия на русском языке; переведено пока не всё, поэтому при необходимости сверяйтесь с версией на иврите.",
      es: "Guía gratuita y clara de derechos y ayudas en Israel, con una sección dedicada a los olim (sal klitá, descuento de arnona, beneficios fiscales, ayuda a la vivienda). Se publica en hebreo, árabe y ruso; la edición en inglés se discontinuó, así que usa el traductor del navegador si lo necesitas.",
      en: "Free, plain-language guide to rights and benefits in Israel, with a section for olim (sal klita, arnona discount, tax benefits, housing aid). Published in Hebrew, Arabic and Russian — the English edition was discontinued, so use your browser's translation if needed.",
    },
  },
  {
    id: "jewish-agency",
    org: "The Jewish Agency for Israel",
    hebrew: "הסוכנות היהודית לארץ ישראל",
    emoji: "🕎",
    kind: "association",
    url: {
      fr: "https://www.jewishagency.org/fr/alyah/",
      ru: "https://www.jewishagency.org/ru/aliyah/",
      es: "https://www.jewishagency.org/es/alia/",
      en: "https://www.jewishagency.org/aliyah/",
    },
    title: {
      fr: "Agence Juive pour Israël",
      ru: "Еврейское агентство (Сохнут)",
      es: "Agencia Judía para Israel",
      en: "The Jewish Agency for Israel",
    },
    desc: {
      fr: "Gère les dossiers d'alyah depuis l'étranger et propose en Israël des programmes d'intégration : oulpan, solutions d'hébergement et programmes d'insertion professionnelle pour les olim.",
      ru: "Ведёт оформление репатриации из-за рубежа и проводит в Израиле программы абсорбции: ульпаны, программы с проживанием и помощь в трудоустройстве для репатриантов.",
      es: "Gestiona los expedientes de aliá desde el exterior y ofrece en Israel programas de absorción: ulpán, soluciones de alojamiento y programas laborales para olim.",
      en: "Handles aliyah applications from abroad and runs absorption programmes in Israel: ulpan, housing frameworks and employment programmes for olim.",
    },
  },
  {
    id: "nbn",
    org: "Nefesh B'Nefesh",
    hebrew: "נפש בנפש",
    emoji: "✈️",
    kind: "association",
    url: "https://www.nbn.org.il/",
    phone: "*3680",
    title: {
      fr: "Nefesh B'Nefesh",
      ru: "Нефеш бе-Нефеш (Nefesh B'Nefesh)",
      es: "Nefesh B'Nefesh",
      en: "Nefesh B'Nefesh",
    },
    desc: {
      fr: "Accompagne l'alyah depuis l'Amérique du Nord et publie en anglais des guides très complets sur la vie en Israël (administrations, santé, emploi, professions réglementées), utiles à tout olé. Ligne d'aide post-alyah : *3680.",
      ru: "Сопровождает алию из Северной Америки и публикует на английском подробные путеводители по жизни в Израиле (госучреждения, медицина, работа, лицензируемые профессии), полезные любому репатрианту. Линия помощи после репатриации: *3680.",
      es: "Acompaña la aliá desde Norteamérica y publica en inglés guías muy completas sobre la vida en Israel (oficinas públicas, salud, empleo, profesiones reguladas), útiles para cualquier olé. Línea de ayuda post-aliá: *3680.",
      en: "Assists aliyah from North America and publishes detailed English guides to life in Israel — government offices, healthcare, employment, regulated professions — that are useful to any oleh. Post-aliyah helpline: *3680.",
    },
  },
  {
    id: "yad-lolim",
    org: "Yad L'Olim",
    hebrew: "יד לעולים",
    emoji: "🤲",
    kind: "association",
    url: {
      ru: "https://www.yadlolim.org/fsu-olim",
      en: "https://www.yadlolim.org/",
    },
    title: {
      fr: "Yad L'Olim",
      ru: "Яд ле-Олим (Yad L'Olim)",
      es: "Yad L'Olim",
      en: "Yad L'Olim",
    },
    desc: {
      fr: "Association qui propose aux olim une aide personnalisée face à l'administration, des guides sur leurs droits en plusieurs langues et un travail de plaidoyer auprès des ministères.",
      ru: "Некоммерческая организация: персональная помощь репатриантам в бюрократических вопросах, справочники о правах на нескольких языках и отстаивание интересов репатриантов в госучреждениях. Есть русско- и украиноязычная команда.",
      es: "Asociación que ofrece a los olim ayuda personalizada con la burocracia, guías sobre sus derechos en varios idiomas y defensa de sus intereses ante los organismos públicos.",
      en: "Non-profit offering olim personal help with bureaucracy, guides to their rights in several languages and advocacy with government offices.",
    },
  },

  // ----- Community organisations per language world -----
  {
    id: "qualita",
    org: "Qualita",
    emoji: "🇫🇷",
    kind: "association",
    url: "https://www.qualita.org.il/",
    worlds: ["fr"],
    title: {
      fr: "Qualita – olim francophones",
      ru: "Qualita — для франкоязычных репатриантов",
      es: "Qualita – olim francófonos",
      en: "Qualita – French-speaking olim",
    },
    desc: {
      fr: "L'organisation faîtière des olim francophones : ligne d'aide Allo Alyah, Hub de l'emploi, centre des droits et actions auprès des pouvoirs publics pour la reconnaissance des diplômes et l'intégration.",
      ru: "Зонтичная организация франкоязычных репатриантов: линия помощи Allo Alyah, центр трудоустройства, центр по правам и лоббирование вопросов признания дипломов и интеграции.",
      es: "La organización paraguas de los olim francófonos: línea de ayuda Allo Alyah, centro de empleo, centro de derechos y gestiones ante las autoridades para el reconocimiento de títulos y la integración.",
      en: "The umbrella organisation for French-speaking olim: Allo Alyah helpline, employment hub, rights centre and advocacy on diploma recognition and integration.",
    },
  },
  {
    id: "aaci",
    org: "AACI – Association of Americans & Canadians in Israel",
    emoji: "🗽",
    kind: "association",
    url: "https://aaci.org.il/",
    worlds: ["en"],
    title: {
      fr: "AACI – olim anglophones",
      ru: "AACI — для англоязычных репатриантов",
      es: "AACI – olim angloparlantes",
      en: "AACI – English-speaking olim",
    },
    desc: {
      fr: "Association of Americans & Canadians in Israel : organisation communautaire de longue date qui propose aux anglophones des conseils sur l'alyah et la klita, des projets communautaires et des guides pratiques.",
      ru: "Ассоциация американцев и канадцев в Израиле: давно работающая общинная организация — консультации для англоязычных по вопросам алии и абсорбции, общинные проекты и практические справочники.",
      es: "Association of Americans & Canadians in Israel: organización comunitaria de larga trayectoria que ofrece a los angloparlantes asesoramiento sobre aliá y klitá, proyectos comunitarios y guías prácticas.",
      en: "Association of Americans & Canadians in Israel: a long-established community organisation offering English speakers counselling on aliyah and klita questions, community projects and practical guides.",
    },
  },
  {
    id: "telfed",
    org: "Telfed – South African Zionist Federation (Israel)",
    emoji: "🌍",
    kind: "association",
    url: "https://www.telfed.org.il/",
    worlds: ["en"],
    title: {
      fr: "Telfed – olim d'Afrique australe et d'Australie",
      ru: "Telfed — репатрианты из Южной Африки и Австралии",
      es: "Telfed – olim de África austral y Australia",
      en: "Telfed – Southern African & Australian olim",
    },
    desc: {
      fr: "Accompagne après leur arrivée les olim d'Afrique australe, d'Australie et de Nouvelle-Zélande : conseils de klita, aide administrative et prise de rendez-vous, réseau communautaire, logements et bourses d'études.",
      ru: "Поддерживает после приезда репатриантов из Южной Африки, Австралии и Новой Зеландии: консультации по абсорбции, помощь с бюрократией и записью в учреждения, общинная сеть, жильё и стипендии студентам.",
      es: "Acompaña tras la llegada a los olim de África austral, Australia y Nueva Zelanda: asesoramiento de klitá, ayuda con la burocracia y las citas, red comunitaria, vivienda y becas de estudio.",
      en: "Supports olim from Southern Africa, Australia and New Zealand after arrival: klita advice, help with bureaucracy and appointments, a community network, housing and student scholarships.",
    },
  },
  {
    id: "olei",
    org: "OLEI – Organización Latinoamericana, España y Portugal en Israel",
    emoji: "🌎",
    kind: "association",
    url: "https://olei.org.il/",
    worlds: ["es"],
    title: {
      fr: "OLEI – olim d'Amérique latine, d'Espagne et du Portugal",
      ru: "OLEI — репатрианты из Латинской Америки, Испании и Португалии",
      es: "OLEI – olim de Latinoamérica, España y Portugal",
      en: "OLEI – Latin American, Spanish & Portuguese olim",
    },
    desc: {
      fr: "L'organisation des olim d'Amérique latine, d'Espagne et du Portugal : orientation sur les démarches et les droits, soutien à la recherche d'emploi, activités communautaires et antennes dans de nombreuses villes.",
      ru: "Организация репатриантов из Латинской Америки, Испании и Португалии: помощь в оформлении документов и разъяснение прав, поддержка в поиске работы, общинные мероприятия и отделения во многих городах.",
      es: "La organización de los olim de Latinoamérica, España y Portugal: orientación sobre trámites y derechos, apoyo en la búsqueda de empleo, actividades comunitarias y filiales en numerosas ciudades del país.",
      en: "The organisation of olim from Latin America, Spain and Portugal: guidance on procedures and rights, job-search support, community activities and local branches in many cities.",
    },
  },
  {
    id: "shishi-shabbat",
    org: "Shishi Shabbat Yisraeli",
    hebrew: "שישי שבת ישראלי",
    emoji: "🕯️",
    kind: "association",
    url: "https://shishi.co.il/",
    worlds: ["ru"],
    title: {
      fr: "Shishi Shabbat Yisraeli",
      ru: "«Шиши Шабат Исраэли»",
      es: "Shishi Shabbat Yisraeli",
      en: "Shishi Shabbat Yisraeli",
    },
    desc: {
      fr: "Communauté nationale de jeunes Israéliens russophones (18-35 ans) : séminaires de week-end, fêtes, excursions et projets de bénévolat, une bonne façon de se créer un cercle social après l'alyah.",
      ru: "Общеизраильское сообщество русскоязычной молодёжи 18–35 лет: семинары выходного дня, праздники, экскурсии и волонтёрские проекты — хороший способ найти свой круг общения после репатриации.",
      es: "Comunidad nacional de jóvenes israelíes rusoparlantes (18-35 años): seminarios de fin de semana, celebraciones, excursiones y proyectos de voluntariado; una buena forma de crear un círculo social tras la aliá.",
      en: "Nationwide community for Russian-speaking Israelis aged 18–35: weekend seminars, holiday events, trips and volunteer projects — a good way to build a social circle after aliyah.",
    },
  },

  // ----- Students -----
  {
    id: "student-authority",
    org: "Student Authority (Minhal HaStudentim) – Ministry of Aliyah and Integration",
    hebrew: "מינהל הסטודנטים",
    emoji: "🎓",
    kind: "government",
    url: {
      fr: "https://www.gov.il/fr/departments/units/students_authority_maya",
      ru: "https://www.gov.il/ru/departments/Units/students_authority_maya",
      es: "https://www.gov.il/es/service/apply-online-for-a-scholarship-from-the-student-authority",
      en: "https://www.gov.il/en/departments/Units/students_authority_maya",
    },
    phone: "*2994",
    profiles: ["student"],
    title: {
      fr: "Minhal HaStudentim (Administration des étudiants)",
      ru: "Управление по делам студентов-репатриантов",
      es: "Minhal HaStudentim (Autoridad de Estudiantes)",
      en: "Student Authority (Minhal HaStudentim)",
    },
    desc: {
      fr: "Conseil, programmes préparatoires et aide aux frais de scolarité pour les étudiants olim dans les établissements reconnus. L'aide n'est pas automatique : il faut ouvrir un dossier et déposer une demande en ligne pour chaque année universitaire.",
      ru: "Консультации, подготовительные программы и помощь в оплате обучения для студентов-репатриантов в признанных вузах. Помощь не назначается автоматически: нужно открыть дело и подавать онлайн-просьбу на каждый учебный год.",
      es: "Asesoramiento, programas preparatorios y ayuda para la matrícula de los estudiantes olim en instituciones reconocidas. La ayuda no es automática: hay que abrir un expediente y solicitarla en línea cada año académico.",
      en: "Counselling, preparatory programmes and tuition assistance for olim students at recognised institutions. Assistance is not automatic: you open a file and apply online for each academic year.",
    },
  },

  // ----- Entrepreneurs -----
  {
    id: "moia-business",
    org: "Business Information Center for Olim (Ministry of Aliyah and Integration)",
    emoji: "💡",
    kind: "government",
    url: {
      fr: "https://www.gov.il/fr/service/new-immigrants-returning-residents-business-info-center",
      ru: "https://www.gov.il/ru/service/new-immigrants-returning-residents-business-info-center",
      es: "https://www.gov.il/es/departments/topics/new_immigrants_business_and_entrepreneurship",
      en: "https://www.gov.il/en/service/new-immigrants-returning-residents-business-info-center",
    },
    profiles: ["entrepreneur"],
    title: {
      fr: "Centre d'information économique pour olim",
      ru: "Центр информации по бизнесу для репатриантов",
      es: "Centro de información de negocios para olim",
      en: "Business information centre for olim",
    },
    desc: {
      fr: "Le service d'entrepreneuriat du ministère de l'Alyah et de l'Intégration : accompagnement gratuit sur la création et la gestion d'une activité, la fiscalité, la banque et le financement, en hébreu, anglais, russe, français et espagnol. Consultez les conditions d'éligibilité sur la page.",
      ru: "Служба поддержки предпринимательства Министерства алии и интеграции: бесплатные консультации по открытию и ведению бизнеса, налогам, банкам и финансированию — на иврите, английском, русском, французском и испанском. Условия получения услуги смотрите на странице.",
      es: "El servicio de emprendimiento del Ministerio de Aliá y de Integración: asesoramiento gratuito para abrir y gestionar un negocio, impuestos, banca y financiación, en hebreo, inglés, ruso, francés y español. Consulta en la página las condiciones de elegibilidad.",
      en: "The Ministry of Aliyah and Integration's entrepreneurship service: free guidance on opening and running a business, taxation, banking and financing, in Hebrew, English, Russian, French and Spanish. Check the eligibility conditions on the page.",
    },
  },
  {
    id: "sba-maof",
    org: "Small and Medium Business Agency – MAOF",
    hebrew: "הסוכנות לעסקים קטנים ובינוניים – מעוף",
    emoji: "🏪",
    kind: "government",
    url: "https://www.sba.org.il/hb/Pages/default.aspx",
    profiles: ["entrepreneur"],
    title: {
      fr: "MAOF – Agence des petites et moyennes entreprises",
      ru: "МАОФ — Агентство малого и среднего бизнеса",
      es: "MAOF – Agencia para Pequeñas y Medianas Empresas",
      en: "MAOF – Small and Medium Business Agency",
    },
    desc: {
      fr: "Agence du ministère de l'Économie et de l'Industrie dont les centres MAOF, répartis dans tout le pays, proposent aux entrepreneurs et aux petites entreprises du conseil subventionné, des formations et une aide au financement. Site en hébreu.",
      ru: "Агентство при Министерстве экономики и промышленности; его центры МАОФ по всей стране предлагают предпринимателям и малому бизнесу субсидируемые консультации, курсы и помощь с финансированием. Сайт на иврите.",
      es: "Agencia del Ministerio de Economía e Industria cuyos centros MAOF, repartidos por todo el país, ofrecen a emprendedores y pequeñas empresas consultoría subvencionada, cursos y ayuda para la financiación. Sitio en hebreo.",
      en: "Ministry of Economy and Industry agency whose MAOF centres around the country offer entrepreneurs and small businesses subsidised consulting, courses and help with financing. Site in Hebrew.",
    },
  },

  // ----- Employees -----
  {
    id: "employment-service",
    org: "Israeli Employment Service (Sherut HaTaasuka)",
    hebrew: "שירות התעסוקה הישראלי",
    emoji: "💼",
    kind: "government",
    url: "https://www.gov.il/en/service/register_to_employment_services",
    profiles: ["employee"],
    title: {
      fr: "Service de l'emploi (Sherout HaTaassouka)",
      ru: "Служба трудоустройства (Шерут ха-Таасука)",
      es: "Servicio de Empleo (Sherut HaTaasuká)",
      en: "Employment Service (Sherut HaTaasuka)",
    },
    desc: {
      fr: "Le service public de placement : inscription comme demandeur d'emploi, dépôt de CV et recherche d'offres. L'inscription est aussi indispensable pour demander l'allocation chômage au Bitouah Léoumi.",
      ru: "Государственная служба занятости: регистрация в качестве ищущего работу, размещение резюме и поиск вакансий. Регистрация также обязательна для получения пособия по безработице от Битуах Леуми.",
      es: "El servicio público de colocación: inscripción como demandante de empleo, carga del currículum y búsqueda de vacantes. La inscripción también es necesaria para solicitar la prestación por desempleo al Bituaj Leumí.",
      en: "The state job-placement service: register as a job seeker, upload your CV and search vacancies. Registering is also required in order to claim unemployment benefit from Bituach Leumi.",
    },
  },
  {
    id: "moia-employment",
    org: "Employment Division – Ministry of Aliyah and Integration",
    emoji: "🧭",
    kind: "government",
    url: {
      ru: "https://www.gov.il/ru/departments/units/employment_maya",
      es: "https://www.gov.il/es/departments/units/employment_maya",
      en: "https://www.gov.il/en/departments/units/employment_maya",
    },
    profiles: ["employee"],
    title: {
      fr: "Services d'emploi pour olim",
      ru: "Трудоустройство репатриантов",
      es: "Servicios de empleo para olim",
      en: "Employment services for olim",
    },
    desc: {
      fr: "Conseil en orientation, centres d'emploi, hébreu professionnel et formations de reconversion, ainsi que le programme de vouchers qui aide à financer une formation professionnelle. L'éligibilité dépend de votre statut et du temps écoulé depuis votre alyah.",
      ru: "Профориентация, центры трудоустройства, профессиональный иврит и курсы переквалификации, а также программа ваучеров, помогающая оплатить профессиональное обучение. Право на помощь зависит от вашего статуса и времени, прошедшего с репатриации.",
      es: "Orientación profesional, centros de empleo, hebreo profesional y cursos de reconversión, además del programa de vouchers que ayuda a pagar la formación profesional. La elegibilidad depende de tu estatus y del tiempo transcurrido desde tu aliá.",
      en: "Career counselling, employment centres, professional Hebrew and retraining courses, and the voucher programme that helps pay for professional training. Eligibility depends on your status and on the time since your aliyah.",
    },
  },
  {
    id: "labor-rights",
    org: "Ministry of Labor",
    hebrew: "משרד העבודה",
    emoji: "👷",
    kind: "government",
    url: "https://www.gov.il/en/departments/labor",
    profiles: ["employee"],
    title: {
      fr: "Ministère du Travail – droits des salariés",
      ru: "Министерство труда — права работников",
      es: "Ministerio de Trabajo – derechos laborales",
      en: "Ministry of Labor – workers' rights",
    },
    desc: {
      fr: "Informations officielles sur le droit du travail (salaires, retraite, indemnités de licenciement, congés) et administration de contrôle auprès de laquelle déposer plainte si un employeur ne respecte pas vos droits.",
      ru: "Официальная информация о трудовом законодательстве (зарплата, пенсия, выходное пособие, отпуска) и управление по надзору, куда можно подать жалобу, если работодатель нарушает ваши права.",
      es: "Información oficial sobre la legislación laboral (salarios, pensión, indemnización por despido, vacaciones) y la administración de fiscalización, ante la que puedes presentar una queja si un empleador vulnera tus derechos.",
      en: "Official information on employment law — wages, pension, severance pay, leave — and the enforcement administration, where you can file a complaint if an employer violates your rights.",
    },
  },
  {
    id: "kav-laoved",
    org: "Kav LaOved – Worker's Hotline",
    hebrew: "קו לעובד",
    emoji: "🤝",
    kind: "association",
    url: "https://kavlaoved.org.il/en/",
    profiles: ["employee"],
    title: {
      fr: "Kav LaOved – défense des salariés",
      ru: "«Кав ла-Овед» — защита прав работников",
      es: "Kav LaOved – defensa de los trabajadores",
      en: "Kav LaOved – Worker's Hotline",
    },
    desc: {
      fr: "Association qui aide les travailleurs en Israël à faire valoir leurs droits : assistance individuelle et fiches d'information sur les droits dans de nombreuses langues, dont le russe et l'espagnol.",
      ru: "Некоммерческая организация, помогающая работникам в Израиле отстаивать свои права: индивидуальная помощь и памятки о правах на многих языках, в том числе на русском.",
      es: "Asociación que ayuda a los trabajadores en Israel a hacer valer sus derechos: asistencia individual y folletos sobre derechos laborales en muchos idiomas, entre ellos el español y el ruso.",
      en: "Non-profit that helps workers in Israel enforce their rights: individual assistance and know-your-rights leaflets in many languages, including Russian and Spanish.",
    },
  },
  {
    id: "gvahim",
    org: "Gvahim",
    hebrew: "גבהים",
    emoji: "📈",
    kind: "association",
    url: "https://gvahim.org.il/",
    profiles: ["employee"],
    title: {
      fr: "Gvahim – carrière des olim",
      ru: "Gvahim — карьера для репатриантов",
      es: "Gvahim – carrera profesional para olim",
      en: "Gvahim – careers for olim",
    },
    desc: {
      fr: "Association qui aide les olim qualifiés à construire leur carrière en Israël : programmes de carrière, accompagnement individuel par des spécialistes, ateliers et réseau professionnel.",
      ru: "Некоммерческая организация, помогающая квалифицированным репатриантам строить карьеру в Израиле: карьерные программы, индивидуальные консультации специалистов, семинары и профессиональное сообщество.",
      es: "Asociación que ayuda a los olim cualificados a desarrollar su carrera en Israel: programas de carrera, asesoría individual con especialistas, talleres y una red profesional.",
      en: "Non-profit that helps qualified olim build a career in Israel: career programmes, one-on-one consulting with career specialists, workshops and a professional network.",
    },
  },

  // ----- Medical professions -----
  {
    id: "moh-licensing",
    org: "Ministry of Health – Medical Professions Licensing",
    hebrew: "משרד הבריאות",
    emoji: "🩺",
    kind: "government",
    url: "https://www.gov.il/en/departments/topics/medical-professions-licensing/govil-landing-page",
    phone: "*5400",
    profiles: ["medical"],
    title: {
      fr: "Ministère de la Santé – licences professionnelles",
      ru: "Минздрав — лицензирование медработников",
      es: "Ministerio de Salud – licencias profesionales",
      en: "Ministry of Health – professional licensing",
    },
    desc: {
      fr: "L'autorité qui reconnaît les qualifications étrangères et délivre les licences des médecins, dentistes, infirmiers, pharmaciens et autres professions de santé : exigences, formulaires, examens et parcours pour les diplômés de l'étranger. Ligne d'information générale : *5400.",
      ru: "Ведомство, которое признаёт зарубежные квалификации и выдаёт лицензии врачам, стоматологам, медсёстрам и медбратьям, фармацевтам и другим медработникам: требования, бланки, экзамены и порядок для выпускников зарубежных вузов. Общая справочная линия: *5400.",
      es: "La autoridad que reconoce las titulaciones extranjeras y otorga las licencias de médicos, odontólogos, enfermeros, farmacéuticos y otras profesiones sanitarias: requisitos, formularios, exámenes y vías para titulados en el extranjero. Línea de información general: *5400.",
      en: "The authority that recognises foreign qualifications and issues licences for physicians, dentists, nurses, pharmacists and other health professions: requirements, forms, exams and tracks for graduates from abroad. General hotline: *5400.",
    },
  },
  {
    id: "moia-medical",
    org: "Physicians and Medical Professions Administration (Ministry of Aliyah and Integration)",
    emoji: "⚕️",
    kind: "government",
    url: "https://www.gov.il/en/departments/units/physicians-and-other-medical-professions-directorate",
    profiles: ["medical"],
    title: {
      fr: "Accompagnement des olim du secteur médical",
      ru: "Сопровождение врачей-репатриантов",
      es: "Acompañamiento a olim de profesiones médicas",
      en: "Support for olim in medical professions",
    },
    desc: {
      fr: "Unité du ministère de l'Alyah et de l'Intégration qui accompagne les médecins et autres professionnels de santé olim : licence et reconnaissance de spécialité, hébreu professionnel, placement à l'hôpital et en médecine de ville.",
      ru: "Подразделение Министерства алии и интеграции, которое сопровождает врачей и других медработников-репатриантов: лицензирование и признание специализации, профессиональный иврит, трудоустройство в больницах и поликлиниках.",
      es: "Unidad del Ministerio de Aliá y de Integración que acompaña a los médicos y demás profesionales sanitarios olim en la obtención de la licencia y el reconocimiento de la especialidad, el hebreo profesional y la inserción en hospitales y clínicas comunitarias.",
      en: "Ministry of Aliyah and Integration unit that accompanies olim physicians and other health professionals through licensing and specialty recognition, professional Hebrew and placement in hospitals and community clinics.",
    },
  },
  {
    id: "ima",
    org: "Israel Medical Association – Scientific Council",
    hebrew: "ההסתדרות הרפואית בישראל",
    emoji: "🔬",
    kind: "association",
    url: "https://www.ima.org.il/",
    profiles: ["medical"],
    title: {
      fr: "IMA – reconnaissance des spécialités",
      ru: "IMA — признание врачебной специализации",
      es: "IMA – reconocimiento de especialidades",
      en: "IMA – specialty recognition",
    },
    desc: {
      fr: "Le Conseil scientifique de l'Association médicale d'Israël traite la reconnaissance des spécialités médicales acquises à l'étranger : une procédure distincte de la licence du ministère de la Santé, engagée une fois la licence israélienne obtenue.",
      ru: "Научный совет Израильской медицинской ассоциации занимается признанием врачебных специализаций, полученных за рубежом. Это отдельная от лицензии Минздрава процедура, которую начинают после получения израильской лицензии.",
      es: "El Consejo Científico de la Asociación Médica de Israel gestiona el reconocimiento de las especialidades médicas obtenidas en el extranjero: un trámite distinto de la licencia del Ministerio de Salud, que se inicia una vez obtenida la licencia israelí.",
      en: "The Scientific Council of the Israel Medical Association handles recognition of medical specialties obtained abroad — a separate process from the Ministry of Health licence, started once you hold an Israeli licence.",
    },
  },

  // ----- Legal professions -----
  {
    id: "israel-bar",
    org: "Israel Bar Association",
    hebrew: "לשכת עורכי הדין בישראל",
    emoji: "⚖️",
    kind: "association",
    url: "https://www.israelbar.org.il/",
    profiles: ["legal"],
    title: {
      fr: "Barreau d'Israël",
      ru: "Коллегия адвокатов Израиля",
      es: "Colegio de Abogados de Israel",
      en: "Israel Bar Association",
    },
    desc: {
      fr: "Gère le parcours d'accès à la profession d'avocat israélien pour les juristes formés à l'étranger (examen d'hébreu, examens de droit israélien, stage et examens finaux), ainsi que l'enregistrement distinct des avocats étrangers exerçant en droit étranger. Site essentiellement en hébreu.",
      ru: "Ведёт процедуру получения израильской адвокатской лицензии для юристов с зарубежным образованием (экзамен по ивриту, экзамены по израильскому праву, стажировка и итоговые экзамены), а также отдельную регистрацию иностранных адвокатов, консультирующих по иностранному праву. Сайт в основном на иврите.",
      es: "Gestiona el camino hacia la licencia de abogado israelí para juristas formados en el extranjero (examen de hebreo, exámenes de derecho israelí, pasantía y exámenes finales), así como el registro independiente de abogados extranjeros que asesoran en derecho extranjero. El sitio está mayormente en hebreo.",
      en: "Runs the path to an Israeli lawyer's licence for foreign-trained lawyers — Hebrew exam, exams on Israeli law, internship and final exams — as well as the separate registration of foreign lawyers who advise on foreign law. Most of the site is in Hebrew.",
    },
  },

  // ----- Regulated professions: exam preparation -----
  {
    id: "licensing-courses",
    org: "Preparatory Courses for Licensing Exams (Ministry of Aliyah and Integration)",
    emoji: "📝",
    kind: "government",
    url: "https://www.gov.il/en/departments/general/employment_courses",
    profiles: ["medical", "legal"],
    title: {
      fr: "Cours de préparation aux examens de licence",
      ru: "Курсы подготовки к лицензионным экзаменам",
      es: "Cursos de preparación a exámenes de licencia",
      en: "Licensing-exam preparation courses",
    },
    desc: {
      fr: "Le ministère de l'Alyah et de l'Intégration organise et contribue à financer des cours de préparation aux examens de licence de certaines professions réglementées (médecine, soins infirmiers, pharmacie, droit, etc.). Vérifiez quels cours sont ouverts et si vous y avez droit.",
      ru: "Министерство алии и интеграции организует и помогает оплачивать курсы подготовки к лицензионным экзаменам по ряду регулируемых профессий — например, для врачей, медсестёр, фармацевтов и юристов. Уточните, какие курсы сейчас открыты и положены ли они вам.",
      es: "El Ministerio de Aliá y de Integración organiza y ayuda a financiar cursos de preparación para los exámenes de licencia de algunas profesiones reguladas, como medicina, enfermería, farmacia y derecho. Comprueba qué cursos están abiertos y si cumples los requisitos.",
      en: "The Ministry of Aliyah and Integration organises and helps fund preparation courses for licensing exams in certain regulated professions, such as medicine, nursing, pharmacy and law. Check which courses are open and whether you qualify.",
    },
  },
];

// ---------------------------------------------------------------------------
// Guides
// ---------------------------------------------------------------------------

export const GUIDES: ProfileGuide[] = [
  // ===== Everyone =====
  {
    profile: "all",
    emoji: "🧳",
    title: {
      fr: "Premiers pas pour tous les olim",
      ru: "Первые шаги для всех репатриантов",
      es: "Primeros pasos para todos los olim",
      en: "First steps for every oleh",
    },
    intro: {
      fr: "L'essentiel à régler durant vos premières semaines et vos premiers mois en Israël, dans l'ordre suivi par la plupart des olim. Les conditions exactes dépendent de votre statut et de votre date d'alyah : confirmez toujours auprès de l'organisme officiel.",
      ru: "Главное, что нужно сделать в первые недели и месяцы в Израиле, — в том порядке, в каком это обычно делают репатрианты. Точные условия зависят от вашего статуса и даты репатриации, поэтому всегда сверяйтесь с официальным ведомством.",
      es: "Lo esencial que hay que resolver en las primeras semanas y meses en Israel, en el orden que sigue la mayoría de los olim. Las condiciones exactas dependen de tu estatus y de tu fecha de aliá: confírmalas siempre con el organismo oficial.",
      en: "The essentials to sort out in your first weeks and months in Israel, in the order most olim tackle them. Exact conditions depend on your status and aliyah date, so always confirm with the official body.",
    },
    steps: [
      {
        title: {
          fr: "Téoudat olé et téoudat zéout",
          ru: "Теудат оле и теудат зеут",
          es: "Teudat olé y teudat zehut",
          en: "Teudat oleh and teudat zehut",
        },
        desc: {
          fr: "La téoudat olé (certificat d'immigrant) est délivrée par le ministère de l'Alyah et de l'Intégration, généralement dès l'arrivée à l'aéroport, et atteste de vos droits. La téoudat zéout (carte d'identité) relève de l'Autorité de la population et de l'immigration : si vous n'avez reçu qu'un document provisoire, ou rien du tout, prenez rendez-vous pour obtenir la carte biométrique définitive.",
          ru: "Теудат оле (удостоверение репатрианта) выдаёт Министерство алии и интеграции, обычно сразу по прилёте в аэропорту; оно подтверждает ваше право на льготы. Теудат зеут (удостоверение личности) оформляет Управление народонаселения и иммиграции: если вам выдали только временный документ или не выдали ничего, запишитесь на приём, чтобы получить постоянное биометрическое удостоверение.",
          es: "La teudat olé (certificado de inmigrante) la emite el Ministerio de Aliá y de Integración, normalmente al llegar al aeropuerto, y acredita tus derechos. La teudat zehut (documento de identidad) depende de la Autoridad de Población e Inmigración: si solo recibiste un documento provisional, o ninguno, pide cita para obtener la tarjeta biométrica definitiva.",
          en: "Your teudat oleh (immigrant certificate) is issued by the Ministry of Aliyah and Integration, usually on arrival at the airport, and proves your entitlement to benefits. Your teudat zehut (ID card) comes from the Population and Immigration Authority: if you were given only a temporary document, or none at all, book an appointment to get the permanent biometric card.",
        },
        links: ["moia", "piba"],
      },
      {
        title: {
          fr: "Ouvrir un compte bancaire",
          ru: "Откройте банковский счёт",
          es: "Abre una cuenta bancaria",
          en: "Open a bank account",
        },
        desc: {
          fr: "Ouvrez un compte dans la banque de votre choix dès que possible, muni de votre téoudat olé et de vos pièces d'identité, et activez-le par un premier dépôt. Transmettez ensuite vos coordonnées bancaires au ministère de l'Alyah et de l'Intégration : sans elles, le sal klita ne peut pas être versé. Comparez les frais bancaires avant de choisir.",
          ru: "Как можно скорее откройте счёт в выбранном банке, взяв с собой теудат оле и удостоверяющие личность документы, и активируйте его первым взносом. Затем сообщите данные счёта в Министерство алии и интеграции — без них корзину абсорбции перевести не смогут. Перед выбором банка сравните комиссии.",
          es: "Abre una cuenta en el banco que prefieras lo antes posible, con tu teudat olé y tus documentos de identidad, y actívala con un primer depósito. Después comunica los datos de la cuenta al Ministerio de Aliá y de Integración: sin ellos no se pueden transferir los pagos del sal klitá. Compara las comisiones antes de elegir banco.",
          en: "Open an account at the bank of your choice as soon as possible, bringing your teudat oleh and identity documents, and activate it with a first deposit. Then give the account details to the Ministry of Aliyah and Integration — without them your sal klita payments cannot be transferred. Compare fees between banks before you choose.",
        },
        links: ["moia", "moia-personal-area"],
      },
      {
        title: {
          fr: "S'inscrire à une koupat holim",
          ru: "Запишитесь в больничную кассу (купат холим)",
          es: "Inscríbete en una kupat jolim",
          en: "Join a kupat holim",
        },
        desc: {
          fr: "L'assurance maladie est obligatoire et vous choisissez l'une des quatre koupot holim : Clalit, Maccabi, Meuhedet ou Leumit. L'inscription se fait à l'aéroport, dans un bureau de poste ou en ligne via le Bitouah Léoumi ; rendez-vous ensuite dans une agence de votre koupa pour recevoir votre carte d'adhérent et choisir un médecin de famille.",
          ru: "Медицинское страхование обязательно, и вы сами выбираете одну из четырёх больничных касс (купот холим): «Клалит», «Маккаби», «Меухедет» или «Леумит». Записаться можно в аэропорту, в почтовом отделении или онлайн через Битуах Леуми; затем зайдите в отделение своей кассы, чтобы получить карточку и выбрать семейного врача.",
          es: "El seguro de salud es obligatorio y tú eliges una de las cuatro kupot jolim: Clalit, Maccabi, Meuhedet o Leumit. La inscripción se hace en el aeropuerto, en una oficina de correos o en línea a través del Bituaj Leumí; después acude a una sucursal de tu kupá para recibir la tarjeta de afiliado y elegir médico de familia.",
          en: "Health insurance is compulsory and you choose one of the four kupot holim: Clalit, Maccabi, Meuhedet or Leumit. You register at the airport, at a post office or online via Bituach Leumi; afterwards go to a branch of your kupah to get your membership card and choose a family doctor.",
        },
        links: ["kupat-holim", "bituach-leumi"],
      },
      {
        title: {
          fr: "Rencontrer son conseiller d'intégration et activer le sal klita",
          ru: "Встретьтесь с консультантом по интеграции и оформите саль клита",
          es: "Reúnete con tu asesor de integración y activa el sal klitá",
          en: "Meet your absorption counsellor and set up sal klita",
        },
        desc: {
          fr: "Prenez rendez-vous à l'antenne du ministère de l'Alyah et de l'Intégration la plus proche (en ligne, dans l'application ou au *2994). Votre conseiller personnel (yoetz klita) met en place votre sal klita, l'aide financière des premiers temps après l'alyah, et vous explique vos autres droits éventuels : aide au loyer, oulpan, services d'emploi.",
          ru: "Запишитесь на приём в ближайшее отделение Министерства алии и интеграции (онлайн, через приложение или по номеру *2994). Личный консультант (йоэц клита) оформит вам корзину абсорбции (саль клита) — финансовую помощь на первое время после репатриации — и объяснит, на что ещё вы можете претендовать: помощь на аренду жилья, ульпан, услуги по трудоустройству.",
          es: "Pide cita en la sucursal del Ministerio de Aliá y de Integración más cercana (en línea, en la aplicación o en el *2994). Tu asesor personal (yoetz klitá) pone en marcha tu sal klitá —la ayuda económica del primer período tras la aliá— y te explica a qué más puedes tener derecho: ayuda al alquiler, ulpán, servicios de empleo.",
          en: "Book an appointment at your nearest Ministry of Aliyah and Integration branch (online, in the app or via *2994). Your personal counsellor (yoetz klita) sets up your sal klita — the financial assistance for the first period after aliyah — and explains what else you may be entitled to: rent assistance, ulpan, employment services.",
        },
        links: ["moia", "moia-personal-area"],
      },
      {
        title: {
          fr: "S'inscrire à l'oulpan",
          ru: "Запишитесь в ульпан",
          es: "Inscríbete en el ulpán",
          en: "Enrol in ulpan",
        },
        desc: {
          fr: "Demandez à votre conseiller une orientation vers un oulpan public près de chez vous et commencez le plus tôt possible : votre droit à des cours d'hébreu subventionnés est limité dans le temps. Si l'oulpan classique ne convient pas à votre emploi du temps, renseignez-vous sur les cours du soir, les bons pour des cours privés ou l'oulpan professionnel.",
          ru: "Попросите консультанта направить вас в государственный ульпан рядом с домом и начинайте как можно раньше: право на субсидируемое изучение иврита ограничено по времени. Если обычный ульпан не подходит по графику, спросите о вечерних группах, ваучерах на частные курсы или профессиональном ульпане.",
          es: "Pide a tu asesor la derivación a un ulpán público cerca de tu casa y empieza cuanto antes: el derecho a estudiar hebreo con subvención tiene un plazo limitado. Si el ulpán habitual no encaja con tus horarios, pregunta por las clases vespertinas, los cupones para cursos privados o el ulpán profesional.",
          en: "Ask your counsellor for a referral to a state ulpan near you and start as early as you can — your entitlement to subsidised Hebrew studies is limited in time. If the standard ulpan does not fit your schedule, ask about evening classes, vouchers for private courses or professional ulpan.",
        },
        links: ["ulpan", "moia"],
      },
      {
        title: {
          fr: "Régulariser sa situation au Bitouah Léoumi",
          ru: "Уладьте дела с Битуах Леуми",
          es: "Pon en orden tu situación en el Bituaj Leumí",
          en: "Sort out Bituach Leumi",
        },
        desc: {
          fr: "En tant que résident, vous êtes assuré au Bitouah Léoumi et redevable des cotisations d'assurance nationale et d'assurance maladie ; les nouveaux olim sans revenus peuvent en être exonérés pendant une période initiale : vérifiez votre situation. Assurez-vous aussi que vos coordonnées bancaires sont enregistrées, pour percevoir par exemple les allocations familiales, et créez votre compte en ligne.",
          ru: "Как житель страны вы застрахованы в Битуах Леуми и обязаны платить взносы по национальному и медицинскому страхованию; новые репатрианты без дохода могут быть освобождены от них на начальный период — проверьте свой статус. Убедитесь также, что в Битуах Леуми есть ваши банковские реквизиты (например, для получения пособия на детей), и заведите личный кабинет на сайте.",
          es: "Como residente estás asegurado en el Bituaj Leumí y debes pagar las cotizaciones del seguro nacional y de salud; los nuevos olim sin ingresos pueden estar exentos durante un período inicial, así que comprueba tu situación. Asegúrate también de que tus datos bancarios estén registrados, por ejemplo para cobrar la asignación por hijos, y crea tu cuenta en línea.",
          en: "As a resident you are insured by Bituach Leumi and must pay national and health insurance contributions; new olim without income may be exempt for an initial period, so check your status. Also make sure your bank details are registered — for child allowance, for example — and create your online account.",
        },
        links: ["bituach-leumi"],
      },
      {
        title: {
          fr: "Convertir son permis de conduire",
          ru: "Обменяйте водительские права",
          es: "Canjea tu permiso de conducir",
          en: "Convert your driving licence",
        },
        desc: {
          fr: "Vous ne pouvez conduire avec un permis étranger valide que pendant une période limitée après votre arrivée. Lancez tôt la conversion auprès du ministère des Transports : les exigences (examen de la vue, formulaires, éventuellement examen de conduite) dépendent de l'ancienneté de votre permis.",
          ru: "Ездить по действующим иностранным правам можно лишь ограниченное время после приезда. Начните обмен прав в Министерстве транспорта заранее: требования (проверка зрения, бланки, иногда экзамен по вождению) зависят от вашего водительского стажа.",
          es: "Solo puedes conducir con un permiso extranjero válido durante un período limitado tras tu llegada. Inicia pronto el canje en el Ministerio de Transporte: los requisitos (examen de la vista, formularios y, en algunos casos, examen práctico) dependen de la antigüedad de tu permiso.",
          en: "You may drive on a valid foreign licence only for a limited period after arrival. Start the conversion with the Ministry of Transport early: the requirements (eye test, forms, possibly a driving test) depend on how long you have held your licence.",
        },
        links: ["driving-licence"],
      },
      {
        title: {
          fr: "Faire valoir ses autres droits et se faire aider",
          ru: "Оформите остальные льготы и не стесняйтесь просить о помощи",
          es: "Reclama tus demás derechos y pide ayuda",
          en: "Claim your other rights and ask for help",
        },
        desc: {
          fr: "Vérifiez votre éligibilité à la réduction d'arnona (taxe municipale) auprès de votre mairie, à l'aide au loyer et aux avantages fiscaux des olim : beaucoup doivent être demandés et expirent au bout d'un certain délai. Kol Zchut détaille chaque droit pas à pas, et les associations de votre communauté linguistique peuvent vous guider dans les démarches.",
          ru: "Проверьте, положены ли вам скидка на арнону (муниципальный налог) — в своём муниципалитете, помощь на аренду жилья и налоговые льготы для репатриантов: многие из них нужно оформлять самим, и они действуют ограниченный срок. Сайт «Коль Зхут» подробно описывает каждое право, а общественные организации вашей языковой общины помогут с документами.",
          es: "Comprueba si te corresponden el descuento de arnona (impuesto municipal) en tu municipalidad, la ayuda al alquiler y los beneficios fiscales para olim: muchos hay que solicitarlos y caducan pasado cierto plazo. Kol Zchut explica cada derecho paso a paso, y las organizaciones de tu comunidad lingüística pueden orientarte con los trámites.",
          en: "Check your eligibility for the arnona (municipal tax) discount at your municipality, for rent assistance and for olim tax benefits — many must be requested and expire after a set period. Kol Zchut explains each right step by step, and community organisations for your language can guide you through the paperwork.",
        },
        links: ["kol-zchut", "tax-authority", "yad-lolim"],
      },
    ],
  },

  // ===== Students =====
  {
    profile: "student",
    emoji: "🎓",
    title: {
      fr: "Étudiants",
      ru: "Студенты",
      es: "Estudiantes",
      en: "Students",
    },
    intro: {
      fr: "Vous comptez étudier en Israël après votre alyah ? Le Minhal HaStudentim est votre interlocuteur principal, mais l'admission et le financement ont chacun leurs conditions et leurs dates limites.",
      ru: "Собираетесь учиться в Израиле после репатриации? Ваш главный партнёр — Управление по делам студентов-репатриантов (Минхаль ха-студентим), но у поступления и у финансирования свои условия и сроки.",
      es: "¿Piensas estudiar en Israel después de la aliá? El Minhal HaStudentim es tu principal interlocutor, pero la admisión y la financiación tienen cada una sus condiciones y plazos.",
      en: "Planning to study in Israel after aliyah? The Student Authority (Minhal HaStudentim) is your main partner, but admission and funding each have their own conditions and deadlines.",
    },
    steps: [
      {
        title: {
          fr: "Contacter tôt le Minhal HaStudentim",
          ru: "Заранее свяжитесь с Управлением по делам студентов",
          es: "Contacta pronto con el Minhal HaStudentim",
          en: "Contact the Student Authority early",
        },
        desc: {
          fr: "Prenez contact avec le Minhal HaStudentim dès que possible, idéalement avant l'alyah, pour ouvrir un dossier et être conseillé sur les filières et sur votre éligibilité, qui dépend de votre âge, de votre statut et de la date de début de vos études.",
          ru: "Обратитесь в Управление по делам студентов-репатриантов как можно раньше, лучше ещё до репатриации: там откроют дело и расскажут о программах обучения и о вашем праве на помощь — оно зависит от возраста, статуса и срока начала учёбы.",
          es: "Ponte en contacto con el Minhal HaStudentim lo antes posible, idealmente antes de la aliá, para abrir un expediente y recibir orientación sobre las carreras y sobre tu elegibilidad, que depende de tu edad, tu estatus y la fecha en que empieces a estudiar.",
          en: "Get in touch with the Student Authority as soon as you can — ideally before aliyah — to open a file and get advice on study tracks and on your eligibility, which depends on your age, your status and when you start studying.",
        },
        links: ["student-authority"],
      },
      {
        title: {
          fr: "Choisir un établissement reconnu et vérifier les conditions d'admission",
          ru: "Выберите признанный вуз и узнайте условия приёма",
          es: "Elige una institución reconocida y revisa los requisitos de admisión",
          en: "Choose a recognised institution and check admission requirements",
        },
        desc: {
          fr: "Choisissez un cursus dans un établissement reconnu par le Conseil de l'enseignement supérieur. Chaque établissement fixe ses propres règles d'admission pour les titulaires de diplômes étrangers (reconnaissance du baccalauréat ou des études antérieures, examen psychométrique ou équivalent, niveau d'hébreu ou d'anglais) : demandez au bureau des admissions ce qu'il exige et sous quelle forme (copies certifiées, traductions).",
          ru: "Выбирайте программу в учебном заведении, признанном Советом по высшему образованию. Каждый вуз сам устанавливает правила приёма для обладателей зарубежных документов об образовании (признание аттестата или предыдущей учёбы, психометрический или аналогичный экзамен, уровень иврита или английского) — уточните в приёмной комиссии, что именно нужно и в каком виде (заверенные копии, переводы).",
          es: "Elige una carrera en una institución reconocida por el Consejo de Educación Superior. Cada institución fija sus propias reglas de admisión para quienes tienen títulos extranjeros (reconocimiento del bachillerato o de estudios previos, examen psicométrico o equivalente, nivel de hebreo o de inglés): pregunta en la oficina de admisiones qué exige y en qué formato (copias certificadas, traducciones).",
          en: "Pick a programme at an institution recognised by the Council for Higher Education. Each institution sets its own admission rules for holders of foreign diplomas — recognition of your school-leaving certificate or previous studies, a psychometric or equivalent exam, a Hebrew or English level — so ask its admissions office what it needs and in which form (certified copies, translations).",
        },
        links: ["student-authority"],
      },
      {
        title: {
          fr: "Préparer son hébreu : oulpan, mekhina, programmes préparatoires",
          ru: "Подтяните иврит: ульпан, мехина, подготовительные программы",
          es: "Prepara tu hebreo: ulpán, mejiná y programas preparatorios",
          en: "Prepare your Hebrew: ulpan, mechina, preparatory programmes",
        },
        desc: {
          fr: "La plupart des cursus sont enseignés en hébreu. Renseignez-vous auprès du Minhal HaStudentim sur l'oulpan pour étudiants et sur les programmes préparatoires pour olim (mekhina, TAKA), qui associent hébreu, anglais et matières académiques avant l'entrée en licence.",
          ru: "Большинство программ преподаётся на иврите. Узнайте в Управлении по делам студентов об ульпане для студентов и о подготовительных программах для репатриантов (мехина, ТАКА), которые сочетают иврит, английский и академические предметы перед началом учёбы на степень.",
          es: "La mayoría de las carreras se imparten en hebreo. Pregunta en el Minhal HaStudentim por el ulpán para estudiantes y por los programas preparatorios para olim (mejiná, TAKA), que combinan hebreo, inglés y materias académicas antes de empezar la carrera.",
          en: "Most degrees are taught in Hebrew. Ask the Student Authority about ulpan for students and the preparatory programmes for olim (mechina, TAKA) that combine Hebrew, English and academic subjects before the degree begins.",
        },
        links: ["student-authority", "ulpan"],
      },
      {
        title: {
          fr: "Demander l'aide aux frais de scolarité, chaque année",
          ru: "Подавайте просьбу о помощи в оплате учёбы — каждый год",
          es: "Solicita la ayuda para la matrícula, cada año",
          en: "Apply for tuition assistance — every year",
        },
        desc: {
          fr: "L'aide aux frais de scolarité se demande en ligne et doit être renouvelée pour chaque année universitaire avant la date limite publiée. Elle ne couvre les frais que jusqu'à un plafond défini, et l'aide complète peut être conditionnée à des heures de bénévolat : lisez les conditions avant de vous inscrire.",
          ru: "Просьба о помощи в оплате обучения подаётся онлайн, и её нужно подавать заново на каждый учебный год до объявленного срока. Помощь покрывает плату за обучение только в установленных пределах, а полная помощь может зависеть от участия в общественной (волонтёрской) работе — прочитайте условия до зачисления.",
          es: "La ayuda para la matrícula se solicita en línea y hay que renovarla cada año académico antes de la fecha límite publicada. Solo cubre la matrícula hasta un tope fijado, y la ayuda completa puede estar condicionada a horas de voluntariado comunitario: lee las condiciones antes de inscribirte.",
          en: "Tuition assistance is requested online and must be renewed for each academic year before the published deadline. It covers tuition only up to a set level, and full assistance can be conditional on community volunteering — read the conditions before you enrol.",
        },
        links: ["student-authority"],
      },
      {
        title: {
          fr: "Faire évaluer ses diplômes antérieurs si nécessaire",
          ru: "При необходимости подтвердите прежние дипломы",
          es: "Haz evaluar tus títulos anteriores si lo necesitas",
          en: "Have previous degrees evaluated if needed",
        },
        desc: {
          fr: "Pour l'admission à un diplôme supérieur, c'est l'université elle-même qui examine vos études antérieures. L'évaluation officielle d'un diplôme obtenu à l'étranger est une démarche distincte, surtout utile pour l'emploi et la grille salariale dans le secteur public.",
          ru: "При поступлении на следующую степень ваши прежние дипломы оценивает сам университет. Официальная оценка зарубежной степени — отдельная процедура; она нужна главным образом для работы в госсекторе и определения зарплатного разряда.",
          es: "Para acceder a un título superior, es la propia universidad la que valora tus estudios anteriores. La evaluación oficial de un título obtenido en el extranjero es un trámite aparte, necesario sobre todo para el empleo y la escala salarial en el sector público.",
          en: "For admission to a further degree, the university itself assesses your earlier studies. The official evaluation of a degree earned abroad is a separate procedure, mainly needed for public-sector employment and salary grading.",
        },
        links: ["degree-evaluation", "degree-evaluation-moe"],
      },
      {
        title: {
          fr: "Clarifier sa situation vis-à-vis de l'armée ou du service national",
          ru: "Выясните вопрос со службой в армии или национальной службой",
          es: "Aclara tu situación respecto al ejército o al servicio nacional",
          en: "Clarify army or national service",
        },
        desc: {
          fr: "Si vous êtes en âge d'être appelé, clarifiez vos obligations de service avant de commencer. Demandez au Minhal HaStudentim comment le service militaire ou national influe sur la période pendant laquelle vous pouvez utiliser vos droits d'étudiant.",
          ru: "Если вы призывного возраста, выясните свои обязанности по службе до начала учёбы. Спросите в Управлении по делам студентов, как армейская или национальная служба влияет на срок, в течение которого можно воспользоваться студенческими льготами.",
          es: "Si estás en edad de reclutamiento, aclara tus obligaciones de servicio antes de empezar. Pregunta en el Minhal HaStudentim cómo afecta el servicio militar o nacional al período en el que puedes usar tus beneficios de estudiante.",
          en: "If you are of conscription age, clarify your service obligations before you start. Ask the Student Authority how military or national service affects the period during which you can use your study benefits.",
        },
        links: ["student-authority", "moia"],
      },
      {
        title: {
          fr: "Organiser sa vie étudiante : logement, travail, assurances",
          ru: "Наладьте студенческий быт: жильё, работа, страхование",
          es: "Organiza tu vida de estudiante: vivienda, trabajo y seguros",
          en: "Organise student life: housing, work, insurance",
        },
        desc: {
          fr: "Renseignez-vous auprès de votre établissement sur les résidences universitaires et les bourses, et vérifiez auprès du Bitouah Léoumi quelles cotisations s'appliquent à votre situation d'étudiant. Si vous travaillez en parallèle, vous avez les mêmes droits de base que tout salarié.",
          ru: "Узнайте в своём вузе об общежитиях и стипендиях, а в Битуах Леуми — какие взносы вы должны платить как студент. Если вы подрабатываете во время учёбы, у вас те же базовые права, что и у любого наёмного работника.",
          es: "Pregunta en tu institución por las residencias y las becas, y comprueba en el Bituaj Leumí qué cotizaciones te corresponden como estudiante. Si trabajas mientras estudias, tienes los mismos derechos básicos que cualquier empleado.",
          en: "Ask your institution about dormitories and scholarships, and check with Bituach Leumi which contributions apply to you as a student. If you work alongside your studies, you have the same basic rights as any employee.",
        },
        links: ["bituach-leumi", "kol-zchut"],
      },
    ],
  },

  // ===== Entrepreneurs =====
  {
    profile: "entrepreneur",
    emoji: "🚀",
    title: {
      fr: "Entrepreneurs et indépendants",
      ru: "Предприниматели и самозанятые",
      es: "Emprendedores y autónomos",
      en: "Entrepreneurs & self-employed",
    },
    intro: {
      fr: "Ouvrir une activité en Israël, c'est s'enregistrer auprès de trois organismes (TVA, impôt sur le revenu et Bitouah Léoumi) et choisir le bon statut juridique. Profitez de l'accompagnement officiel gratuit avant de signer quoi que ce soit.",
      ru: "Открыть бизнес в Израиле — значит встать на учёт в трёх ведомствах (НДС, подоходный налог и Битуах Леуми) и выбрать подходящий юридический статус. Прежде чем что-либо подписывать, воспользуйтесь бесплатной официальной консультацией.",
      es: "Abrir un negocio en Israel implica registrarse ante tres organismos (IVA, impuesto sobre la renta y Bituaj Leumí) y elegir la figura jurídica adecuada. Aprovecha el asesoramiento oficial gratuito antes de firmar nada.",
      en: "Opening a business in Israel means registering with three bodies — VAT, income tax and Bituach Leumi — and choosing the right legal status. Use the free official guidance before you sign anything.",
    },
    steps: [
      {
        title: {
          fr: "Commencer par l'accompagnement officiel gratuit",
          ru: "Начните с бесплатной официальной консультации",
          es: "Empieza por el asesoramiento oficial gratuito",
          en: "Start with free official guidance",
        },
        desc: {
          fr: "Avant toute ouverture, contactez le centre d'information économique du ministère de l'Alyah et de l'Intégration : ses conseillers expliquent, en plusieurs langues, comment créer une activité, comment fonctionne la fiscalité et quelles aides existent pour les olim entrepreneurs.",
          ru: "Прежде чем что-либо открывать, обратитесь в центр информации по бизнесу Министерства алии и интеграции: консультанты на нескольких языках объяснят, как открыть дело, как устроена налоговая система и какая поддержка есть для предпринимателей-репатриантов.",
          es: "Antes de abrir nada, contacta con el centro de información de negocios del Ministerio de Aliá y de Integración: sus asesores explican, en varios idiomas, cómo abrir un negocio, cómo funciona el sistema fiscal y qué apoyos existen para los olim emprendedores.",
          en: "Before opening anything, contact the Ministry of Aliyah and Integration's business information centre: its advisers explain, in several languages, how to open a business, how the tax system works and what support exists for olim entrepreneurs.",
        },
        links: ["moia-business"],
      },
      {
        title: {
          fr: "Choisir son statut : ossek patour, ossek mourché ou société",
          ru: "Выберите статус: осек патур, осек мурше или компания",
          es: "Elige tu figura: osek patur, osek murshé o sociedad",
          en: "Choose your status: osek patur, osek murshe or company",
        },
        desc: {
          fr: "L'ossek patour (exonéré de TVA) est le statut le plus simple, pour une petite activité sous un plafond annuel de chiffre d'affaires ; l'ossek mourché facture et déclare la TVA ; la société (hevra baam) est une personne morale distincte, immatriculée au Registre des sociétés. Le bon choix dépend de votre chiffre d'affaires, de vos clients et de vos risques : consultez un expert-comptable (roé heshbon) ou un conseiller fiscal (yoetz mas).",
          ru: "Осек патур (освобождённый от НДС) — самый простой статус для небольшой деятельности с годовым оборотом ниже установленного потолка; осек мурше начисляет НДС и отчитывается по нему; компания (хевра баам) — отдельное юридическое лицо, которое регистрируется у Регистратора компаний. Выбор зависит от оборота, клиентов и рисков — посоветуйтесь с бухгалтером (роэ хешбон) или налоговым консультантом (йоэц мас).",
          es: "El osek patur (exento de IVA) es la figura más sencilla, para una actividad pequeña por debajo de un tope anual de facturación; el osek murshé cobra y declara IVA; la sociedad (jevrá baam) es una persona jurídica independiente que se inscribe en el Registro de Sociedades. La elección depende de tu facturación, tus clientes y tus riesgos: consulta a un contador (roé jeshbón) o a un asesor fiscal (yoetz mas).",
          en: "An osek patur (exempt dealer) is the simplest status, for small activity below an annual turnover ceiling; an osek murshe (authorised dealer) charges and reports VAT; a company (hevra ba'am) is a separate legal entity registered with the Registrar of Companies. The right choice depends on your turnover, clients and risks — ask an accountant (ro'e heshbon) or tax adviser (yoetz mas).",
        },
        links: ["tax-authority", "moia-business"],
      },
      {
        title: {
          fr: "S'enregistrer auprès du fisc : TVA et impôt sur le revenu",
          ru: "Встаньте на учёт в Налоговом управлении: НДС и подоходный налог",
          es: "Regístrate en la Autoridad Tributaria: IVA e impuesto sobre la renta",
          en: "Register with the Tax Authority: VAT and income tax",
        },
        desc: {
          fr: "Ouvrez votre dossier à la TVA (Maam) et à l'impôt sur le revenu (Mas Hakhnassa). Un dossier d'ossek patour peut s'ouvrir en ligne ; celui d'ossek mourché s'ouvre au bureau régional de la TVA ou par l'intermédiaire d'un comptable ou d'un conseiller fiscal. Préparez votre téoudat zéout, une attestation de compte bancaire et les documents relatifs à l'activité.",
          ru: "Откройте дело в управлении НДС (маам) и в управлении подоходного налога (мас ахнаса). Дело осек патур можно открыть онлайн; дело осек мурше открывают в региональном отделении НДС либо через бухгалтера или налогового консультанта. Подготовьте теудат зеут, подтверждение банковского счёта и документы о деятельности.",
          es: "Abre tu expediente en el IVA (maam) y en el impuesto sobre la renta (mas hajnasá). El expediente de osek patur puede abrirse en línea; el de osek murshé se abre en la oficina regional del IVA o a través de un contador o asesor fiscal. Ten a mano tu teudat zehut, un comprobante de cuenta bancaria y los documentos del negocio.",
          en: "Open your file with VAT (Ma'am) and with income tax (Mas Hachnasa). An osek patur file can be opened online; an osek murshe file is opened at the regional VAT office or through an accountant or tax adviser. Have your teudat zehut, a bank account confirmation and documents about the business ready.",
        },
        links: ["tax-authority"],
      },
      {
        title: {
          fr: "Se déclarer indépendant au Bitouah Léoumi",
          ru: "Зарегистрируйтесь в Битуах Леуми как самозанятый",
          es: "Regístrate como autónomo en el Bituaj Leumí",
          en: "Register as self-employed with Bituach Leumi",
        },
        desc: {
          fr: "Assurez-vous d'être enregistré comme indépendant (atsmaï) au Bitouah Léoumi ; vos cotisations sont versées sous forme d'acomptes calculés sur votre revenu estimé. Un enregistrement correct est essentiel : votre couverture en cas d'accident du travail, de maternité et pour d'autres prestations en dépend.",
          ru: "Убедитесь, что вы зарегистрированы в Битуах Леуми как самозанятый (ацмаи); взносы платятся авансом исходя из предполагаемого дохода. Правильная регистрация важна: от неё зависят ваши права при производственной травме, на пособие по материнству и другие выплаты.",
          es: "Asegúrate de estar registrado como autónomo (atzmaí) en el Bituaj Leumí; las cotizaciones se pagan mediante anticipos calculados sobre tus ingresos estimados. Registrarte correctamente es importante: de ello depende tu cobertura por accidente de trabajo, maternidad y otras prestaciones.",
          en: "Make sure you are registered as self-employed (atzmai) with Bituach Leumi; your contributions are paid in advance instalments based on your estimated income. Correct registration matters: your coverage for work injury, maternity and other benefits depends on it.",
        },
        links: ["bituach-leumi"],
      },
      {
        title: {
          fr: "Vérifier ses avantages fiscaux d'olé",
          ru: "Проверьте налоговые льготы для репатриантов",
          es: "Comprueba tus beneficios fiscales como olé",
          en: "Check your olim tax benefits",
        },
        desc: {
          fr: "Les nouveaux olim peuvent bénéficier, pendant une durée limitée, de points de crédit d'impôt et d'allègements sur les revenus de source étrangère. Demandez à l'administration fiscale ou au centre d'information économique pour olim comment ils s'appliquent aux revenus de votre activité avant votre première déclaration annuelle.",
          ru: "Новым репатриантам в течение ограниченного срока могут полагаться зачётные пункты по подоходному налогу и льготы по зарубежным доходам. До подачи первого годового отчёта узнайте в Налоговом управлении или в центре информации по бизнесу для репатриантов, как эти льготы применяются к доходам от вашего дела.",
          es: "Los nuevos olim pueden tener derecho, durante un período limitado, a puntos de crédito en el impuesto sobre la renta y a exenciones sobre ingresos del exterior. Pregunta a la Autoridad Tributaria o al centro de negocios para olim cómo se aplican a los ingresos de tu actividad antes de presentar tu primera declaración anual.",
          en: "New olim may be entitled, for a limited period, to income-tax credit points and to reliefs on income from abroad. Ask the Tax Authority or the olim business centre how these apply to your business income before you file your first annual report.",
        },
        links: ["tax-authority", "moia-business", "kol-zchut"],
      },
      {
        title: {
          fr: "Profiter du mentorat, des formations et des financements",
          ru: "Пользуйтесь менторством, курсами и программами финансирования",
          es: "Aprovecha las mentorías, los cursos y la financiación",
          en: "Use mentoring, courses and financing schemes",
        },
        desc: {
          fr: "Les centres MAOF de l'Agence des petites et moyennes entreprises proposent du conseil subventionné, des formations et une aide aux demandes de financement ; le ministère de l'Alyah et de l'Intégration gère de son côté des centres d'affaires pour olim offrant un soutien comparable. Vérifiez-y votre éligibilité avant de payer un consultant privé.",
          ru: "Центры МАОФ Агентства малого и среднего бизнеса предлагают субсидируемые консультации, курсы и помощь в подаче заявок на финансирование, а Министерство алии и интеграции содержит бизнес-центры для репатриантов с похожей поддержкой. Проверьте там свои права, прежде чем платить частным консультантам.",
          es: "Los centros MAOF de la Agencia para Pequeñas y Medianas Empresas ofrecen consultoría subvencionada, cursos y ayuda para solicitar financiación, y el Ministerio de Aliá y de Integración gestiona centros de negocios para olim con un apoyo similar. Comprueba allí tu elegibilidad antes de pagar una consultoría privada.",
          en: "The MAOF centres of the Small and Medium Business Agency offer subsidised consulting, courses and help with applying for financing, and the Ministry of Aliyah and Integration runs business centres for olim with similar support. Check your eligibility there before paying for private consulting.",
        },
        links: ["sba-maof", "moia-business"],
      },
      {
        title: {
          fr: "Tenir ses obligations courantes à jour",
          ru: "Не забывайте о текущих обязанностях",
          es: "Mantén al día tus obligaciones",
          en: "Keep up with your ongoing obligations",
        },
        desc: {
          fr: "Émettez des factures et reçus conformes, tenez votre comptabilité et déposez dans les délais vos déclarations périodiques de TVA et d'impôt ainsi que votre déclaration annuelle. Vérifiez aussi votre obligation de cotiser à une retraite en tant qu'indépendant. La plupart des olim indépendants travaillent avec un comptable dès le premier jour.",
          ru: "Выписывайте правильные счета и квитанции, ведите учёт и вовремя подавайте периодические отчёты по НДС и подоходному налогу, а также годовой отчёт. Уточните и свою обязанность делать пенсионные отчисления как самозанятый. Большинство самозанятых репатриантов с первого дня работают с бухгалтером.",
          es: "Emite facturas y recibos en regla, lleva tu contabilidad y presenta a tiempo los informes periódicos de IVA e impuesto sobre la renta y la declaración anual. Comprueba también tu obligación de aportar a una pensión como autónomo. La mayoría de los olim autónomos trabajan con un contador desde el primer día.",
          en: "Issue proper invoices and receipts, keep your books, and file your periodic VAT and income-tax reports and your annual return on time. Also check your obligation to save for a pension as a self-employed person. Most self-employed olim work with an accountant from day one.",
        },
        links: ["tax-authority", "bituach-leumi", "kol-zchut"],
      },
    ],
  },

  // ===== Employees =====
  {
    profile: "employee",
    emoji: "💼",
    title: {
      fr: "Salariés",
      ru: "Наёмные работники",
      es: "Empleados",
      en: "Employees",
    },
    intro: {
      fr: "De la recherche d'emploi à la première fiche de paie : ce qu'il faut préparer, les droits qui vous protègent dès le premier jour et les dispositifs pour changer de métier ou monter en compétences.",
      ru: "От поиска работы до первой зарплатной ведомости: что подготовить, какие права защищают вас с первого дня и какие программы помогут сменить профессию или повысить квалификацию.",
      es: "De la búsqueda de empleo a la primera nómina: qué preparar, qué derechos te protegen desde el primer día y qué programas te ayudan a cambiar de profesión o a mejorar tu cualificación.",
      en: "From job search to your first payslip: what to prepare, which rights protect you from day one and which programmes can help you change or upgrade your profession.",
    },
    steps: [
      {
        title: {
          fr: "Préparer sa recherche d'emploi",
          ru: "Подготовьтесь к поиску работы",
          es: "Prepara tu búsqueda de empleo",
          en: "Prepare your job search",
        },
        desc: {
          fr: "Adaptez votre CV aux usages israéliens (court, en hébreu ou en anglais) et activez tous les canaux : conseillers et centres d'emploi du ministère de l'Alyah et de l'Intégration, Service de l'emploi, programmes de carrière pour olim comme Gvahim. Le réseau personnel compte énormément en Israël.",
          ru: "Адаптируйте резюме под израильские стандарты (короткое, на иврите или английском) и используйте все каналы: консультантов и центры трудоустройства Министерства алии и интеграции, Службу трудоустройства, карьерные программы для репатриантов, например Gvahim. В Израиле очень многое решают личные связи.",
          es: "Adapta tu currículum a los usos israelíes (breve, en hebreo o inglés) y utiliza todos los canales: los asesores y centros de empleo del Ministerio de Aliá y de Integración, el Servicio de Empleo y programas de carrera para olim como Gvahim. En Israel los contactos personales cuentan mucho.",
          en: "Adapt your CV to Israeli norms (short, in Hebrew or English) and use every channel: the employment counsellors and centres of the Ministry of Aliyah and Integration, the Employment Service, and career programmes for olim such as Gvahim. Personal networking counts for a lot in Israel.",
        },
        links: ["moia-employment", "employment-service", "gvahim"],
      },
      {
        title: {
          fr: "Faire reconnaître ses diplômes et sa profession",
          ru: "Подтвердите диплом и профессию",
          es: "Haz reconocer tu título y tu profesión",
          en: "Get your degree and profession recognised",
        },
        desc: {
          fr: "Pour les postes du secteur public, il vous faudra une évaluation officielle de votre diplôme universitaire. Si votre profession est réglementée (santé, droit, enseignement, ingénierie, comptabilité, etc.), vous devez obtenir une licence israélienne auprès de l'autorité compétente avant d'exercer ; le ministère de l'Alyah et de l'Intégration soutient des cours de préparation à certains examens.",
          ru: "Для работы в госсекторе понадобится официальная оценка вашей академической степени. Если профессия лицензируемая (медицина, право, преподавание, инженерное дело, бухгалтерия и др.), до начала работы нужно получить израильскую лицензию в соответствующем ведомстве; Министерство алии и интеграции поддерживает курсы подготовки к некоторым лицензионным экзаменам.",
          es: "Para los puestos del sector público necesitarás una evaluación oficial de tu título académico. Si tu profesión está regulada (salud, derecho, docencia, ingeniería, contabilidad y otras), debes obtener una licencia israelí de la autoridad competente antes de ejercer; el Ministerio de Aliá y de Integración apoya cursos de preparación para algunos exámenes de licencia.",
          en: "For public-sector jobs you will need an official evaluation of your academic degree. If your profession is regulated (health, law, teaching, engineering, accounting and others), you need an Israeli licence from the relevant authority before you can practise; the Ministry of Aliyah and Integration supports preparation courses for some licensing exams.",
        },
        links: ["degree-evaluation", "licensing-courses"],
      },
      {
        title: {
          fr: "Obtenir ses conditions d'emploi par écrit",
          ru: "Получите условия работы в письменном виде",
          es: "Pide tus condiciones de trabajo por escrito",
          en: "Get your terms of employment in writing",
        },
        desc: {
          fr: "Votre employeur doit vous remettre un document écrit précisant vos conditions d'emploi : salaire, horaires, date de début, avantages sociaux. Lisez-le avant de commencer, faites préciser tout point obscur et conservez-en une copie.",
          ru: "Работодатель обязан выдать вам письменное уведомление об условиях труда: зарплата, часы работы, дата начала, социальные отчисления. Прочитайте его до выхода на работу, уточните всё непонятное и сохраните копию.",
          es: "Tu empleador debe entregarte un aviso escrito con tus condiciones de trabajo: salario, horario, fecha de inicio y prestaciones sociales. Léelo antes de empezar, pregunta lo que no esté claro y guarda una copia.",
          en: "Your employer must give you written notice of your terms of employment — pay, working hours, start date, social benefits. Read it before you start, ask about anything unclear and keep a copy.",
        },
        links: ["labor-rights", "kol-zchut"],
      },
      {
        title: {
          fr: "Comprendre sa fiche de paie et ses impôts",
          ru: "Разберитесь с зарплатной ведомостью и налогами",
          es: "Entiende tu nómina y tus impuestos",
          en: "Understand your payslip and your tax",
        },
        desc: {
          fr: "Vous devez recevoir chaque mois une fiche de paie détaillée (tloush maskoret) indiquant salaire, heures et retenues. À l'embauche, remplissez la fiche d'employé (formulaire 101) en signalant que vous êtes nouvel olé, afin que vos points de crédit d'impôt soient appliqués ; si vous cumulez plusieurs emplois, faites une coordination fiscale (téoum mas).",
          ru: "Каждый месяц вы должны получать подробную зарплатную ведомость (тлуш маскорет) с указанием зарплаты, часов и удержаний. При устройстве заполните карточку работника (форма 101) и укажите, что вы новый репатриант, чтобы вам начислили зачётные пункты по подоходному налогу; если мест работы несколько, оформите налоговое согласование (теум мас).",
          es: "Cada mes debes recibir una nómina detallada (tlush maskoret) con el salario, las horas y las deducciones. Al empezar, rellena la ficha de empleado (formulario 101) e indica que eres nuevo olé para que se apliquen tus puntos de crédito fiscal; si tienes más de un empleo, tramita una coordinación de impuestos (teum mas).",
          en: "Every month you must receive a detailed payslip (tlush maskoret) showing pay, hours and deductions. When you start, fill in the employee card (Form 101) and state that you are a new oleh so that your income-tax credit points are applied; if you have more than one job, arrange a tax coordination (teum mas).",
        },
        links: ["tax-authority", "kol-zchut"],
      },
      {
        title: {
          fr: "Retraite et cotisations sociales",
          ru: "Пенсия и социальные отчисления",
          es: "Pensión y cotizaciones sociales",
          en: "Pension and social contributions",
        },
        desc: {
          fr: "L'assurance retraite est obligatoire pour les salariés : vous et votre employeur cotisez, et c'est vous qui choisissez la caisse. Les cotisations au Bitouah Léoumi et à l'assurance maladie sont prélevées sur votre salaire. Vérifiez sur votre fiche de paie et auprès de votre caisse de retraite que les versements sont bien effectués.",
          ru: "Пенсионное страхование для наёмных работников обязательно: взносы делаете и вы, и работодатель, а пенсионный фонд вы выбираете сами. Взносы в Битуах Леуми и на медицинское страхование удерживаются из зарплаты. Проверяйте по ведомости и в пенсионном фонде, что отчисления действительно перечисляются.",
          es: "El seguro de pensión es obligatorio para los empleados: aportan tanto tú como tu empleador, y tú eliges el fondo. Las cotizaciones al Bituaj Leumí y al seguro de salud se descuentan del salario. Comprueba en tu nómina y con tu fondo de pensión que los aportes se están pagando realmente.",
          en: "Pension insurance is compulsory for employees: you and your employer both contribute, and you choose the fund. Bituach Leumi and health insurance contributions are deducted from your pay. Check on your payslip and with your pension fund that the contributions are really being paid.",
        },
        links: ["labor-rights", "bituach-leumi"],
      },
      {
        title: {
          fr: "Connaître ses droits fondamentaux",
          ru: "Знайте свои базовые права",
          es: "Conoce tus derechos básicos",
          en: "Know your basic rights",
        },
        desc: {
          fr: "Salaire minimum, durée du travail et heures supplémentaires, congés payés, indemnités maladie, frais de transport, prime de convalescence (dmei havraa) et indemnités de licenciement sont fixés par la loi et un contrat ne peut pas y déroger. S'ils ne sont pas respectés, vous pouvez déposer plainte auprès du ministère du Travail ou vous adresser à une association de défense des salariés comme Kav LaOved.",
          ru: "Минимальная зарплата, продолжительность рабочего времени и сверхурочные, ежегодный отпуск, оплата больничных, проезда, оздоровительные (дмей авраа) и выходное пособие установлены законом, и договор не может их отменить. Если ваши права нарушают, можно подать жалобу в Министерство труда или обратиться в организацию по защите прав работников, например «Кав ла-Овед».",
          es: "El salario mínimo, la jornada y las horas extra, las vacaciones anuales, la paga por enfermedad, los gastos de transporte, la paga de convalecencia (dmei havraá) y la indemnización por despido están fijados por ley y un contrato no puede anularlos. Si no se respetan, puedes presentar una queja ante el Ministerio de Trabajo o acudir a una organización de defensa de los trabajadores como Kav LaOved.",
          en: "Minimum wage, working hours and overtime, annual leave, sick pay, travel expenses, convalescence pay (dmei havra'a) and severance pay are set by law and cannot be waived in a contract. If they are not respected, you can file a complaint with the Ministry of Labor or turn to a workers' rights organisation such as Kav LaOved.",
        },
        links: ["labor-rights", "kav-laoved", "kol-zchut"],
      },
      {
        title: {
          fr: "Se reconvertir ou se perfectionner",
          ru: "Переквалификация и повышение квалификации",
          es: "Recíclate o mejora tu cualificación",
          en: "Retrain or upgrade your skills",
        },
        desc: {
          fr: "Si votre métier est peu demandé ou si l'hébreu vous freine, renseignez-vous auprès du ministère de l'Alyah et de l'Intégration sur l'oulpan professionnel, les formations de reconversion et le programme de vouchers qui aide à financer des formations agréées. Vérifiez votre éligibilité avant de vous inscrire à un cours.",
          ru: "Если ваша профессия не востребована или мешает недостаточный иврит, узнайте в Министерстве алии и интеграции о профессиональном ульпане, курсах переквалификации и программе ваучеров, которая помогает оплатить утверждённые курсы. Проверьте своё право на помощь до записи на курс.",
          es: "Si tu profesión tiene poca demanda o el hebreo te frena, pregunta en el Ministerio de Aliá y de Integración por el ulpán profesional, los cursos de reconversión y el programa de vouchers que ayuda a pagar formaciones aprobadas. Comprueba tu elegibilidad antes de inscribirte en un curso.",
          en: "If your profession is not in demand or your Hebrew holds you back, ask the Ministry of Aliyah and Integration about professional ulpan, retraining courses and the voucher programme that helps pay for approved training. Check your eligibility before you sign up for a course.",
        },
        links: ["moia-employment", "ulpan"],
      },
      {
        title: {
          fr: "En cas de perte d'emploi",
          ru: "Если вы потеряли работу",
          es: "Si pierdes tu empleo",
          en: "If you lose your job",
        },
        desc: {
          fr: "Inscrivez-vous sans attendre au Service de l'emploi et déposez une demande d'allocation chômage auprès du Bitouah Léoumi ; le droit dépend notamment d'une période de travail minimale. Demandez à votre employeur une lettre de fin de contrat et votre dernière fiche de paie.",
          ru: "Сразу же зарегистрируйтесь в Службе трудоустройства и подайте в Битуах Леуми заявление на пособие по безработице; право на него зависит, в частности, от отработанного страхового стажа. Попросите у работодателя письмо об увольнении и последнюю зарплатную ведомость.",
          es: "Inscríbete de inmediato en el Servicio de Empleo y presenta la solicitud de prestación por desempleo en el Bituaj Leumí; el derecho depende, entre otras cosas, de un período mínimo de trabajo. Pide a tu empleador la carta de despido y tu última nómina.",
          en: "Register with the Employment Service straight away and file a claim for unemployment benefit with Bituach Leumi; entitlement depends, among other things, on a qualifying period of work. Ask your employer for a termination letter and your final payslip.",
        },
        links: ["employment-service", "bituach-leumi"],
      },
    ],
  },

  // ===== Medical professions =====
  {
    profile: "medical",
    emoji: "🩺",
    title: {
      fr: "Professions médicales et de santé",
      ru: "Медицинские работники",
      es: "Profesionales de la salud",
      en: "Medical & health professionals",
    },
    intro: {
      fr: "Pour exercer une profession de santé en Israël, il faut une licence du ministère de la Santé. Le parcours dépend de votre profession, de votre pays de formation et de votre expérience : commencez le plus tôt possible, idéalement avant l'alyah.",
      ru: "Чтобы работать в Израиле по медицинской специальности, нужна лицензия Министерства здравоохранения. Порядок зависит от профессии, страны обучения и стажа — начинайте как можно раньше, лучше ещё до репатриации.",
      es: "Para ejercer una profesión sanitaria en Israel necesitas una licencia del Ministerio de Salud. El recorrido depende de tu profesión, de dónde te formaste y de tu experiencia: empieza cuanto antes, idealmente antes de la aliá.",
      en: "To practise a health profession in Israel you need a licence from the Ministry of Health. The track depends on your profession, where you trained and your experience — start as early as possible, ideally before aliyah.",
    },
    steps: [
      {
        title: {
          fr: "Anticiper et rassembler ses documents",
          ru: "Начните заранее и соберите документы",
          es: "Empieza pronto y reúne tus documentos",
          en: "Start early and gather your documents",
        },
        desc: {
          fr: "Réunissez diplômes, relevés de notes, autorisation d'exercer, attestations de bonne conduite professionnelle et justificatifs d'expérience, certifiés et traduits selon les exigences du ministère de la Santé. Contactez l'unité du ministère de l'Alyah et de l'Intégration dédiée aux professions médicales, qui accompagne les olim tout au long du parcours.",
          ru: "Соберите дипломы, выписки с оценками, лицензию, справки о профессиональной репутации (good standing) и подтверждение стажа, заверенные и переведённые так, как требует Минздрав. Свяжитесь с подразделением Министерства алии и интеграции по медицинским профессиям: оно сопровождает репатриантов на всех этапах.",
          es: "Reúne tus títulos, certificados de notas, licencia, certificados de buena conducta profesional y constancias de experiencia, certificados y traducidos como exige el Ministerio de Salud. Contacta con la unidad del Ministerio de Aliá y de Integración para profesiones médicas, que acompaña a los olim durante todo el proceso.",
          en: "Collect your diplomas, transcripts, licence, certificates of good standing and proof of experience, certified and translated as the Ministry of Health requires. Contact the Ministry of Aliyah and Integration's unit for medical professions, which accompanies olim through the whole process.",
        },
        links: ["moh-licensing", "moia-medical"],
      },
      {
        title: {
          fr: "Déposer sa demande de reconnaissance au ministère de la Santé",
          ru: "Подайте документы на признание в Минздрав",
          es: "Solicita el reconocimiento al Ministerio de Salud",
          en: "Apply to the Ministry of Health for recognition",
        },
        desc: {
          fr: "Adressez votre dossier à la Division des licences des professions médicales. Chaque profession (médecins, dentistes, infirmiers, pharmaciens, kinésithérapeutes, etc.) a ses propres exigences et formulaires : suivez précisément la page qui vous concerne.",
          ru: "Подайте заявление в Отдел лицензирования медицинских профессий. У каждой профессии (врачи, стоматологи, медсёстры и медбратья, фармацевты, физиотерапевты и др.) свои требования и бланки — строго следуйте инструкциям на странице своей специальности.",
          es: "Presenta tu solicitud en la División de Licencias de Profesiones Médicas. Cada profesión (médicos, odontólogos, enfermeros, farmacéuticos, fisioterapeutas y otras) tiene sus propios requisitos y formularios: sigue al pie de la letra la página de la tuya.",
          en: "Submit your application to the Medical Professions Licensing Division. Each profession — physicians, dentists, nurses, pharmacists, physiotherapists and others — has its own requirements and forms, so follow the page for yours exactly.",
        },
        links: ["moh-licensing"],
      },
      {
        title: {
          fr: "Examen de licence, dispense ou période supervisée",
          ru: "Лицензионный экзамен, освобождение или период под наблюдением",
          es: "Examen de licencia, exención o período supervisado",
          en: "Licensing exam, exemption or supervised period",
        },
        desc: {
          fr: "Selon votre profession, votre lieu de formation et vos années d'exercice, vous devrez passer l'examen d'État de licence, ou vous pourrez en être dispensé ou effectuer à la place une période d'adaptation supervisée. C'est le ministère de la Santé qui détermine le parcours applicable.",
          ru: "В зависимости от профессии, места учёбы и стажа вам нужно будет сдать государственный лицензионный экзамен либо вы сможете получить освобождение или пройти вместо экзамена период адаптации под наблюдением. Какой путь применим к вам, решает Минздрав.",
          es: "Según tu profesión, dónde estudiaste y tus años de ejercicio, tendrás que aprobar el examen estatal de licencia, o podrás quedar exento o realizar en su lugar un período de adaptación supervisado. El Ministerio de Salud decide qué vía te corresponde.",
          en: "Depending on your profession, where you studied and your years of practice, you may have to pass the government licensing exam, or you may qualify for an exemption or for a supervised adaptation period instead. The Ministry of Health decides which track applies to you.",
        },
        links: ["moh-licensing"],
      },
      {
        title: {
          fr: "Hébreu professionnel et préparation aux examens",
          ru: "Профессиональный иврит и подготовка к экзаменам",
          es: "Hebreo profesional y preparación de exámenes",
          en: "Professional Hebrew and exam preparation",
        },
        desc: {
          fr: "Renseignez-vous sur l'oulpan professionnel (médical) et sur les cours de préparation aux examens de licence que le ministère de l'Alyah et de l'Intégration organise et contribue à financer. Un hébreu opérationnel, avec les patients comme dans les dossiers médicaux, est indispensable en pratique.",
          ru: "Узнайте о профессиональном (медицинском) ульпане и о курсах подготовки к лицензионным экзаменам, которые организует и помогает оплачивать Министерство алии и интеграции. Рабочий иврит — для общения с пациентами и ведения медицинской документации — на практике необходим.",
          es: "Pregunta por el ulpán profesional (médico) y por los cursos de preparación para los exámenes de licencia que organiza y ayuda a financiar el Ministerio de Aliá y de Integración. Un hebreo de trabajo, con los pacientes y en las historias clínicas, es imprescindible en la práctica.",
          en: "Ask about professional (medical) ulpan and about the preparation courses for licensing exams that the Ministry of Aliyah and Integration organises and helps fund. Working Hebrew — with patients and in medical records — is essential in practice.",
        },
        links: ["licensing-courses", "moia-medical", "ulpan"],
      },
      {
        title: {
          fr: "Internat (stage), si nécessaire",
          ru: "Стаж (интернатура), если требуется",
          es: "Internado (stage), si se exige",
          en: "Internship, if required",
        },
        desc: {
          fr: "Les médecins qui n'ont pas effectué un internat reconnu peuvent être tenus d'en accomplir un (stage) dans un hôpital israélien avant d'obtenir une licence définitive. D'autres professions peuvent avoir leurs propres exigences de pratique supervisée.",
          ru: "Врачам, не прошедшим признанную интернатуру, может потребоваться пройти её («стаж») в израильской больнице до получения постоянной лицензии. В других профессиях могут быть свои требования к практике под наблюдением.",
          es: "A los médicos que no hayan completado un internado reconocido se les puede exigir realizarlo (stage) en un hospital israelí antes de obtener la licencia definitiva. Otras profesiones pueden tener sus propios requisitos de práctica supervisada.",
          en: "Physicians who have not completed a recognised internship may be required to complete one (stage) in an Israeli hospital before receiving a permanent licence. Other professions can have their own supervised-practice requirements.",
        },
        links: ["moh-licensing"],
      },
      {
        title: {
          fr: "Reconnaissance de la spécialité",
          ru: "Признание специализации",
          es: "Reconocimiento de la especialidad",
          en: "Specialty recognition",
        },
        desc: {
          fr: "La reconnaissance d'une spécialité médicale acquise à l'étranger est une procédure distincte, gérée par le Conseil scientifique de l'Association médicale d'Israël, et elle débute une fois la licence israélienne obtenue. Préparez des justificatifs détaillés de votre internat de spécialité et de vos examens.",
          ru: "Признание врачебной специализации, полученной за рубежом, — отдельная процедура, которой занимается Научный совет Израильской медицинской ассоциации; начать её можно после получения израильской лицензии. Подготовьте подробные документы о прохождении резидентуры (ординатуры) и сданных экзаменах.",
          es: "El reconocimiento de una especialidad médica obtenida en el extranjero es un trámite aparte, a cargo del Consejo Científico de la Asociación Médica de Israel, y comienza una vez que tienes la licencia israelí. Prepara constancias detalladas de tu residencia y de tus exámenes.",
          en: "Recognition of a medical specialty obtained abroad is a separate process handled by the Scientific Council of the Israel Medical Association, and it starts once you hold an Israeli licence. Prepare detailed proof of your residency training and exams.",
        },
        links: ["ima"],
      },
      {
        title: {
          fr: "Trouver un poste",
          ru: "Найдите место работы",
          es: "Encuentra un puesto",
          en: "Find a position",
        },
        desc: {
          fr: "Le ministère de l'Alyah et de l'Intégration aide au placement des olim dans les hôpitaux et les dispensaires de proximité, et Nefesh B'Nefesh propose un accompagnement dédié aux médecins immigrants. Renseignez-vous aussi sur les incitations à exercer en périphérie, accordées selon le budget et les besoins.",
          ru: "Министерство алии и интеграции помогает репатриантам устроиться в больницы и поликлиники, а «Нефеш бе-Нефеш» ведёт отдельную программу поддержки врачей-репатриантов. Узнайте также о стимулах для работающих на периферии — они зависят от бюджета и потребностей.",
          es: "El Ministerio de Aliá y de Integración ayuda a ubicar a los olim en hospitales y clínicas comunitarias, y Nefesh B'Nefesh ofrece un acompañamiento específico para médicos inmigrantes. Pregunta también por los incentivos para trabajar en la periferia, que dependen del presupuesto y de las necesidades.",
          en: "The Ministry of Aliyah and Integration helps place olim in hospitals and community clinics, and Nefesh B'Nefesh runs dedicated support for immigrant physicians. Ask as well about incentives for working in the periphery, which depend on budget and need.",
        },
        links: ["moia-medical", "nbn"],
      },
    ],
  },

  // ===== Legal professions =====
  {
    profile: "legal",
    emoji: "⚖️",
    title: {
      fr: "Avocats et juristes",
      ru: "Юристы и адвокаты",
      es: "Abogados y juristas",
      en: "Lawyers & legal professionals",
    },
    intro: {
      fr: "Un diplôme de droit ou une inscription à un barreau étranger ne permet pas, à lui seul, d'exercer le droit israélien. Le Barreau d'Israël fixe le parcours de requalification ; exigences et dispenses dépendent de votre expérience : faites confirmer chaque étape par le Barreau.",
      ru: "Зарубежный юридический диплом или адвокатский статус сам по себе не даёт права практиковать израильское право. Порядок переквалификации устанавливает Коллегия адвокатов Израиля; требования и освобождения зависят от вашего стажа, поэтому каждый шаг уточняйте в Коллегии.",
      es: "Un título de derecho o la colegiación en el extranjero no permiten, por sí solos, ejercer el derecho israelí. El Colegio de Abogados de Israel fija el camino de recalificación; los requisitos y las exenciones dependen de tu experiencia, así que confirma cada paso con el Colegio.",
      en: "A foreign law degree or bar admission does not by itself allow you to practise Israeli law. The Israel Bar Association sets the requalification path; requirements and exemptions depend on your experience, so confirm every step with the Bar.",
    },
    steps: [
      {
        title: {
          fr: "Choisir sa voie",
          ru: "Выберите свой путь",
          es: "Elige tu vía",
          en: "Choose your track",
        },
        desc: {
          fr: "Déterminez si vous visez l'admission pleine au Barreau d'Israël, qui permet d'exercer le droit israélien, ou l'enregistrement comme avocat étranger, limité au conseil en droit de votre juridiction d'origine et soumis à ses propres conditions.",
          ru: "Решите, что вам нужно: полноценное вступление в Коллегию адвокатов Израиля, дающее право практиковать израильское право, или регистрация в качестве иностранного адвоката — она позволяет консультировать только по праву вашей страны и имеет собственные условия.",
          es: "Decide si aspiras a la admisión plena en el Colegio de Abogados de Israel, que permite ejercer el derecho israelí, o al registro como abogado extranjero, limitado al asesoramiento sobre el derecho de tu jurisdicción de origen y con sus propias condiciones.",
          en: "Decide whether you are aiming for full admission to the Israel Bar, which allows you to practise Israeli law, or for registration as a foreign lawyer, which only covers advice on the law of your home jurisdiction and has its own conditions.",
        },
        links: ["israel-bar"],
      },
      {
        title: {
          fr: "Ouvrir son dossier au Barreau",
          ru: "Откройте дело в Коллегии адвокатов",
          es: "Abre tu expediente en el Colegio",
          en: "Open your file with the Bar",
        },
        desc: {
          fr: "Transmettez au Barreau d'Israël votre diplôme de droit, la preuve de votre admission à l'étranger et de vos années d'exercice bien avant votre premier examen, avec les certifications et traductions exigées. Le Barreau vous indique alors les exigences et dispenses applicables à votre cas.",
          ru: "Задолго до первого экзамена подайте в Коллегию адвокатов Израиля юридический диплом, подтверждение адвокатского статуса за рубежом и стажа — с заверениями и переводами, которые она требует. После этого Коллегия сообщит, какие требования и освобождения относятся к вам.",
          es: "Presenta en el Colegio de Abogados de Israel tu título de derecho y las constancias de tu colegiación en el extranjero y de tus años de ejercicio con bastante antelación a tu primer examen, con las certificaciones y traducciones que exija. El Colegio te indicará entonces qué requisitos y exenciones se te aplican.",
          en: "Submit your law degree, proof of admission abroad and of your years of practice to the Israel Bar Association well ahead of your first exam, with the certifications and translations it requires. The Bar then tells you which requirements and exemptions apply to you.",
        },
        links: ["israel-bar"],
      },
      {
        title: {
          fr: "Examen de maîtrise de l'hébreu",
          ru: "Экзамен на знание иврита",
          es: "Examen de dominio del hebreo",
          en: "Hebrew proficiency exam",
        },
        desc: {
          fr: "Les candidats formés à l'étranger doivent prouver leur niveau d'hébreu en passant l'examen de langue du Barreau, sauf dispense. Investissez tôt dans l'oulpan : l'hébreu juridique est exigeant et les étapes suivantes se déroulent en hébreu.",
          ru: "Кандидаты с зарубежным образованием должны подтвердить знание иврита на языковом экзамене Коллегии, если не имеют права на освобождение. Начните заниматься в ульпане как можно раньше: юридический иврит сложен, а последующие этапы проходят на иврите.",
          es: "Los candidatos formados en el extranjero deben acreditar su hebreo mediante el examen de idioma del Colegio, salvo que tengan derecho a una exención. Invierte pronto en el ulpán: el hebreo jurídico es exigente y las etapas posteriores se desarrollan en hebreo.",
          en: "Foreign-trained candidates must demonstrate their Hebrew through the Bar's language exam, unless they qualify for an exemption. Invest in ulpan early: legal Hebrew is demanding and the later stages are conducted in Hebrew.",
        },
        links: ["israel-bar", "ulpan"],
      },
      {
        title: {
          fr: "Examens de droit israélien (Dinei Israël)",
          ru: "Экзамены по израильскому праву («диней Исраэль»)",
          es: "Exámenes de derecho israelí (Dinei Israel)",
          en: "Exams on Israeli law (Dinei Yisrael)",
        },
        desc: {
          fr: "Vous passez une série d'examens portant sur les principales branches du droit israélien. Des cours de préparation existent, et le ministère de l'Alyah et de l'Intégration soutient la préparation à certains examens de licence : vérifiez l'offre actuelle et votre éligibilité.",
          ru: "Вам предстоит сдать серию экзаменов по основным отраслям израильского права. Существуют подготовительные курсы, а Министерство алии и интеграции поддерживает подготовку к некоторым лицензионным экзаменам — уточните, что предлагается сейчас и положена ли вам помощь.",
          es: "Rendirás una serie de exámenes sobre las principales ramas del derecho israelí. Existen cursos de preparación, y el Ministerio de Aliá y de Integración apoya la preparación de algunos exámenes de licencia: comprueba qué se ofrece actualmente y si cumples los requisitos.",
          en: "You sit a series of exams covering the main fields of Israeli law. Preparation courses exist, and the Ministry of Aliyah and Integration supports preparation for certain licensing exams — check what is currently offered and whether you qualify.",
        },
        links: ["israel-bar", "licensing-courses"],
      },
      {
        title: {
          fr: "Stage (hitmahout)",
          ru: "Стажировка («итмахут»)",
          es: "Pasantía (hitmajut)",
          en: "Internship (hitmahut)",
        },
        desc: {
          fr: "Vous effectuez un stage encadré auprès d'un avocat ou d'un service juridique agréé. Le Barreau peut en réduire la durée pour les avocats ayant une expérience significative à l'étranger : demandez une décision sur votre cas avant de chercher un lieu de stage.",
          ru: "Вы проходите стажировку под руководством утверждённого адвоката или юридического отдела. Адвокатам с солидным зарубежным стажем Коллегия может сократить её срок — попросите вынести решение по вашему случаю до того, как начнёте искать место.",
          es: "Realizarás una pasantía supervisada con un abogado o un departamento jurídico autorizado. El Colegio puede acortarla a los abogados con experiencia considerable en el extranjero: pide una resolución sobre tu caso antes de buscar dónde hacerla.",
          en: "You complete a supervised internship with an approved lawyer or legal department. The Bar may shorten it for lawyers with substantial experience abroad — ask for a decision on your case before you start looking for a placement.",
        },
        links: ["israel-bar"],
      },
      {
        title: {
          fr: "Examens finaux du Barreau et licence",
          ru: "Итоговые экзамены Коллегии и лицензия",
          es: "Exámenes finales del Colegio y licencia",
          en: "Final Bar exams and licence",
        },
        desc: {
          fr: "Après le stage viennent les examens finaux du Barreau ; les avocats étrangers expérimentés peuvent être dispensés d'une partie d'entre eux. Une fois reçu et admis comme membre du Barreau, vous pouvez exercer comme avocat israélien (orekh din).",
          ru: "После стажировки сдаются итоговые экзамены Коллегии; опытные иностранные адвокаты могут быть освобождены от части из них. Сдав экзамены и став членом Коллегии, вы получаете право работать израильским адвокатом (орех-дин).",
          es: "Tras la pasantía llegan los exámenes finales del Colegio; los abogados extranjeros con experiencia pueden quedar exentos de parte de ellos. Una vez aprobados y admitido como miembro del Colegio, podrás ejercer como abogado israelí (orej din).",
          en: "After the internship come the Bar's final licensing exams; experienced foreign lawyers may be exempt from some of them. Once you have passed and been admitted as a member of the Bar, you can practise as an Israeli lawyer (orech din).",
        },
        links: ["israel-bar"],
      },
      {
        title: {
          fr: "Travailler pendant sa requalification",
          ru: "Работайте, пока проходите переквалификацию",
          es: "Trabaja mientras te recalificas",
          en: "Work while you requalify",
        },
        desc: {
          fr: "De nombreux avocats olim travaillent entre-temps en entreprise, dans la conformité ou dans d'autres fonctions juridiques ne nécessitant pas de licence israélienne, ou comme avocats étrangers enregistrés. Pour les postes du secteur public, faites aussi évaluer officiellement votre diplôme.",
          ru: "Многие юристы-репатрианты тем временем работают корпоративными юристами, в комплаенсе или на других юридических должностях, не требующих израильской лицензии, либо как зарегистрированные иностранные адвокаты. Для работы в госсекторе оформите также официальную оценку своей академической степени.",
          es: "Muchos abogados olim trabajan entretanto en empresas, en cumplimiento normativo o en otros puestos jurídicos que no requieren licencia israelí, o como abogados extranjeros registrados. Para puestos del sector público, haz evaluar también oficialmente tu título académico.",
          en: "Many olim lawyers work in the meantime in-house, in compliance or in other legal roles that do not require an Israeli licence, or as registered foreign lawyers. For public-sector positions, also have your academic degree officially evaluated.",
        },
        links: ["degree-evaluation", "moia-employment"],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Disclaimer
// ---------------------------------------------------------------------------

export const DISCLAIMER: L = {
  fr: "Informations générales uniquement : il ne s'agit pas de conseils juridiques, médicaux, fiscaux ou financiers. Les règles, montants et délais changent souvent : vérifiez toujours auprès de l'organisme officiel avant d'agir.",
  ru: "Только общая информация — это не юридическая, медицинская, налоговая или финансовая консультация. Правила, суммы и сроки часто меняются: прежде чем действовать, обязательно уточняйте их в официальном ведомстве.",
  es: "Información de carácter general: no constituye asesoramiento jurídico, médico, fiscal ni financiero. Las normas, importes y plazos cambian con frecuencia: confirma siempre con el organismo oficial antes de actuar.",
  en: "General information only — not legal, medical, tax or financial advice. Rules, amounts and deadlines change often: always confirm with the official body before acting.",
};
