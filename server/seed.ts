// Built-in content of the four worlds: communities, city / profile / sport / event groups.
// Seeding is idempotent (keyed on seed_key), so it runs safely on every start.
import { CITIES, type L } from '../shared/data.ts';
import type { ChatCategory, Lang, ProfileType } from '../shared/types.ts';
import { WORLDS } from '../shared/types.ts';
import { db, tx, type ChatRow, type UserRow } from './db.ts';
import { now } from './util.ts';

interface SeedCommunity {
  key: string;
  emoji: string;
  name: L;
  description: L;
  announcement: L;
}

interface SeedGroup {
  key: string;
  community: string;
  category: ChatCategory;
  emoji: string;
  name: L;
  description: L;
  profile?: ProfileType;
  city?: string;
}

const COMMUNITIES: SeedCommunity[] = [
  {
    key: 'life',
    emoji: '🏡',
    name: { fr: 'Vie quotidienne', en: 'Daily Life', es: 'Vida cotidiana', ru: 'Повседневная жизнь' },
    description: {
      fr: "Entraide, démarches, logement, hébreu, bons plans : tout ce qu'il faut pour bien s'installer.",
      en: 'Mutual help, paperwork, housing, Hebrew, good deals: everything you need to settle in.',
      es: 'Ayuda mutua, trámites, vivienda, hebreo y buenos datos: todo para instalarte bien.',
      ru: 'Взаимопомощь, документы, жильё, иврит, полезные советы — всё, чтобы обустроиться.',
    },
    announcement: { fr: 'Annonces — Vie quotidienne', en: 'Announcements — Daily Life', es: 'Anuncios — Vida cotidiana', ru: 'Объявления — Повседневная жизнь' },
  },
  {
    key: 'cities',
    emoji: '🏙️',
    name: { fr: "Villes d'Israël", en: 'Cities of Israel', es: 'Ciudades de Israel', ru: 'Города Израиля' },
    description: {
      fr: 'Un groupe par ville pour rencontrer les olim près de chez vous.',
      en: 'One group per city to meet the olim who live near you.',
      es: 'Un grupo por ciudad para conocer a los olim que viven cerca de ti.',
      ru: 'Группа для каждого города: знакомьтесь с олим рядом с вами.',
    },
    announcement: { fr: 'Annonces — Villes', en: 'Announcements — Cities', es: 'Anuncios — Ciudades', ru: 'Объявления — Города' },
  },
  {
    key: 'career',
    emoji: '🧭',
    name: { fr: 'Études & Carrière', en: 'Studies & Career', es: 'Estudios y Carrera', ru: 'Учёба и карьера' },
    description: {
      fr: 'Étudiants, entrepreneurs, salariés, professions médicales et juridiques : conseils entre pairs.',
      en: 'Students, entrepreneurs, employees, medical and legal professionals: peer-to-peer advice.',
      es: 'Estudiantes, emprendedores, empleados y profesionales de la salud y del derecho: consejos entre pares.',
      ru: 'Студенты, предприниматели, наёмные работники, медики и юристы: советы от коллег.',
    },
    announcement: { fr: 'Annonces — Études & Carrière', en: 'Announcements — Studies & Career', es: 'Anuncios — Estudios y Carrera', ru: 'Объявления — Учёба и карьера' },
  },
  {
    key: 'sport',
    emoji: '⚽',
    name: { fr: 'Sport & Bien-être', en: 'Sports & Wellness', es: 'Deporte y Bienestar', ru: 'Спорт и здоровье' },
    description: {
      fr: 'Trouvez des partenaires de sport et organisez vos matchs, sorties et entraînements.',
      en: 'Find sports partners and organise your games, outings and training sessions.',
      es: 'Encuentra compañeros de deporte y organiza partidos, salidas y entrenamientos.',
      ru: 'Находите партнёров по спорту, организуйте матчи, походы и тренировки.',
    },
    announcement: { fr: 'Annonces — Sport', en: 'Announcements — Sports', es: 'Anuncios — Deporte', ru: 'Объявления — Спорт' },
  },
];

