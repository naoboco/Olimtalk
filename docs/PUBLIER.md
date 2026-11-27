# Publier OlimTalk sur l'App Store et Google Play

Ce guide décrit le chemin entre le code de ce dépôt et les deux boutiques d'applications.

## Où en est-on

| | État |
|---|---|
| Projet Android (`android/`) | compile ; un fichier d'installation de test est produit à chaque modification |
| Projet iOS (`ios/`) | compile (vérifié sur simulateur, sans signature) |
| Exigences des boutiques déjà dans l'application | suppression du compte, signalement, blocage, règles de la communauté, politique de confidentialité |
| Protection des données | messages privés chiffrés de bout en bout, appareils connectés, réglages de confidentialité |
| Reste à votre charge | héberger le serveur, ouvrir les comptes développeur, signer et envoyer les applications |

Les applications ne contiennent que l'interface. Elles parlent à **votre serveur OlimTalk**, qui doit donc être en
ligne avant tout le reste.

## 1. Mettre le serveur en ligne

**La base de données est déjà dans l'application.** C'est un fichier (SQLite) que le serveur crée et tient à jour
lui-même : il n'y a pas de base à « relier ». Il faut un hébergeur qui fait tourner le serveur, en **HTTPS**, et lui
donne un **disque persistant** où vivent la base et les fichiers envoyés.

### Le chemin recommandé : Render

Le fichier [`render.yaml`](../render.yaml) décrit tout ; il n'y a rien à installer.

