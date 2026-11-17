import { readable } from 'svelte/store';

/** Phones in either orientation: narrow, or short (a phone turned sideways is wide but under 500 px tall). */
export const PHONE_QUERY = '(max-width: 760px), (max-height: 500px)';

/** True when the app shows the phone app (bottom bar, phone screens, sheets) instead of the laptop layout. */
export const phone = readable(false, set => {
  if (typeof matchMedia !== 'function') return;
  const m = matchMedia(PHONE_QUERY);
  set(m.matches);
  const on = (e: MediaQueryListEvent) => set(e.matches);
  m.addEventListener('change', on);
  return () => m.removeEventListener('change', on);
});
