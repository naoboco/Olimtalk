// Privacy policy and terms of use, served at /privacy and /terms.
// Both app stores require a public privacy-policy address, and apps with
// user-generated content must publish their rules. The texts describe what this
// software actually does; the operator's name and contact come from the environment.
// They are a starting point: have them reviewed before opening to the public.
import { translationEnabled, translationService } from './translate.ts';
import { escapeHtml } from './util.ts';

const OPERATOR = (process.env.LEGAL_OPERATOR || '').trim();
const CONTACT = (process.env.LEGAL_CONTACT || '').trim();

/** Public settings the website and the apps read at start-up. */
export function publicConfig() {
  return {
    appStoreUrl: (process.env.APP_STORE_URL || '').trim() || null,
    playStoreUrl: (process.env.PLAY_STORE_URL || '').trim() || null,
    contact: CONTACT || null,
    // Whether people can get a private forwarding address for their e-mails.
    mail: !!(process.env.MAIL_DOMAIN || '').trim(),
    // Whether this server translates messages into the reader's language.
    translate: translationEnabled(),
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
${body
  .replaceAll('{operator}', operator)
  .replaceAll('{contact}', contact)
  .replaceAll('{translator_fr}', escapeHtml(translationService() ?? 'non activé sur ce serveur'))
  .replaceAll('{translator_en}', escapeHtml(translationService() ?? 'not enabled on this server'))}
</main></body></html>`;
}

const PRIVACY = `
<h1>Politique de confidentialité</h1>
<p class="muted">Exploitant : {operator} · Contact : {contact}</p>

<h2>En bref</h2>
<p>OlimTalk est une messagerie communautaire. <strong>Les groupes publics sont lisibles par tous</strong> les utilisateurs ;
les <strong>groupes privés</strong> ne le sont que par leurs membres. Nous ne vendons pas vos données, nous n'affichons pas de publicité et
nous n'utilisons aucun traceur publicitaire.</p>

<h2>Données que nous traitons</h2>
<ul>
  <li><strong>Compte</strong> : nom, adresse e-mail. Votre <strong>mot de passe ne quitte jamais votre appareil</strong> : nous n'en
      recevons qu'une clé dérivée, elle-même conservée sous une forme non réversible.</li>
  <li><strong>Clés de chiffrement</strong> : votre clé publique, et votre clé privée uniquement sous une forme verrouillée par
      votre mot de passe, que nous ne pouvons pas ouvrir.</li>
  <li><strong>Profil</strong>, visible des autres utilisateurs : nom d'utilisateur, photo, bio, profil (étudiant, entrepreneur…),
      ville, année d'alyah, langue choisie.</li>
  <li><strong>Contenus</strong> : messages, photos, vidéos, documents, messages vocaux, stories, sondages, événements, réactions.</li>
  <li><strong>Technique</strong> : appareils connectés (type d'appareil ou de navigateur, dates de connexion et de dernière
      activité), état « en ligne ».</li>
</ul>

<h2>Qui voit quoi</h2>
<ul>
  <li>Les <strong>groupes publics et les communautés</strong> : nom, description et messages sont visibles de tout utilisateur ;
      le nom et la description d'un groupe sont visibles de toute personne disposant de son lien d'invitation.</li>
  <li>Les <strong>groupes privés</strong> : seuls leurs membres lisent les messages, voient les membres, les fichiers et les
      événements. On y entre avec l'accord d'un administrateur du groupe. Leur nom et leur description restent visibles de
      qui détient le lien d'invitation et, si le groupe est affiché dans Explorer, de tout utilisateur. Les groupes privés ne
      sont pas chiffrés de bout en bout : l'équipe de modération peut y accéder pour traiter un signalement, et leurs fichiers
      sont protégés par une adresse impossible à deviner.</li>
  <li>Les <strong>conversations privées sont chiffrées de bout en bout</strong> : le texte, les photos, vidéos, documents et
      messages vocaux sont chiffrés sur votre appareil et ne peuvent être lus que par vous et votre correspondant. Nous ne
      pouvons pas les lire. Nous voyons en revanche qui écrit à qui et quand, la taille des envois et les réactions (emoji).</li>
  <li>Si vous <strong>signalez un message privé</strong>, son contenu déchiffré est joint à votre signalement pour que la
      modération puisse le lire.</li>
  <li>Dans Profil → Sécurité, vous pouvez masquer votre présence en ligne et ne pas envoyer de confirmations de lecture.</li>
  <li>Les <strong>stories</strong> sont visibles pendant 24 heures par les utilisateurs de votre « monde » linguistique.</li>
  <li>Un contenu <strong>signalé</strong> est consulté par l'équipe de modération.</li>
</ul>

<h2>Vos connexions (facultatives)</h2>
<ul>
  <li><strong>Votre IA, sans clé</strong> : si vous choisissez d'ouvrir vos demandes dans votre propre application d'IA (ChatGPT,
      Claude, Gemini…), le texte concerné (un message à traduire ou à expliquer, une discussion à résumer, un e-mail) est copié
      et transmis à cette application, à votre demande et à chaque fois par un geste de votre part. Il est alors traité selon
      les conditions de cette application. OlimTalk ne le reçoit pas.</li>
  <li><strong>Votre IA, avec votre compte ou une clé</strong> : si vous connectez votre compte OpenRouter ou saisissez une clé
      (Claude, ChatGPT, Gemini, Mistral ou autre), votre clé
      d'accès est enregistrée chiffrée par votre mot de passe ; nous ne pouvons pas la lire. Les textes que vous lui soumettez
      (un message à traduire, un e-mail à expliquer, une discussion à résumer) partent de votre appareil directement vers le
      fournisseur que vous avez choisi, selon ses propres conditions. OlimTalk ne les reçoit pas.</li>
  <li><strong>Votre agenda</strong> : le lien privé de votre agenda OlimTalk montre, à quiconque le détient, les événements
      auxquels vous participez ; gardez-le pour vous, vous pouvez le renouveler à tout moment. Les adresses des agendas que
      vous connectez sont enregistrées chiffrées. L'application lit ces agendas directement ; sur le site web, leur lecture
      transite par notre serveur, qui n'en conserve rien.</li>
  <li><strong>Votre boîte mail</strong> : les e-mails que vous transférez à votre adresse OlimTalk sont reçus par notre serveur,
      puis chiffrés avec votre clé avant d'être enregistrés. Une fois enregistrés, nous ne pouvons plus les lire ; nous ne
      conservons en clair que leur date de réception et leur taille.</li>
</ul>

<h2>Traduction automatique</h2>
<p>Pour afficher dans votre langue un message écrit dans une autre, le texte des <strong>messages de groupe</strong> (publics ou privés) est transmis à
un service de traduction (actuellement : {translator_fr}), sans le nom de son auteur. La traduction est conservée avec le message
et effacée avec lui.</p>
<p>Vos <strong>conversations privées (à deux) ne sont jamais traduites de cette façon</strong>. Ils ne le sont que si vous l'activez
(Profil → Traduction automatique) : par votre propre IA si vous en avez connecté une, sinon votre appareil envoie le texte des
messages que vous recevez à ce service de traduction ; OlimTalk ne le conserve pas. Vous pouvez désactiver la traduction à
tout moment.</p>

<h2>Autorisations de l'application</h2>
<p>Le micro, l'appareil photo et la photothèque ne sont utilisés que lorsque vous choisissez d'enregistrer un message vocal
ou d'envoyer une photo, une vidéo ou un fichier.</p>

<h2>Conservation et suppression</h2>
<p>Vos contenus sont conservés tant que vous ne les supprimez pas. Vous pouvez supprimer un message à tout moment, et
<strong>supprimer définitivement votre compte</strong> depuis l'application (Profil → Supprimer mon compte) : votre profil,
vos messages, vos stories, vos fichiers, vos e-mails transférés et vos connexions sont alors effacés. Les stories expirées
sont effacées automatiquement.</p>
<p><strong>Mot de passe oublié</strong> : vos messages privés sont verrouillés par votre mot de passe. Sans lui, personne — pas
même nous — ne peut les récupérer.</p>

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
<p>OlimTalk is a community messenger. <strong>Public groups can be read by every user</strong>; <strong>private groups</strong>
only by their members. We do not sell your data, we show no advertising and we use no advertising trackers.</p>

<h2>Data we process</h2>
<ul>
  <li><strong>Account</strong>: name, email address. Your <strong>password never leaves your device</strong>: we only receive a
      key derived from it, itself stored in a non-reversible form.</li>
  <li><strong>Encryption keys</strong>: your public key, and your private key only in a form locked by your password, which we
      cannot open.</li>
  <li><strong>Profile</strong>, visible to other users: username, photo, bio, profile type (student, entrepreneur…), city,
      year of aliyah, chosen language.</li>
  <li><strong>Content</strong>: messages, photos, videos, documents, voice messages, stories, polls, events, reactions.</li>
  <li><strong>Technical</strong>: connected devices (type of device or browser, sign-in and last-activity dates), "online"
      status.</li>
</ul>

<h2>Who sees what</h2>
<ul>
  <li><strong>Public groups and communities</strong>: name, description and messages are visible to any user; a group's name
      and description are visible to anyone who has its invite link.</li>
  <li><strong>Private groups</strong>: only their members read the messages and see the members, files and events. People come
      in with the agreement of one of the group's administrators. Their name and description remain visible to whoever holds
      the invite link and, if the group is shown in Explore, to any user. Private groups are not end-to-end encrypted: the
      moderation team can access them to handle a report, and their files are protected by an address that cannot be
      guessed.</li>
  <li><strong>Private conversations are end-to-end encrypted</strong>: text, photos, videos, documents and voice messages are
      encrypted on your device and can only be read by you and the person you are writing to. We cannot read them. We do see
      who writes to whom and when, the size of what is sent, and reactions (emoji).</li>
  <li>If you <strong>report a private message</strong>, its decrypted content is attached to your report so that moderators can
      read it.</li>
  <li>In Profile → Security you can hide your online presence and stop sending read receipts.</li>
  <li><strong>Stories</strong> are visible for 24 hours to the users of your language "world".</li>
  <li><strong>Reported</strong> content is reviewed by the moderation team.</li>
</ul>

<h2>Your connections (optional)</h2>
<ul>
  <li><strong>Your AI, without a key</strong>: if you choose to open your requests in your own AI app (ChatGPT, Claude, Gemini…),
      the text concerned (a message to translate or explain, a chat to summarise, an e-mail) is copied and handed to that app,
      at your request and each time by an action of yours. It is then handled under that app's own terms. OlimTalk does not
      receive it.</li>
  <li><strong>Your AI, with your account or a key</strong>: if you connect your OpenRouter account or enter a key (Claude,
      ChatGPT, Gemini, Mistral or another), your access key
      is stored encrypted by your password; we cannot read it. The texts you submit to it (a message to translate, an e-mail to
      explain, a chat to summarise) go from your device straight to the provider you chose, under that provider's own terms.
      OlimTalk does not receive them.</li>
  <li><strong>Your calendar</strong>: the private link of your OlimTalk calendar shows the events you attend to anyone who holds
      it; keep it to yourself, and renew it whenever you like. The addresses of the calendars you connect are stored encrypted.
      The app reads those calendars directly; on the website, reading them passes through our server, which keeps nothing.</li>
  <li><strong>Your mailbox</strong>: e-mails you forward to your OlimTalk address are received by our server, then encrypted with
      your key before being stored. Once stored, we can no longer read them; we only keep their arrival date and size in the
      clear.</li>
</ul>

<h2>Automatic translation</h2>
<p>To show you a message written in another language in yours, the text of <strong>group messages</strong> (public or private) is sent to a
translation service (currently: {translator_en}), without its author's name. The translation is kept with the message and
erased with it.</p>
<p>Your <strong>private (one-to-one) conversations are never translated that way</strong>. They are translated only if you turn it on
(Profile → Automatic translation): by your own AI if you connected one, otherwise your device sends the text of the messages
you receive to that translation service; OlimTalk does not keep it. You can turn translation off at any time.</p>

<h2>App permissions</h2>
<p>The microphone, camera and photo library are used only when you choose to record a voice message or to send a photo,
a video or a file.</p>

<h2>Retention and deletion</h2>
<p>Your content is kept until you delete it. You can delete a message at any time, and <strong>permanently delete your
account</strong> from inside the app (Profile → Delete my account): your profile, messages, stories, files, forwarded
e-mails and connections are then erased. Expired stories are erased automatically.</p>
<p><strong>Forgotten password</strong>: your private messages are locked by your password. Without it nobody — not even us —
can recover them.</p>

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
dans le cadre du service. Dans un groupe public, ne publiez rien que vous ne souhaitez pas rendre visible de tous ; dans un
groupe privé, tous ses membres vous lisent.</p>

<h2>Guide d'intégration</h2>
<p>Le guide fournit une information générale et des liens vers des organismes officiels. Il ne constitue pas un conseil
juridique, médical, fiscal ou financier : vérifiez toujours auprès de l'organisme compétent.</p>

<h2>Votre IA, votre agenda, votre boîte mail</h2>
<p>Ces connexions sont facultatives et utilisent vos propres comptes auprès de services tiers : leur usage, leur coût éventuel
et leurs conditions relèvent de ces services. Les réponses d'une IA peuvent être inexactes : vérifiez toute information
importante auprès de l'organisme compétent.</p>

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
In a public group, do not post anything you do not want everyone to see; in a private group, all its members read you.</p>

<h2>Integration guide</h2>
<p>The guide gives general information and links to official bodies. It is not legal, medical, tax or financial advice:
always check with the relevant body.</p>

<h2>Your AI, your calendar, your mailbox</h2>
<p>These connections are optional and use your own accounts with third-party services: their use, any cost and their terms
are a matter between you and those services. Answers from an AI can be wrong: check anything important with the relevant
body.</p>

<h2>Ending use</h2>
<p>You can delete your account at any time from inside the app. We may suspend an account that breaks these rules.</p>
</div>`;

export const privacyPage = () => page('Confidentialité · Privacy', PRIVACY);
export const termsPage = () => page('Conditions · Terms', TERMS);
