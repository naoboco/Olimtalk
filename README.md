# OlimTalk

**La messagerie ouverte des olim.** Des groupes publics sans limite de membres, des groupes privés, des communautés,
des stories, des événements et un guide d'intégration — dans quatre « mondes » linguistiques :
français, anglais, espagnol et russe.

## Ce que fait la plateforme

**Ouvert par défaut, comme un groupe Facebook.** N'importe qui peut trouver un groupe public dans *Explorer*,
le lire sans s'y inscrire, le rejoindre en un clic et le partager. Aucune limite de membres.
**Chacun peut aussi créer un groupe privé** : on y entre avec l'accord d'un administrateur, et seuls ses membres le
lisent. Les conversations à deux sont privées et **chiffrées de bout en bout**.

| | |
|---|---|
| **Messagerie** | temps réel, réponses, réactions, modification, suppression (pour moi / pour tous), transfert, favoris, mentions `@`, recherche, indicateur de saisie, accusés de lecture en privé |
| **Messages épinglés** | par les admins, ou par tous si le groupe l'autorise |
| **Contenus** | photos, vidéos, documents, messages vocaux, sondages, événements avec inscription |
| **Groupes** | publics ou privés, lien d'invitation réinitialisable, QR code, admins, mode « annonces » (seuls les admins écrivent) |
| **Groupes privés** | créés par n'importe qui ; demande d'adhésion acceptée ou refusée par un administrateur ; messages, membres, fichiers et événements réservés aux membres ; affichés ou non dans Explorer |
| **Communautés** | plusieurs groupes réunis, avec un groupe d'annonces |
| **Stories** | texte, photo ou vidéo pendant 24 h, vues, réponse en privé |
| **Partage** | WhatsApp, Facebook, Telegram, X, e-mail, lien, et image « story » avec QR code pour Instagram |
| **Guide** | étapes clés et liens officiels selon le profil : étudiant, entrepreneur, salarié, médical, juridique |
| **Mondes** | FR · EN · ES · RU : langue de l'interface et groupes propres à chaque monde |
| **Traduction automatique** | un message écrit dans une autre langue s'affiche dans celle du lecteur (un message russe en français, et inversement), l'original à un toucher |
| **Modération** | signalements, blocage, bannissement, panneau pour les modérateurs |
| **Vie privée** | messages privés chiffrés de bout en bout, code de sécurité à comparer, appareils connectés, présence et confirmations de lecture masquables |
| **Mes connexions** | sa propre IA (Claude, ChatGPT, Gemini, Mistral ou tout service compatible), son agenda (Google, Outlook / Microsoft 365, Apple…) et sa boîte mail (Gmail, Outlook ou autre) |

Chaque monde démarre avec ses groupes : un par ville (23 villes), *Bienvenue & Entraide*,
*Événements & Sorties*, *Démarches*, *Logement*, *Hébreu & Oulpan*, le sport (football, running,
yoga/padel) et un groupe par profil. À l'inscription, on rejoint automatiquement le groupe de sa
ville et celui de son profil.

## Protection des données

Les **conversations privées sont chiffrées de bout en bout**, sur le modèle des messageries comme WhatsApp ou Signal :
le texte, les photos, les vidéos, les documents et les messages vocaux sont chiffrés sur l'appareil de l'expéditeur
et ne peuvent être déchiffrés que par les deux participants. Le serveur ne stocke que du texte chiffré, et refuse
tout message privé qui ne l'est pas.

- **Le mot de passe ne quitte jamais l'appareil.** Il sert à calculer, sur place, trois clés indépendantes : l'une
  prouve l'identité auprès du serveur (seule celle-ci est envoyée), l'autre verrouille la clé de chiffrement de la
  personne, la dernière verrouille ses connexions (IA, agendas).
- **Chaque personne a une paire de clés** créée sur son appareil. La clé privée n'existe sur le serveur que
  verrouillée par le mot de passe : c'est ce qui permet de retrouver ses messages sur un deuxième appareil.
- **Code de sécurité** : deux personnes peuvent comparer un code à 60 chiffres pour vérifier que personne ne s'est
  glissé entre elles. L'application prévient quand le code d'un contact change, et n'affiche jamais un message fait
  avec une clé qu'elle ne connaît pas pour ce contact.
- **Appareils connectés** : liste et déconnexion à distance. Changer de mot de passe déconnecte les autres appareils.
- **Suppression réelle** : un message supprimé pour tous, ou un compte supprimé, est effacé du serveur avec ses fichiers.
- **E-mails transférés** : chiffrés avec la clé de la personne dès leur arrivée ; le serveur ne peut plus les relire.

