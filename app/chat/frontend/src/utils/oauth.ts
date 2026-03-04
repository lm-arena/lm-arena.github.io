const GITHUB_CLIENT_ID = 'Ov23li3dnFMUNHbu1SjZ';
const OAUTH_CALLBACK_ORIGIN = 'https://neevs.io';

export interface GitHubAuth {
  token: string;
  username: string;
  name?: string;
}

export async function connectGitHub(): Promise<GitHubAuth> {
  const state = crypto.randomUUID() + '|lm-arena';
  const redirectUri = `${OAUTH_CALLBACK_ORIGIN}/auth/`;

  const authUrl = new URL('https://github.com/login/oauth/authorize');
  authUrl.searchParams.set('client_id', GITHUB_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('state', state);

  const width = 500;
  const height = 600;
  const left = window.screenX + (window.innerWidth - width) / 2;
  const top = window.screenY + (window.innerHeight - height) / 2;

  return new Promise((resolve, reject) => {
    const popup = window.open(
      authUrl.toString(),
      'github-oauth',
      `width=${width},height=${height},left=${left},top=${top},popup=yes`
    );

    if (!popup) {
      reject(new Error('Popup blocked. Please allow popups for this site.'));
      return;
    }

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== OAUTH_CALLBACK_ORIGIN) return;
      const { type, auth } = event.data || {};
      if (type !== 'gh-auth') return;

      window.removeEventListener('message', handleMessage);
      clearInterval(pollTimer);

      if (!auth) { reject(new Error('Authentication failed')); return; }
      resolve({ token: auth.token, username: auth.login, name: auth.user?.name || undefined });
    };

    window.addEventListener('message', handleMessage);

    const pollTimer = setInterval(() => {
      if (popup.closed) {
        clearInterval(pollTimer);
        window.removeEventListener('message', handleMessage);
        reject(new Error('OAuth flow cancelled'));
      }
    }, 500);
  });
}
