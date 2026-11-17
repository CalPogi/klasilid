/** Stubs matchMedia so the phone store sees a phone (true) or a laptop (false). */
export function mockMatchMedia(matches: boolean) {
  window.matchMedia = ((media: string) => ({
    matches, media, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