const GROUPS: SeedGroup[] = [
  {
    key: 'welcome',
    community: 'life',
    category: 'general',
    emoji: '👋',
    name: { fr: 'Bienvenue & Entraide', en: 'Welcome & Mutual Help', es: 'Bienvenida y Ayuda mutua', ru: 'Добро пожаловать и взаимопомощь' },
    description: {
      fr: 'Présentez-vous, posez vos questions, donnez un coup de main. Le point de départ de tous les olim.',
      en: 'Introduce yourself, ask your questions, lend a hand. The starting point for every oleh and olah.',
      es: 'Preséntate, haz tus preguntas y echa una mano. El punto de partida de todos los olim.',
      ru: 'Представьтесь, задавайте вопросы, помогайте другим. Отправная точка для всех олим.',
    },
  },
  {
    key: 'events',
    community: 'life',
    category: 'event',
    emoji: '🎉',
    name: { fr: 'Événements & Sorties', en: 'Events & Meetups', es: 'Eventos y Salidas', ru: 'События и встречи' },
    description: {
      fr: 'Soirées, conférences, shabbatot, afterworks, sorties : créez un événement et invitez la communauté.',
      en: 'Parties, talks, Shabbat meals, afterworks, outings: create an event and invite the community.',
      es: 'Fiestas, charlas, cenas de Shabat, afterworks y salidas: crea un evento e invita a la comunidad.',
      ru: 'Вечеринки, лекции, шаббаты, встречи после работы: создайте событие и пригласите сообщество.',
    },
  },
  {
    key: 'admin',
    community: 'life',
    category: 'general',
    emoji: '📑',
    name: { fr: 'Démarches & Administratif', en: 'Paperwork & Bureaucracy', es: 'Trámites y Burocracia', ru: 'Документы и бюрократия' },
    description: {
      fr: "Misrad HaKlita, Misrad HaPnim, Bitouah Leoumi, banque, permis… on s'entraide pour les démarches.",
      en: 'Misrad HaKlita, Misrad HaPnim, Bituach Leumi, banks, driving licence… helping each other through the paperwork.',
      es: 'Misrad HaKlitá, Misrad HaPnim, Bituaj Leumí, banco, licencia de conducir… nos ayudamos con los trámites.',
      ru: 'Мисрад а-Клита, МВД, Битуах Леуми, банк, водительские права… помогаем друг другу с документами.',
    },
  },
  {
    key: 'housing',
    community: 'life',
    category: 'general',
    emoji: '🏠',
    name: { fr: 'Logement', en: 'Housing', es: 'Vivienda', ru: 'Жильё' },
    description: {
      fr: 'Locations, colocations, achats, contrats et quartiers : questions et annonces.',
      en: 'Rentals, flat-shares, buying, contracts and neighbourhoods: questions and listings.',
      es: 'Alquileres, pisos compartidos, compra, contratos y barrios: preguntas y anuncios.',
      ru: 'Аренда, совместное жильё, покупка, договоры и районы: вопросы и объявления.',
    },
  },
  {
    key: 'hebrew',
    community: 'life',
    category: 'general',
    emoji: '🔤',
    name: { fr: 'Hébreu & Oulpan', en: 'Hebrew & Ulpan', es: 'Hebreo y Ulpán', ru: 'Иврит и ульпан' },
    description: {
      fr: 'Bons oulpanim, applis, astuces et partenaires de conversation pour progresser en hébreu.',
      en: 'Good ulpanim, apps, tips and conversation partners to improve your Hebrew.',
      es: 'Buenos ulpanim, apps, trucos y compañeros de conversación para mejorar tu hebreo.',
      ru: 'Хорошие ульпаны, приложения, советы и партнёры для разговорной практики.',
    },
  },
  {
    key: 'deals',
    community: 'life',
    category: 'general',
    emoji: '🛍️',
    name: { fr: 'Bons plans & Petites annonces', en: 'Good Deals & Classifieds', es: 'Buenos datos y Clasificados', ru: 'Выгодные предложения и объявления' },
    description: {
      fr: 'Ventes, dons, recommandations de pros, bons plans du quotidien.',
      en: 'Sales, giveaways, recommended professionals and everyday good deals.',
      es: 'Ventas, regalos, profesionales recomendados y buenos datos del día a día.',
      ru: 'Продажа, отдам даром, рекомендации специалистов и выгодные предложения.',
    },
  },
  {
    key: 'family',
    community: 'life',
    category: 'general',
    emoji: '👨‍👩‍👧',
    name: { fr: 'Familles & Enfants', en: 'Families & Kids', es: 'Familias y Niños', ru: 'Семьи и дети' },
    description: {
      fr: 'Crèches, écoles, activités, santé des enfants : la vie de famille en Israël.',
      en: 'Daycare, schools, activities, children’s health: family life in Israel.',
      es: 'Guarderías, escuelas, actividades y salud infantil: la vida familiar en Israel.',
      ru: 'Детские сады, школы, кружки, здоровье детей: семейная жизнь в Израиле.',
    },
  },
  // ── profiles ──
  {
    key: 'profile:student',
    community: 'career',
    category: 'profile',
    profile: 'student',
    emoji: '🎓',
    name: { fr: 'Étudiants', en: 'Students', es: 'Estudiantes', ru: 'Студенты' },
    description: {
      fr: 'Universités, mehina, bourses, équivalences de diplômes et vie étudiante.',
      en: 'Universities, mechina, scholarships, degree recognition and student life.',
      es: 'Universidades, mejiná, becas, reconocimiento de títulos y vida estudiantil.',
      ru: 'Университеты, мехина, стипендии, признание дипломов и студенческая жизнь.',
    },
  },
  {
    key: 'profile:entrepreneur',
    community: 'career',
    category: 'profile',
    profile: 'entrepreneur',
    emoji: '🚀',
    name: { fr: 'Entrepreneurs & Indépendants', en: 'Entrepreneurs & Freelancers', es: 'Emprendedores y Autónomos', ru: 'Предприниматели и фрилансеры' },
    description: {
      fr: 'Créer son activité en Israël : statuts, fiscalité, comptables, réseau et retours d’expérience.',
      en: 'Starting a business in Israel: legal status, taxes, accountants, networking and lessons learned.',
      es: 'Emprender en Israel: figuras legales, impuestos, contadores, networking y experiencias.',
      ru: 'Свой бизнес в Израиле: формы регистрации, налоги, бухгалтеры, нетворкинг и личный опыт.',
    },
  },
  {
    key: 'profile:employee',
    community: 'career',
    category: 'profile',
    profile: 'employee',
    emoji: '💼',
    name: { fr: 'Emploi & Salariés', en: 'Jobs & Employees', es: 'Empleo y Asalariados', ru: 'Работа и наёмные сотрудники' },
    description: {
      fr: "Offres d'emploi, CV, entretiens, droits des salariés et fiches de paie.",
      en: 'Job offers, CVs, interviews, employee rights and payslips.',
      es: 'Ofertas de trabajo, CV, entrevistas, derechos laborales y recibos de sueldo.',
      ru: 'Вакансии, резюме, собеседования, права работников и расчётные листки.',
    },
  },
  {
    key: 'profile:medical',
    community: 'career',
    category: 'profile',
    profile: 'medical',
    emoji: '🩺',
    name: { fr: 'Professions médicales', en: 'Medical Professionals', es: 'Profesionales de la salud', ru: 'Медицинские работники' },
    description: {
      fr: 'Médecins, infirmiers, dentistes, pharmaciens, paramédicaux : équivalences, licences et postes.',
      en: 'Doctors, nurses, dentists, pharmacists and allied health: licensing, exams and positions.',
      es: 'Médicos, enfermeros, dentistas, farmacéuticos y paramédicos: licencias, exámenes y puestos.',
      ru: 'Врачи, медсёстры, стоматологи, фармацевты: подтверждение дипломов, лицензии и вакансии.',
    },
  },
  {
    key: 'profile:legal',
    community: 'career',
    category: 'profile',
    profile: 'legal',
    emoji: '⚖️',
    name: { fr: 'Professions juridiques', en: 'Legal Professionals', es: 'Profesionales del derecho', ru: 'Юристы' },
    description: {
      fr: 'Avocats, juristes, notaires : examens du barreau israélien, stage et débouchés.',
      en: 'Lawyers and jurists: Israeli bar exams, internship and career paths.',
      es: 'Abogados y juristas: exámenes del Colegio de Abogados de Israel, pasantía y salidas laborales.',
      ru: 'Адвокаты и юристы: экзамены израильской коллегии адвокатов, стажировка и карьера.',
    },
  },
  // ── sport ──
  {
    key: 'sport',
    community: 'sport',
    category: 'sport',
    emoji: '🏅',
    name: { fr: 'Sport — tous niveaux', en: 'Sports — All Levels', es: 'Deporte — todos los niveles', ru: 'Спорт — любой уровень' },
    description: {
      fr: 'Le groupe général : trouvez des partenaires et proposez vos activités sportives.',
      en: 'The general group: find partners and suggest your sports activities.',
      es: 'El grupo general: encuentra compañeros y propone tus actividades deportivas.',
      ru: 'Общая группа: находите партнёров и предлагайте спортивные активности.',
    },
  },
  {
    key: 'sport:football',
    community: 'sport',
    category: 'sport',
    emoji: '⚽',
    name: { fr: 'Football', en: 'Football / Soccer', es: 'Fútbol', ru: 'Футбол' },
    description: {
      fr: 'Matchs, five, équipes et soirées foot.',
      en: 'Pick-up games, five-a-side, teams and match nights.',
      es: 'Partidos, fútbol 5, equipos y noches de fútbol.',
      ru: 'Матчи, мини-футбол, команды и совместные просмотры.',
    },
  },
  {
    key: 'sport:running',
    community: 'sport',
    category: 'sport',
    emoji: '🏃',
    name: { fr: 'Running & Randonnée', en: 'Running & Hiking', es: 'Running y Senderismo', ru: 'Бег и походы' },
    description: {
      fr: 'Sorties running, courses, treks et randonnées à travers le pays.',
      en: 'Group runs, races, treks and hikes across the country.',
      es: 'Salidas a correr, carreras, treks y caminatas por todo el país.',
      ru: 'Совместные пробежки, забеги, треки и походы по стране.',
    },
  },
  {
    key: 'sport:fitness',
    community: 'sport',
    category: 'sport',
    emoji: '🧘',
    name: { fr: 'Yoga, Fitness & Padel', en: 'Yoga, Fitness & Padel', es: 'Yoga, Fitness y Pádel', ru: 'Йога, фитнес и падел' },
    description: {
      fr: 'Cours, salles, coachs et partenaires de padel ou de tennis.',
      en: 'Classes, gyms, coaches and padel or tennis partners.',
      es: 'Clases, gimnasios, entrenadores y compañeros de pádel o tenis.',
      ru: 'Занятия, залы, тренеры и партнёры по паделу или теннису.',
    },
  },
];

