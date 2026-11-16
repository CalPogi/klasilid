// New-version check for the Windows and Android apps (design §4). Never throws: offline simply means no update.
import type { Platform } from './native';

export const RELEASES = 'https://github.com/CalPogi/klasilid-releases/releases/latest/download';
export const APK_URL = `${RELEASES}/Klasilid.apk`;
export const LATEST_JSON = `${RELEASES}/latest.json`;

export type Update =
  | { kind: 'windows'; version: string; install(): Promise<void> }
  | { kind: 'android'; version: string; url: string };

export interface UpdateDeps {
  platform: Platform;
  current(): Promise<string>;
  fetchLatest(): Promise<{ version: string }>;
  windowsCheck(): Promise<{ version: string; install(): Promise<void> } | null>;
}

const parse = (v: string) => (/^\d+\.\d+\.\d+$/.test(v) ? v.split('.').map(Number) : null);

export function isNewer(latest: string, current: string): boolean {
  const a = parse(latest);
  const b = parse(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

export async function findUpdate(d: UpdateDeps): Promise<Update | null> {
  if (d.platform === 'web') return null;
  try {
    if (d.platform === 'windows') {
      const u = await d.windowsCheck();
      return u ? { kind: 'windows', version: u.version, install: u.install } : null;
    }
    const [latest, current] = await Promise.all([d.fetchLatest(), d.current()]);
    return isNewer(latest.version, current) ? { kind: 'android', version: latest.version, url: APK_URL } : null;
  } catch {
    return null;
  }
}

/** Real deps for the Tauri apps. Dynamic imports keep Tauri code out of the website's bundle. */
export function tauriUpdateDeps(p: Platform): UpdateDeps {
  return {
    platform: p,
    current: async () => (await import('@tauri-apps/api/app')).getVersion(),
    fetchLatest: async () => {
      const { fetch } = await import('@tauri-apps/plugin-http');
      const res = await fetch(LATEST_JSON);
      if (!res.ok) throw new Error(`latest.json ${res.status}`);
      return (await res.json()) as { version: string };
    },
    windowsCheck: async () => {
      const { check } = await import('@tauri-apps/plugin-updater');
      const u = await check();
      if (!u) return null;
      return {
        version: u.version,
        install: async () => {
          await u.downloadAndInstall();
          await (await import('@tauri-apps/plugin-process')).relaunch();
        },
      };
    },
  };
}

export async function openDownload(url: string): Promise<void> {
  await (await import('@tauri-apps/plugin-opener')).openUrl(url);
}
