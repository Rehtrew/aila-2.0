// __tests__/aula-api.test.ts
import {
  AULA_API_ROOT,
  AULA_API_VERSION,
  AULA_API_VERSION_LOOKAHEAD,
} from '../src/constants/aula';

jest.mock('../src/lib/token-storage');
jest.mock('../src/lib/auth');
// There is no native cookie store under Jest: no CSRF cookie has been stored.
jest.mock('@react-native-cookies/cookies', () => ({ default: { get: jest.fn(async () => ({})) } }));

const mockFetch = jest.fn();

let api: typeof import('../src/lib/aula-api');
let auth: { refreshTokens: jest.Mock };

const mockTokens = { accessToken: 'test-token', refreshToken: 'test-refresh' };
const mockProfile = { data: { profiles: [{ profileId: 1, displayName: 'Test', institutionProfiles: [] }] } };
const mockContext = { data: { children: [] } };
// What Aula answers, with HTTP 410, for every API version but the live one.
const GONE = { status: { code: 10, subCode: 0, errorInformation: [], message: '' }, data: null, trace: 'n/a' };

// A minimal stand-in for a fetch Response.
function reply(status: number, json: unknown = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => json,
    text: async () => JSON.stringify(json),
  };
}

const N = AULA_API_VERSION;
const urlAt = (i: number): string => mockFetch.mock.calls[i][0];
const versionAt = (i: number): number => Number(/\/api\/v(\d+)\//.exec(urlAt(i))?.[1]);

beforeEach(() => {
  // A fresh copy of the client for every test: the API version in use is module state.
  jest.resetModules();
  mockFetch.mockReset();
  api = require('../src/lib/aula-api');
  auth = require('../src/lib/auth');
  require('../src/lib/token-storage').getStoredTokens.mockResolvedValue(mockTokens);
  // Loading the modules again runs Expo's runtime again, which installs expo/fetch
  // as the global fetch (SDK 56). Put the mock back after it.
  Object.defineProperty(globalThis, 'fetch', { value: mockFetch, writable: true, configurable: true });
});

describe('getProfilesByLogin', () => {
  it('calls the correct API method', async () => {
    mockFetch.mockResolvedValueOnce(reply(200, mockProfile));

    await api.getProfilesByLogin();

    expect(urlAt(0)).toContain('method=profiles.getProfilesByLogin');
  });

  it('includes access_token in request URL', async () => {
    mockFetch.mockResolvedValueOnce(reply(200, mockProfile));

    await api.getProfilesByLogin();

    expect(urlAt(0)).toContain('access_token=test-token');
  });

  it('refreshes token on 401 and retries with new token', async () => {
    auth.refreshTokens.mockResolvedValueOnce({ accessToken: 'new-token', refreshToken: 'new-refresh' });
    mockFetch.mockResolvedValueOnce(reply(401)).mockResolvedValueOnce(reply(200, mockProfile));

    await api.getProfilesByLogin();

    expect(auth.refreshTokens).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(urlAt(1)).toContain('access_token=new-token');
  });

  it('does not retry more than once on 401', async () => {
    auth.refreshTokens.mockResolvedValueOnce({ accessToken: 'new-token', refreshToken: 'new-refresh' });
    mockFetch.mockResolvedValueOnce(reply(401)).mockResolvedValueOnce(reply(401));

    await expect(api.getProfilesByLogin()).rejects.toThrow('Aula API fejl: 401');
  });

  it('throws on non-401 errors without retrying', async () => {
    mockFetch.mockResolvedValueOnce(reply(500));

    await expect(api.getProfilesByLogin()).rejects.toThrow('Aula API fejl: 500');
    expect(auth.refreshTokens).not.toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe('getProfileContext', () => {
  it('includes portalrole=guardian in request', async () => {
    mockFetch.mockResolvedValueOnce(reply(200, mockContext));

    await api.getProfileContext();

    expect(urlAt(0)).toContain('portalrole=guardian');
  });
});

describe('API version', () => {
  it('starts at the version this build knows', async () => {
    mockFetch.mockResolvedValueOnce(reply(200, mockProfile));

    await api.getProfilesByLogin();

    expect(urlAt(0).startsWith(`${AULA_API_ROOT}v${N}/?`)).toBe(true);
    expect(api.getApiVersion()).toBe(N);
  });

  it('moves up one version when Aula answers 410, and stays there', async () => {
    mockFetch
      .mockResolvedValueOnce(reply(410, GONE))
      .mockResolvedValueOnce(reply(200, mockProfile))
      .mockResolvedValueOnce(reply(200, mockContext));

    await expect(api.getProfilesByLogin()).resolves.toEqual(mockProfile);
    await api.getProfileContext();

    expect([versionAt(0), versionAt(1), versionAt(2)]).toEqual([N, N + 1, N + 1]);
    expect(api.getApiVersion()).toBe(N + 1);
  });

  it('passes several retired versions', async () => {
    mockFetch
      .mockResolvedValueOnce(reply(410, GONE))
      .mockResolvedValueOnce(reply(410, GONE))
      .mockResolvedValueOnce(reply(200, mockProfile));

    await api.getProfilesByLogin();

    expect(versionAt(2)).toBe(N + 2);
    expect(api.getApiVersion()).toBe(N + 2);
  });

  it('sends a POST again at the new version', async () => {
    mockFetch
      .mockResolvedValueOnce(reply(410, GONE))
      .mockResolvedValueOnce(reply(200, { status: { code: 0 } }));

    await api.sendMessageToThread(7, 'Hej');

    expect(versionAt(1)).toBe(N + 1);
    expect(mockFetch.mock.calls[1][1]).toMatchObject({ method: 'POST' });
  });

  it('moves up only once when parallel requests meet the same 410', async () => {
    mockFetch.mockImplementation(async (url: string) =>
      url.includes(`/v${N}/`) ? reply(410, GONE) : reply(200, mockProfile),
    );

    await Promise.all([api.getProfilesByLogin(), api.getProfileContext(), api.getThreads()]);

    const versions = mockFetch.mock.calls.map((_, i) => versionAt(i));
    expect(Math.max(...versions)).toBe(N + 1);
    expect(api.getApiVersion()).toBe(N + 1);
  });

  it('gives up after the lookahead with a clear error, and looks again next time', async () => {
    mockFetch.mockImplementation(async () => reply(410, GONE));

    await expect(api.getProfilesByLogin()).rejects.toThrow('appen kunne ikke finde den nye');

    expect(mockFetch).toHaveBeenCalledTimes(AULA_API_VERSION_LOOKAHEAD + 1);
    expect(versionAt(AULA_API_VERSION_LOOKAHEAD)).toBe(N + AULA_API_VERSION_LOOKAHEAD);
    expect(api.getApiVersion()).toBe(N);
  });
});