const CITY_DESCRIPTION: L = {
  fr: 'Le groupe des olim francophones de {city} : entraide, bonnes adresses, rencontres et vie locale.',
  en: 'The group for English-speaking olim in {city}: mutual help, local tips, meetups and city life.',
  es: 'El grupo de los olim hispanohablantes de {city}: ayuda mutua, datos locales, encuentros y vida en la ciudad.',
  ru: 'Группа русскоязычных олим — {city}: взаимопомощь, полезные адреса, встречи и жизнь города.',
};

const WELCOME: L = {
  fr: 'Bienvenue dans « {name} » 👋\n\nCe groupe est *public* : tout le monde peut le lire, le rejoindre et le partager — sans limite de membres.\n\n• Restez bienveillants et respectueux\n• Pas de spam ni de publicité déguisée\n• Vérifiez toujours les informations officielles dans l’onglet *Guide*\n\nBonne intégration ! 💙',
  en: 'Welcome to “{name}” 👋\n\nThis group is *public*: anyone can read it, join it and share it — with no member limit.\n\n• Be kind and respectful\n• No spam or disguised advertising\n• Always double-check official information in the *Guide* tab\n\nWishing you a smooth landing! 💙',
  es: 'Te damos la bienvenida a «{name}» 👋\n\nEste grupo es *público*: cualquiera puede leerlo, unirse y compartirlo, sin límite de miembros.\n\n• Sé amable y respetuoso\n• Nada de spam ni publicidad encubierta\n• Verifica siempre la información oficial en la pestaña *Guía*\n\n¡Mucho éxito en tu integración! 💙',
  ru: 'Добро пожаловать в «{name}» 👋\n\nЭто *открытая* группа: любой может её читать, вступить и поделиться ею — без ограничения числа участников.\n\n• Будьте доброжелательны и уважайте друг друга\n• Без спама и скрытой рекламы\n• Всегда сверяйтесь с официальной информацией во вкладке *Гид*\n\nУдачной абсорбции! 💙',
};