1. Créez un compte sur [render.com](https://render.com) en vous connectant avec GitHub.
2. *New → Blueprint*, choisissez le dépôt OlimTalk.
3. Renseignez les trois valeurs demandées : `ADMIN_EMAILS` (votre adresse e-mail), `LEGAL_OPERATOR` et
   `LEGAL_CONTACT`. Validez : Render construit le serveur, lui attache un disque de 5 Go et lui donne une adresse en
   HTTPS (`https://….onrender.com`).
4. Ouvrez cette adresse : c'est OlimTalk. Créez-y votre compte avec l'adresse d'`ADMIN_EMAILS` pour être modérateur.
5. Passez à l'étape 2 pour donner cette adresse aux applications.

À savoir : le disque persistant demande une offre payante (serveur « starter » + disque facturé au Go ; vérifiez les
tarifs de Render). Render prend un instantané du disque chaque jour. Chaque modification poussée sur GitHub
redéploie le serveur, avec une courte coupure. Pour utiliser votre propre nom de domaine : *Settings → Custom
Domains*, puis ajoutez `PUBLIC_URL=https://votre-domaine` dans *Environment*.

Quand l'audience grandira (plusieurs milliers de personnes actives), il faudra passer à PostgreSQL et à un stockage
de fichiers séparé : c'est un chantier à prévoir, pas un préalable.

### Un autre hébergeur

Tout hébergeur qui exécute une image Docker avec un volume convient (Railway, Fly.io, un VPS…) : voir la section
« Mettre en ligne » du [README](../README.md). Renseignez au minimum :

```
PUBLIC_URL=https://votre-domaine
ADMIN_EMAILS=vous@example.com
LEGAL_OPERATOR=Nom de votre association ou société
LEGAL_CONTACT=contact@votre-domaine
```

Pour activer la **traduction automatique** (un message russe s'affiche en français, et inversement), ajoutez la clé
d'un service de traduction : `ANTHROPIC_API_KEY` suffit. Ce service vous facture chaque nouvelle traduction ;
`TRANSLATE_MODEL` et `TRANSLATE_HOURLY_LIMIT` permettent de maîtriser le coût (voir [`.env.example`](../.env.example)).

Pour activer « Ma boîte mail » (facultatif), ajoutez `MAIL_DOMAIN` et l'un des deux modes de réception décrits dans
[`.env.example`](../.env.example) : un port SMTP avec un enregistrement MX vers le serveur, ou un service de réception
d'e-mails qui poste les messages sur `/api/inbound/email`. Sans `MAIL_DOMAIN`, la fonction est simplement masquée.

Vérifiez ensuite que `https://votre-domaine/privacy` et `https://votre-domaine/terms` s'affichent sans le bandeau
« document incomplet ». **Faites relire ces deux textes** : ils décrivent fidèlement le fonctionnement de
l'application, mais ce sont des modèles. L'âge minimal indiqué (16 ans) est un choix à confirmer.

## 2. Donner l'adresse du serveur aux applications

L'adresse est inscrite dans l'application au moment de sa fabrication.

- **Sur GitHub** (pour les fichiers de test) : *Settings → Secrets and variables → Actions → Variables → New
  repository variable*, nom `OLIMTALK_SERVER_URL`, valeur `https://votre-domaine`. Puis *Actions → Mobile apps → Run
  workflow*.
- **Sur votre ordinateur** : `VITE_API_URL=https://votre-domaine npm run build:app`

## 3. Essayer l'application Android sur un téléphone

*Actions → dernière exécution de « Mobile apps » → Artifacts → `olimtalk-android-test-build`*. Le fichier
`app-debug.apk` qu'il contient s'installe directement sur un téléphone Android (il faut accepter l'installation
depuis une source inconnue). C'est une version de test, pas celle que l'on envoie à Google.

## 4. Choisir l'identifiant définitif de l'application

L'identifiant actuel est `com.olimtalk.app`. **Il ne peut plus changer après la première publication.** L'usage est de
prendre votre nom de domaine à l'envers (`il.co.olimtalk`, par exemple). Pour le changer, modifiez-le partout :

- `capacitor.config.ts` : `appId`
- `android/app/build.gradle` : `namespace` et `applicationId`
- `android/app/src/main/res/values/strings.xml` : `package_name` et `custom_url_scheme`
- `android/app/src/main/java/com/olimtalk/app/MainActivity.java` : la ligne `package`, et le dossier lui-même
- iOS : dans Xcode, cible *App → Signing & Capabilities → Bundle Identifier*

## 5. Google Play

1. Créez un compte développeur Google Play (frais d'inscription uniques).
2. Installez [Android Studio](https://developer.android.com/studio), puis `npm run android`.
3. *Build → Generate Signed App Bundle* : créez une clé de signature et **conservez-la précieusement**, avec son mot
   de passe. Le fichier `.aab` obtenu est celui que l'on envoie à Google.
4. À chaque nouvel envoi, augmentez `versionCode` (et `versionName`) dans `android/app/build.gradle`.
5. Dans la Play Console :
   - fiche de l'application (textes et captures, idéalement dans les quatre langues) ;
   - questionnaire de classification du contenu : l'application contient du contenu publié par les utilisateurs ;
   - formulaire « Sécurité des données » : nom, e-mail, messages, photos / vidéos, enregistrements audio, e-mails
     transférés par l'utilisateur ; données chiffrées en transit ; aucune donnée vendue ni partagée à des fins
     publicitaires ; suppression possible. Les textes envoyés à l'IA de l'utilisateur partent de son appareil vers
     le fournisseur qu'il a choisi, avec sa propre clé : décrivez-le tel quel. Si la traduction automatique est
     activée, le texte des messages de groupe est transmis à votre service de traduction : déclarez-le aussi ;
   - adresse de la politique de confidentialité : `https://votre-domaine/privacy` ;
   - suppression du compte : dans l'application (*Profil → Supprimer mon compte*) et sur le site, même chemin.
6. Les comptes développeur personnels récents doivent d'abord mener un test fermé avec un nombre minimal de testeurs
   pendant plusieurs jours avant d'accéder à la production. Vérifiez la règle en vigueur dans la Play Console.

## 6. App Store

1. Adhérez à l'Apple Developer Program (abonnement annuel).
2. Il faut un **Mac** avec Xcode : `npm run ios`, puis dans Xcode sélectionnez votre équipe (*Signing &
   Capabilities*), *Product → Archive*, *Distribute App → App Store Connect*.
   Sans Mac, la compilation peut se faire sur les machines macOS de GitHub : le flux `.github/workflows/apps.yml`
   compile déjà l'application ; il reste à y ajouter la signature et l'envoi.
3. À chaque nouvel envoi, augmentez le numéro de version et de build dans Xcode (*General → Identity*).
4. Dans App Store Connect : fiche, captures d'écran, réponses « Confidentialité de l'app », adresse de la politique de
   confidentialité, classification par âge.
   - **Chiffrement (conformité à l'exportation)** : Apple demande à chaque envoi si l'application utilise du
     chiffrement. Répondez oui : en plus du HTTPS, OlimTalk chiffre les messages privés avec des algorithmes standards
     fournis par le système (Web Crypto : AES-256-GCM, ECDH P-256, PBKDF2). Suivez ensuite le questionnaire d'Apple ;
     selon vos réponses et les pays de diffusion (la France notamment), une déclaration peut être demandée. C'est une
     déclaration faite en votre nom : en cas de doute, faites-la valider.
5. Notes pour l'équipe de validation d'Apple, à remplir avec soin :
   - un **compte de démonstration** (e-mail et mot de passe) ;
   - contenu publié par les utilisateurs : chaque message, groupe, story et profil peut être signalé, toute personne
     peut être bloquée, les règles sont acceptées à l'inscription et publiées sur `/terms`, une équipe de modération
     traite les signalements ;
   - suppression du compte : *Profil → Supprimer mon compte*.
6. Apple refuse parfois les applications qu'il juge trop proches d'un simple site web. Le partage natif, les messages
   vocaux et l'interface de type application jouent en votre faveur ; les notifications push (ci-dessous) renforceraient
   nettement le dossier.

## 7. Ce qu'il reste à ajouter

- **Notifications push** quand l'application est fermée. Elles passent par vos propres comptes (Firebase pour Android,
  clé APNs pour iOS) : elles ne peuvent être branchées et testées qu'une fois ces comptes créés. C'est la prochaine
  étape naturelle pour une messagerie.
- **Liens universels** : aujourd'hui un lien d'invitation ouvre la page web du groupe, qui propose « Ouvrir dans
  l'application » (lien `olimtalk://join/…`) et les boutons des boutiques une fois `APP_STORE_URL` et `PLAY_STORE_URL`
  renseignés sur le serveur. L'ouverture directe de l'application depuis un lien `https://` demande de déclarer votre
  domaine dans les deux projets natifs.
- **Connexion par numéro de téléphone** (prestataire d'envoi requis). Pour le mot de passe oublié, voir le README :
  le mot de passe verrouille les messages privés, une clé de secours serait la bonne réponse.
- **« Se connecter avec OpenRouter »** est déjà en place. À vérifier une fois le site en ligne en HTTPS : la connexion
  depuis le site, puis depuis un vrai téléphone (le navigateur doit revenir dans l'application par le lien
  `olimtalk://`). OpenRouter renvoie la personne vers `https://votre-domaine/connect/openrouter`.
- **« Se connecter avec ChatGPT »** : OpenAI permet à ses abonnés d'utiliser leur forfait dans des applications
  partenaires, mais l'accès se fait sur candidature auprès d'OpenAI. Si OlimTalk est accepté, l'abonnement ChatGPT
  pourra servir directement dans l'application. En attendant : le compte OpenRouter ou le mode relais. Anthropic n'autorise pas cet usage pour les abonnements Claude. (État en novembre
  2026, d'après la presse spécialisée : à vérifier auprès de chaque fournisseur.)
- **« Se connecter avec Google / Microsoft »** pour lire directement la boîte mail et l'agenda : cela demande
  d'enregistrer l'application auprès de Google et de Microsoft (et de passer leur validation de sécurité pour l'accès
  aux e-mails). En attendant, l'agenda passe par le lien `.ics` et la boîte mail par l'adresse de transfert, qui
  fonctionnent avec tous les fournisseurs.
- **Audit de sécurité** du chiffrement par un tiers avant une large ouverture.

## 8. Mettre l'application à jour

Modifiez le code, augmentez les numéros de version, refaites `npm run build:app`, puis renvoyez l'application à chaque
boutique. Une modification du **serveur** seul ne demande pas de republier les applications.

Pour refaire les icônes et l'écran de démarrage à partir des images du dossier `assets/` :

```bash
npx @capacitor/assets generate --iconBackgroundColor '#FFFFFF' --iconBackgroundColorDark '#FFFFFF' \
  --splashBackgroundColor '#2F6BFF' --splashBackgroundColorDark '#0F1218' --ios --android
```
