// src/constants/aula.ts
export const AULA_OAUTH = {
  authorizationUrl:
    'https://login.aula.dk/simplesaml/module.php/oidc/authorize.php',
  tokenUrl:
    'https://login.aula.dk/simplesaml/module.php/oidc/token.php',
  clientId: '_99949a54b8b65423862aac1bf629599ed64231607a',
  redirectUri: 'https://app-private.aula.dk',
  scope: 'aula-sensitive',
} as const;

// app-private.aula.dk is only the OAuth redirect URI (an S3 static site).
// The actual API lives on www.aula.dk/api/v<N>/. Aula bumps N every few months
// and retires the old version at once. Every version except the live one answers
// HTTP 410 / code:10 ("Gone"), authenticated or not: the retired ones and the ones
// that don't exist yet alike. The live one answers 403 / code:448 without a login.
// Checked 2026-11-21: v25 is live; v24 and below, and v26 and up, answer 410.
// aula-api.ts moves up from AULA_API_VERSION by itself when it meets a 410, so a
// new version doesn't break the app; raising the number here saves those requests.
export const AULA_API_ROOT = 'https://www.aula.dk/api/';
export const AULA_API_VERSION = 25;
// How many versions past AULA_API_VERSION the client tries before it gives up.
export const AULA_API_VERSION_LOOKAHEAD = 10;

export const AULA_METHODS = {
  profilesByLogin: 'profiles.getProfilesByLogin',
  profileContext: 'profiles.getProfileContext',
  dailyOverview: 'presence.getDailyOverview',
  threads: 'messaging.getThreads',
  messagesForThread: 'messaging.getMessagesForThread',
  albums: 'gallery.getAlbums',
  media: 'gallery.getMedia',
  presenceTemplates: 'presence.getPresenceTemplates',
  posts: 'posts.getAllPosts',
  notifications: 'notifications.getNotificationsForActiveProfile',
  // Note the capital N — Aula is case-sensitive here (matches the web client).
  deleteNotifications: 'Notifications.deleteNotifications',
  createMessage: 'messaging.createMessage',
} as const;