Ce que cela ne couvre pas, à dire clairement aux utilisateurs :

- **Les groupes ne sont pas chiffrés de bout en bout**, privés compris. Un groupe privé est un contrôle d'accès :
  seuls ses membres le lisent, mais le serveur détient les messages, l'équipe de modération peut l'ouvrir pour
  traiter un signalement, et ses fichiers sont protégés par une adresse impossible à deviner, pas par un mot de passe.
- **Les métadonnées restent visibles du serveur** : qui écrit à qui, quand, la taille des envois, les réactions.
- **Mot de passe oublié = messages privés perdus.** Personne ne peut les récupérer, pas même l'exploitant.
- Les clés ne tournent pas à chaque message (pas de « confidentialité persistante » comme le protocole Signal) :
  si le mot de passe d'une personne est un jour compromis, ses anciens messages privés peuvent être lus.
- **Sur le site web**, le code qui chiffre est servi par le serveur : il faut lui faire confiance. Les applications
  mobiles embarquent ce code, ce qui écarte ce risque.

## Groupes privés

À la création d'un groupe, on choisit **Public** ou **Privé** — tout le monde en a le droit.

- **Entrer** : « Demander à rejoindre », depuis Explorer ou le lien d'invitation. La demande attend ; les
  administrateurs du groupe sont prévenus, voient qui demande, et acceptent ou refusent. Un refus n'est pas annoncé,
  et la personne peut annuler sa demande.
- **Dehors, on ne voit rien du contenu** : ni messages, ni membres, ni fichiers, ni événements, ni aperçu dans les
  listes, ni mises à jour en direct. Seuls le nom, la description et le nombre de membres sont visibles.
- **Visible dans Explorer** (réglage) : décoché, le groupe n'existe plus pour ceux qui n'ont pas son lien.
- Un groupe peut passer de public à privé et inversement ; en redevenant public, ceux qui attendaient entrent.
  Les groupes d'origine (villes, entraide…) et les groupes d'annonces restent publics.

## Traduction automatique

Chacun lit dans sa langue. Un francophone voit en français le message d'un russophone, qui voit lui-même en russe
la réponse — dans les groupes, dans la liste des discussions et pour le message épinglé. Sous chaque message
traduit : « Traduit du russe · Voir l'original ».

- **Messages des groupes** (publics ou privés) : traduits par le serveur, **une seule fois par langue**, puis conservés. Le deuxième
  lecteur ne coûte rien. Un message modifié est retraduit, un message supprimé emporte ses traductions.
- **Messages privés** : ils sont chiffrés de bout en bout, le serveur ne peut donc pas les traduire. Ils ne le sont
  que si leur lecteur l'active : par sa propre IA s'il en a connecté une (rien ne passe par OlimTalk), sinon son
  appareil envoie le texte au service de traduction (OlimTalk n'en garde rien). C'est expliqué au moment de l'activer.
- **Réglages** (*Profil → Traduction automatique*) : tout couper, ou indiquer les langues qu'on lit déjà
  (« Je lis aussi : English, עברית… ») pour qu'elles ne soient pas traduites.
- La langue de chaque message est reconnue sur l'appareil (`shared/lang.ts`) : ce qui est reconnu comme étant dans la langue du
  lecteur n'est pas envoyé à la traduction.

**À activer côté serveur** : une clé suffit (`ANTHROPIC_API_KEY`, traduction par Claude), ou n'importe quel service
compatible « chat completions » — voir [`.env.example`](.env.example). Chaque nouvelle traduction est facturée par
ce service à l'exploitant ; `TRANSLATE_MODEL` permet de choisir un modèle moins cher et `TRANSLATE_HOURLY_LIMIT`
plafonne l'usage par personne. Sans réglage, la traduction serveur est coupée et chacun peut traduire avec sa propre IA.

Pas encore traduits : les sondages, les fiches d'événements, les stories et les noms de groupes.

## Mes connexions : IA, agenda, boîte mail

Chacun branche ses propres comptes, quel que soit le fournisseur ; rien n'est imposé.

- **Mon IA, en me connectant à mon compte** — « Se connecter avec OpenRouter » : la personne se connecte sur la page
  d'OpenRouter (un seul compte pour les modèles d'OpenAI, Anthropic, Google, Mistral…), OlimTalk reçoit l'accès
  automatiquement, sans clé à copier, et **les réponses s'affichent dans OlimTalk**. L'accès reçu est enregistré
  chiffré par le mot de passe de la personne ; l'usage est facturé sur son compte OpenRouter. Sur le téléphone, la
  connexion se fait dans le navigateur puis revient dans l'application.
