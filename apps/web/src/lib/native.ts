// Where the app is running. Only the Tauri apps (Windows, Android) may load Tauri modules; the website never does.
export type Platform = 'web' | 'windows' | 'android';

export function platform(): Platform {
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return 'web';
  return /Android/i.test(navigator.userAgent) ? 'android' : 'windows';
}