const ANNOUNCE_DESCRIPTION: L = {
  fr: 'Les annonces importantes de la communauté. Seuls les administrateurs peuvent publier.',
  en: 'Important community announcements. Only admins can post.',
  es: 'Los anuncios importantes de la comunidad. Solo los administradores pueden publicar.',
  ru: 'Важные объявления сообщества. Публиковать могут только администраторы.',
};

export function systemUser(): UserRow {
  let user = db.prepare('SELECT * FROM users WHERE is_system = 1 ORDER BY id LIMIT 1').get() as UserRow | undefined;
  if (!user) {
    const t = now();
    db.prepare(
      `INSERT INTO users (email, username, password_hash, name, bio, world, is_system, created_at, last_seen)
       VALUES ('system@olimtalk.invalid', 'olimtalk', '!', 'OlimTalk', '', 'fr', 1, ?, ?)`,
    ).run(t, t);
    user = db.prepare('SELECT * FROM users WHERE is_system = 1 ORDER BY id LIMIT 1').get() as UserRow;
  }
  return user;
}

export function seed() {
  const system = systemUser();
  const findCommunity = db.prepare('SELECT id FROM communities WHERE seed_key = ?');
  const findChat = db.prepare('SELECT * FROM chats WHERE seed_key = ?');
  const insertCommunity = db.prepare(
    `INSERT INTO communities (world, name, description, emoji, invite_code, seed_key, created_by, created_at)
     VALUES (?,?,?,?,?,?,?,?)`,
  );
  const insertChat = db.prepare(
    `INSERT INTO chats (type, world, name, description, emoji, category, city, profile, community_id, is_announcement,
       invite_code, seed_key, send_policy, created_by, last_activity, created_at)
     VALUES ('group',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  const insertMessage = db.prepare(
    `INSERT INTO messages (chat_id, user_id, type, text, pinned_at, pinned_by, created_at) VALUES (?,?,'text',?,?,?,?)`,
  );
  const bump = db.prepare('UPDATE chats SET last_message_id = ? WHERE id = ?');

  let created = 0;
  tx(() => {
    for (const world of WORLDS) {
      const lang: Lang = world;
      const communityIds = new Map<string, number>();
      for (const c of COMMUNITIES) {
        const seedKey = `${world}:community:${c.key}`;
        let row = findCommunity.get(seedKey) as { id: number } | undefined;
        if (!row) {
          const t = now();
          const info = insertCommunity.run(world, c.name[lang], c.description[lang], c.emoji, `${world}-${c.key}`, seedKey, system.id, t);
          row = { id: Number(info.lastInsertRowid) };
          insertChat.run(
            world,
            c.announcement[lang],
            ANNOUNCE_DESCRIPTION[lang],
            '📢',
            'general',
            null,
            null,
            row.id,
            1,
            `${world}-${c.key}-news`,
            `${world}:announce:${c.key}`,
            'admins',
            system.id,
            t,
            t,
          );
          created++;
        }
        communityIds.set(c.key, row.id);
      }

      const groups: SeedGroup[] = [
        ...GROUPS,
        ...CITIES.map(
          (city): SeedGroup => ({
            key: `city:${city.key}`,
            community: 'cities',
            category: 'city',
            emoji: '🏙️',
            city: city.key,
            name: city.name,
            description: Object.fromEntries(
              WORLDS.map((w) => [w, CITY_DESCRIPTION[w].replace('{city}', city.name[w])]),
            ) as L,
          }),
        ),
      ];

      for (const g of groups) {
        const seedKey = `${world}:${g.key}`;
        if (findChat.get(seedKey)) continue;
        const t = now();
        const info = insertChat.run(
          world,
          g.name[lang],
          g.description[lang],
          g.emoji,
          g.category,
          g.city ?? null,
          g.profile ?? null,
          communityIds.get(g.community) ?? null,
          0,
          `${world}-${g.key.replace(/[:]/g, '-')}`,
          seedKey,
          'all',
          system.id,
          t,
          t,
        );
        const chatId = Number(info.lastInsertRowid);
        const msg = insertMessage.run(chatId, system.id, WELCOME[lang].replace('{name}', g.name[lang]), t, system.id, t);
        bump.run(Number(msg.lastInsertRowid), chatId);
        created++;
      }
    }
  });
  return created;
}

export function seededChat(seedKey: string): ChatRow | undefined {
  return db.prepare('SELECT * FROM chats WHERE seed_key = ?').get(seedKey) as ChatRow | undefined;
}