- **Mon IA, sans clé (mode relais)** — la personne choisit l'application d'IA qu'elle utilise déjà (ChatGPT, Claude,
  Gemini, Le Chat, Copilot, ou « Autre application »). Pour traduire ou expliquer un message, résumer un groupe,
  comprendre un e-mail ou poser une question, OlimTalk rédige la demande, la copie et ouvre cette application avec
  le compte de la personne. Aucune clé, aucun coût pour l'exploitant, rien ne passe par le serveur ; la réponse se
  lit dans l'application d'IA. Limite : rien d'automatique dans ce mode (pas de traduction automatique ni de
  réponse affichée dans OlimTalk), car les abonnements grand public ne peuvent pas être pilotés par une autre
  application.
- **Mon IA, avec une clé** — la personne saisit sa clé d'accès (Claude, ChatGPT, Gemini, Mistral, ou l'adresse de tout service
  compatible OpenAI, y compris un modèle hébergé chez soi). La clé est enregistrée chiffrée par son mot de passe et
  les demandes partent **directement de son appareil vers son fournisseur** : le serveur OlimTalk ne voit ni la clé
  ni les textes. Elle sert à traduire un message, expliquer un e-mail en hébreu, résumer une discussion, corriger ou
  traduire un brouillon, et à discuter avec « Mon assistant ».
- **Mon agenda** — dans un sens, un lien privé (`.ics`) auquel on abonne Google Agenda, Outlook, Apple Calendrier
  ou tout autre agenda : les événements OlimTalk auxquels on participe s'y ajoutent seuls, et chaque événement a un
  bouton « Ajouter à mon agenda ». Dans l'autre, on colle l'adresse privée de son agenda pour voir ses rendez-vous
  dans l'onglet Événements.
- **Ma boîte mail** — une adresse de transfert privée : tout e-mail qu'on y transfère (depuis Gmail, Outlook ou
  autre) arrive dans OlimTalk, où l'IA de la personne peut l'expliquer et le traduire. À activer côté serveur :
  `MAIL_DOMAIN`, puis soit `SMTP_PORT` avec un enregistrement MX vers le serveur, soit un service de réception qui
  poste les messages sur `/api/inbound/email` (voir [`.env.example`](.env.example)).

Se connecter directement avec son **abonnement ChatGPT ou Claude** n'est pas inclus : OpenAI réserve pour l'instant
l'usage de l'abonnement aux applications partenaires, sur candidature, et Anthropic n'autorise pas l'usage d'un
abonnement Claude dans une application tierce. D'ici là : le compte OpenRouter, le mode relais, ou une clé.
(État en novembre 2026, d'après la presse spécialisée : à vérifier auprès de chaque fournisseur avant de s'engager.)

