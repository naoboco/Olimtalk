// Privacy policy and terms of use, served at /privacy and /terms.
// Both app stores require a public privacy-policy address, and apps with
// user-generated content must publish their rules. The texts describe what this
// software actually does; the operator's name and contact come from the environment.
// They are a starting point: have them reviewed before opening to the public.
import { escapeHtml } from './util.ts';

const OPERATOR = (process.env.LEGAL_OPERATOR || '').trim();
const CONTACT = (process.env.LEGAL_CONTACT || '').trim();

/** Public settings the website and the apps read at start-up. */
export function publicConfig() {
  return {
    appStoreUrl: (process.env.APP_STORE_URL || '').trim() || null,
    playStoreUrl: (process.env.PLAY_STORE_URL || '').trim() || null,
    contact: CONTACT || null,
  };
}

function page(title: string, body: string): string {
  const operator = escapeHtml(OPERATOR || '—');
  const contact = CONTACT ? `<a href="mailto:${escapeHtml(CONTACT)}">${escapeHtml(CONTACT)}</a>` : '—';
  const incomplete =
    OPERATOR && CONTACT
      ? ''
      : `<p class="warn">⚠️ Document incomplet / Incomplete document — l'exploitant doit renseigner son nom et son adresse de contact
         (LEGAL_OPERATOR, LEGAL_CONTACT).</p>`;
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · OlimTalk</title>
<link rel="icon" type="image/svg+xml" href="/logo.svg">
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; font: 16px/1.6 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; background: #f4f2ee; color: #1b1f2a; }
  main { max-width: 760px; margin: 0 auto; padding: 32px 20px 64px; }
  header { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; }
  header img { width: 44px; height: 44px; }
  header a { font-size: 22px; font-weight: 800; color: inherit; text-decoration: none; }
  h1 { font-size: 28px; line-height: 1.2; margin: 0 0 4px; }
  h2 { font-size: 19px; margin: 28px 0 6px; }
  hr { border: 0; border-top: 1px solid #d9d4c9; margin: 40px 0; }
  a { color: #2f6bff; }
  .muted { color: #5e6577; }
  .warn { padding: 12px 14px; border-radius: 12px; background: #ffe9e9; color: #b3261e; }
  nav { margin: 12px 0 28px; display: flex; gap: 16px; flex-wrap: wrap; }
  @media (prefers-color-scheme: dark) { body { background: #0f1218; color: #e8ebf2; } .muted { color: #a3abbd; } hr { border-color: #2a3140; } a { color: #7aa2ff; } }
</style>
</head>
<body><main>
<header><img src="/logo.svg" alt=""><a href="/">OlimTalk</a></header>
<nav><a href="/privacy">Confidentialité · Privacy</a><a href="/terms">Conditions · Terms</a></nav>
${incomplete}
${body.replaceAll('{operator}', operator).replaceAll('{contact}', contact)}
</main></body></html>`;
}

const PRIVACY = `
<h1>Politique de confidentialité</h1>
<p class="muted">Exploitant : {operator} · Contact : {contact}</p>

<h2>En bref</h2>
<p>OlimTalk est une messagerie communautaire. <strong>Les groupes sont publics</strong> : tout ce que vous y publiez
peut être lu par les autres utilisateurs. Nous ne vendons pas vos données, nous n'affichons pas de publicité et
nous n'utilisons aucun traceur publicitaire.</p>

<h2>Données que nous traitons</h2>
<ul>
  <li><strong>Compte</strong> : nom, adresse e-mail, mot de passe (conservé sous forme chiffrée non réversible).</li>
  <li><strong>Profil</strong>, visible des autres utilisateurs : nom d'utilisateur, photo, bio, profil (étudiant, entrepreneur…),
      ville, année d'alyah, langue choisie.</li>
  <li><strong>Contenus</strong> : messages, photos, vidéos, documents, messages vocaux, stories, sondages, événements, réactions.</li>
  <li><strong>Technique</strong> : session de connexion, date de dernière activité, état « en ligne ».</li>
</ul>

<h2>Qui voit quoi</h2>
<ul>
  <li>Les <strong>groupes et communautés</strong> sont publics : nom, description et messages sont visibles de tout utilisateur ;
      le nom et la description d'un groupe sont visibles de toute personne disposant de son lien d'invitation.</li>
  <li>Les <strong>conversations privées</strong> ne sont visibles que des deux participants. Elles sont protégées pendant leur
      transport et sur nos serveurs, mais ne sont pas chiffrées de bout en bout.</li>
  <li>Les <strong>stories</strong> sont visibles pendant 24 heures par les utilisateurs de votre « monde » linguistique.</li>
  <li>Un contenu <strong>signalé</strong> est consulté par l'équipe de modération.</li>
</ul>

<h2>Autorisations de l'application</h2>
<p>Le micro, l'appareil photo et la photothèque ne sont utilisés que lorsque vous choisissez d'enregistrer un message vocal
ou d'envoyer une photo, une vidéo ou un fichier.</p>

<h2>Conservation et suppression</h2>
<p>Vos contenus sont conservés tant que vous ne les supprimez pas. Vous pouvez supprimer un message à tout moment, et
<strong>supprimer définitivement votre compte</strong> depuis l'application (Profil → Supprimer mon compte) : votre profil,
vos messages, vos stories et vos fichiers sont alors effacés. Les stories expirées sont effacées automatiquement.</p>

<h2>Vos droits</h2>
<p>Vous pouvez accéder à vos données, les corriger (Profil → Modifier mon profil) ou les supprimer. Pour toute demande,
écrivez à {contact}.</p>

<h2>Âge</h2>
<p>OlimTalk s'adresse aux personnes de 16 ans et plus.</p>

<hr>

<h1 lang="en">Privacy Policy</h1>
<p class="muted" lang="en">Operator: {operator} · Contact: {contact}</p>
<div lang="en">
<h2>In short</h2>
<p>OlimTalk is a community messenger. <strong>Groups are public</strong>: anything you post in a group can be read by other
users. We do not sell your data, we show no advertising and we use no advertising trackers.</p>

<h2>Data we process</h2>
<ul>
  <li><strong>Account</strong>: name, email address, password (stored as a non-reversible hash).</li>
  <li><strong>Profile</strong>, visible to other users: username, photo, bio, profile type (student, entrepreneur…), city,
      year of aliyah, chosen language.</li>
  <li><strong>Content</strong>: messages, photos, videos, documents, voice messages, stories, polls, events, reactions.</li>
  <li><strong>Technical</strong>: login session, last-activity date, "online" status.</li>
</ul>

<h2>Who sees what</h2>
<ul>
  <li><strong>Groups and communities</strong> are public: name, description and messages are visible to any user; a group's name
      and description are visible to anyone who has its invite link.</li>
  <li><strong>Private conversations</strong> are visible only to their two participants. They are protected in transit and on our
      servers, but are not end-to-end encrypted.</li>
  <li><strong>Stories</strong> are visible for 24 hours to the users of your language "world".</li>
  <li><strong>Reported</strong> content is reviewed by the moderation team.</li>
</ul>

<h2>App permissions</h2>
<p>The microphone, camera and photo library are used only when you choose to record a voice message or to send a photo,
a video or a file.</p>

<h2>Retention and deletion</h2>
<p>Your content is kept until you delete it. You can delete a message at any time, and <strong>permanently delete your
account</strong> from inside the app (Profile → Delete my account): your profile, messages, stories and files are then erased.
Expired stories are erased automatically.</p>

<h2>Your rights</h2>
<p>You can access your data, correct it (Profile → Edit my profile) or delete it. For any request, write to {contact}.</p>

<h2>Age</h2>
<p>OlimTalk is intended for people aged 16 and over.</p>
</div>`;

const TERMS = `
<h1>Conditions d'utilisation</h1>
<p class="muted">Exploitant : {operator} · Contact : {contact}</p>

<h2>Le service</h2>
<p>OlimTalk permet aux olim d'échanger dans des groupes publics, des communautés et des conversations privées, et propose
un guide d'intégration. Le service est fourni en l'état, sans garantie de disponibilité.</p>

<h2>Règles de la communauté</h2>
<p>En utilisant OlimTalk, vous vous engagez à ne pas publier de contenu :</p>
<ul>
  <li>haineux, discriminatoire, menaçant ou relevant du harcèlement ;</li>
  <li>illégal, ou incitant à commettre des actes illégaux ;</li>
  <li>à caractère sexuel explicite ou portant atteinte à des mineurs ;</li>
  <li>trompeur : arnaques, usurpation d'identité, publicité déguisée, spam ;</li>
  <li>portant atteinte à la vie privée ou aux droits d'autrui.</li>
</ul>
<p><strong>Aucune tolérance</strong> n'est accordée aux contenus répréhensibles ni aux comportements abusifs.</p>

<h2>Signalement et modération</h2>
<p>Chaque message, groupe, story et profil peut être signalé depuis l'application, et vous pouvez bloquer toute personne.
L'équipe de modération examine les signalements et peut retirer un contenu, supprimer un groupe ou suspendre un compte.</p>

<h2>Vos contenus</h2>
<p>Vous restez propriétaire de ce que vous publiez. Vous nous autorisez à l'héberger et à l'afficher aux autres utilisateurs
dans le cadre du service. Les groupes étant publics, ne publiez rien que vous ne souhaitez pas rendre visible.</p>

<h2>Guide d'intégration</h2>
<p>Le guide fournit une information générale et des liens vers des organismes officiels. Il ne constitue pas un conseil
juridique, médical, fiscal ou financier : vérifiez toujours auprès de l'organisme compétent.</p>

<h2>Fin d'utilisation</h2>
<p>Vous pouvez supprimer votre compte à tout moment depuis l'application. Nous pouvons suspendre un compte qui enfreint
ces règles.</p>

<hr>

<h1 lang="en">Terms of Use</h1>
<p class="muted" lang="en">Operator: {operator} · Contact: {contact}</p>
<div lang="en">
<h2>The service</h2>
<p>OlimTalk lets olim talk in public groups, communities and private conversations, and offers an integration guide.
The service is provided as is, without any guarantee of availability.</p>

<h2>Community rules</h2>
<p>By using OlimTalk, you agree not to post content that is:</p>
<ul>
  <li>hateful, discriminatory, threatening or harassing;</li>
  <li>illegal, or encouraging illegal acts;</li>
  <li>sexually explicit, or harmful to minors;</li>
  <li>deceptive: scams, impersonation, disguised advertising, spam;</li>
  <li>infringing other people's privacy or rights.</li>
</ul>
<p>There is <strong>no tolerance</strong> for objectionable content or abusive behaviour.</p>

<h2>Reporting and moderation</h2>
<p>Every message, group, story and profile can be reported from inside the app, and you can block anyone. The moderation
team reviews reports and may remove content, delete a group or suspend an account.</p>

<h2>Your content</h2>
<p>You keep ownership of what you post. You allow us to host it and show it to other users as part of the service.
Groups are public: do not post anything you do not want to be visible.</p>

<h2>Integration guide</h2>
<p>The guide gives general information and links to official bodies. It is not legal, medical, tax or financial advice:
always check with the relevant body.</p>

<h2>Ending use</h2>
<p>You can delete your account at any time from inside the app. We may suspend an account that breaks these rules.</p>
</div>`;

export const privacyPage = () => page('Confidentialité · Privacy', PRIVACY);
export const termsPage = () => page('Conditions · Terms', TERMS);
