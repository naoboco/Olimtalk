# OlimTalk

**La messagerie ouverte des olim.** Des groupes publics sans limite de membres, des communautés,
des stories, des événements et un guide d'intégration — dans quatre « mondes » linguistiques :
français, anglais, espagnol et russe.

## Ce que fait la plateforme

**Tout est public, comme un groupe Facebook.** N'importe qui peut trouver un groupe dans *Explorer*,
le lire sans s'inscrire au groupe, le rejoindre en un clic et le partager. Aucune limite de membres.
Seules les conversations privées (à deux) sont… privées.

| | |
|---|---|
| **Messagerie** | temps réel, réponses, réactions, modification, suppression (pour moi / pour tous), transfert, favoris, mentions `@`, recherche, indicateur de saisie, accusés de lecture en privé |
| **Messages épinglés** | par les admins, ou par tous si le groupe l'autorise |
| **Contenus** | photos, vidéos, documents, messages vocaux, sondages, événements avec inscription |
| **Groupes** | publics, lien d'invitation réinitialisable, QR code, admins, mode « annonces » (seuls les admins écrivent) |
| **Communautés** | plusieurs groupes réunis, avec un groupe d'annonces |
| **Stories** | texte, photo ou vidéo pendant 24 h, vues, réponse en privé |
| **Partage** | WhatsApp, Facebook, Telegram, X, e-mail, lien, et image « story » avec QR code pour Instagram |
| **Guide** | étapes clés et liens officiels selon le profil : étudiant, entrepreneur, salarié, médical, juridique |
| **Mondes** | FR · EN · ES · RU : langue de l'interface et groupes propres à chaque monde |
| **Modération** | signalements, blocage, bannissement, panneau pour les modérateurs |

Chaque monde démarre avec ses groupes : un par ville (23 villes), *Bienvenue & Entraide*,
*Événements & Sorties*, *Démarches*, *Logement*, *Hébreu & Oulpan*, le sport (football, running,
yoga/padel) et un groupe par profil. À l'inscription, on rejoint automatiquement le groupe de sa
ville et celui de son profil.

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

Vérifications : `npm test` (tests de bout en bout de l'API) et `npm run typecheck`.

## Mettre en ligne

L'application est un seul serveur Node qui sert l'API, le temps réel et le site. Elle a besoin d'un
**disque persistant** pour sa base de données et les fichiers envoyés.

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
shared/            types et données communs (villes, mondes)
web/src/           interface React (Vite), commune au site et aux applications
  locales/         traductions fr / en / es / ru
  content/         contenu du guide d'intégration et liens officiels
  lib/platform.ts  site ou application : adresse du serveur, session, liens externes
  lib/native.ts    pont avec le téléphone : bouton retour, liens d'invitation, barres système
android/, ios/     projets natifs (Capacitor)
assets/            images sources des icônes et de l'écran de démarrage
docs/PUBLIER.md    publication sur l'App Store et Google Play
```

## Limites connues et suite possible

- **Connexion par e-mail et mot de passe.** La connexion par numéro de téléphone (SMS) et la
  réinitialisation du mot de passe par e-mail demandent un prestataire d'envoi : à brancher.
- **Notifications push** (application fermée) : à brancher sur vos comptes Firebase et Apple, voir
  [docs/PUBLIER.md](docs/PUBLIER.md). Sur le site, les notifications du navigateur fonctionnent.
- **Pas de chiffrement de bout en bout** : les groupes sont publics par nature ; les messages privés
  sont protégés par le serveur, pas chiffrés de bout en bout.
- **Appels audio / vidéo** : non inclus.
- **Montée en charge** : SQLite et le stockage local conviennent très bien pour démarrer. Pour une
  forte audience, passer à PostgreSQL, à un stockage de fichiers type S3 et à plusieurs serveurs.
- **Guide d'intégration** : information générale à faire relire. Les adresses des sites officiels
  ont été vérifiées par recherche en novembre 2026 ; les démarches et les liens changent, un
  contrôle régulier est nécessaire.
- **Avant l'ouverture au public** : faire relire les conditions d'utilisation et la politique de
  confidentialité fournies (`/terms`, `/privacy`), et prévoir une équipe de modération par monde.