La connexion en un clic « Se connecter avec Google / Microsoft » (lecture directe de la boîte et de l'agenda) n'est
pas incluse : elle exige d'enregistrer l'application auprès de Google et de Microsoft et de passer leur validation.

## Applications iOS et Android

OlimTalk est distribué comme une **application** pour l'App Store et Google Play. Les projets natifs sont dans
`ios/` et `android/` ; ils embarquent la même interface que le site et se connectent à votre serveur.

```bash
VITE_API_URL=https://votre-domaine npm run build:app   # fabrique l'interface et l'installe dans les deux projets
npm run android                                         # ouvre le projet dans Android Studio
npm run ios                                             # ouvre le projet dans Xcode (Mac)
```

Chaque modification est compilée automatiquement pour les deux plateformes sur GitHub (*Actions → Mobile apps*),
et l'application Android de test s'y télécharge. La marche à suivre complète jusqu'aux boutiques est dans
**[docs/PUBLIER.md](docs/PUBLIER.md)**.

Le site reste utile : c'est lui qui accueille les personnes qui ouvrent un lien d'invitation sans avoir encore
l'application, et il sert de version ordinateur.

## Lancer en local

Il faut [Node.js](https://nodejs.org) 22 ou plus récent.

```bash
npm install
npm run dev        # API sur :3000, application sur http://localhost:5173
```

Pour la version de production :

```bash
npm run build
npm start          # tout est servi sur http://localhost:3000
```

Vérifications : `npm test` (API de bout en bout, chiffrement, connecteurs IA, agenda) et `npm run typecheck`.

## Mettre en ligne

L'application est un seul serveur Node qui sert l'API, le temps réel et le site. **Sa base de données est
embarquée** (un fichier SQLite) : il n'y a rien à relier, il lui faut seulement un **disque persistant** pour ce
fichier et pour les fichiers envoyés.

**Le plus simple** : [Render](https://render.com) → *New → Blueprint* → ce dépôt. Le fichier [`render.yaml`](render.yaml)
déclare le serveur, son disque et les trois valeurs à renseigner ; le détail est dans
[docs/PUBLIER.md](docs/PUBLIER.md). L'image du serveur est construite et essayée à chaque modification sur GitHub
(*Actions → Mobile apps → Server image*).

Ou à la main, chez n'importe quel hébergeur de conteneurs :

```bash
docker build -t olimtalk .
docker run -p 3000:3000 -v olimtalk-data:/data \
  -e PUBLIC_URL=https://votre-domaine -e ADMIN_EMAILS=vous@example.com olimtalk
```

N'importe quel hébergeur qui exécute une image Docker avec un volume convient (Render, Railway,
Fly.io, un VPS…). Placez le serveur derrière HTTPS : le micro (messages vocaux), les notifications
et le partage natif du téléphone ne fonctionnent que sur un site sécurisé.

Les réglages se font par variables d'environnement, décrites dans [`.env.example`](.env.example).
Les comptes listés dans `ADMIN_EMAILS` voient les signalements dans *Profil → Modération*.

## Organisation du code

```
server/            API Express, temps réel Socket.IO, base SQLite
  core.ts          logique métier : adhésions, envoi, sérialisation
  routes/          comptes, groupes, messages, communautés, événements, stories, fichiers, modération
  seed.ts          groupes et communautés de départ des quatre mondes
  test/            tests de bout en bout de l'API
  routes/connect.ts  agenda (.ics) et boîte mail ; smtp.ts : réception directe des e-mails
  translate.ts     service de traduction (Claude ou compatible) ; routes/translate.ts : traductions mises en cache
shared/            types et données communs (villes, mondes)
  e2e.ts           chiffrement de bout en bout (Web Crypto), commun au site, aux applications et aux tests
  lang.ts          reconnaissance de la langue d'un message
web/src/           interface React (Vite), commune au site et aux applications
  locales/         traductions fr / en / es / ru
  content/         contenu du guide d'intégration et liens officiels
  lib/e2ee.ts      clés sur l'appareil, messages et fichiers chiffrés, coffre des connexions
  lib/ai/          un connecteur par fournisseur d'IA (SDK officiel pour Claude) ; relay.ts : mode relais, sans clé ;
                   openrouter.ts : connexion à son compte (OAuth PKCE)
  lib/translate.ts traduction automatique : quoi traduire, par qui, et où le résultat est gardé
  lib/platform.ts  site ou application : adresse du serveur, session, liens externes
  lib/native.ts    pont avec le téléphone : bouton retour, liens d'invitation, barres système
android/, ios/     projets natifs (Capacitor)
assets/            images sources des icônes et de l'écran de démarrage
docs/PUBLIER.md    publication sur l'App Store et Google Play
```

## Limites connues et suite possible

- **Connexion par e-mail et mot de passe.** La connexion par numéro de téléphone (SMS) demande un
  prestataire d'envoi. Il n'y a pas de « mot de passe oublié » : le mot de passe verrouille les
  messages privés, et une réinitialisation par e-mail ne pourrait que créer de nouvelles clés
  (anciens messages privés illisibles). Une clé de secours à noter à l'inscription serait la suite logique.
- **Notifications push** (application fermée) : à brancher sur vos comptes Firebase et Apple, voir
  [docs/PUBLIER.md](docs/PUBLIER.md). Sur le site, les notifications du navigateur fonctionnent.
- **Chiffrement** : voir les limites dans « Protection des données ». Le dispositif n'a pas fait
  l'objet d'un audit de sécurité indépendant ; c'est à prévoir avant une large ouverture.
- **Appels audio / vidéo** : non inclus.
- **Montée en charge** : SQLite et le stockage local conviennent très bien pour démarrer. Pour une
  forte audience, passer à PostgreSQL, à un stockage de fichiers type S3 et à plusieurs serveurs.
- **Guide d'intégration** : information générale à faire relire. Les adresses des sites officiels
  ont été vérifiées par recherche en novembre 2026 ; les démarches et les liens changent, un
  contrôle régulier est nécessaire.
- **Avant l'ouverture au public** : faire relire les conditions d'utilisation et la politique de
  confidentialité fournies (`/terms`, `/privacy`), et prévoir une équipe de modération par monde.
