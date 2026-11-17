import { readable } from 'svelte/store';

/** Built pages, plus the mockup's other pages, which show "coming in the next update" until their plan lands. */
export const SOON = {
  grades: 'Report card grades', manage: 'Manage classes', reports: 'Reports',
  reader: 'Door reader',
} as const;
export type SoonRoute = keyof typeof SOON;
export type Route = 'today' | 'attendance' | 'seat' | 'students' | 'calendar' | 'settings' | 'account' | 'setup' | 'signin' | 'signup' | SoonRoute;
const ROUTES = ['today', 'attendance', 'seat', 'students', 'calendar', 'settings', 'account', 'setup', 'signin', 'signup', ...Object.keys(SOON)] as Route[];

/** '#/signup?invite=…' → 'signup'; unknown → 'today'. */
export const routeOf = (hash: string): Route => {
  const r = hash.replace(/^#\//, '').split('?')[0] as Route;
  return ROUTES.includes(r) ? r : 'today';
};
/** The sign-up code carried by an adviser's invite link ('#/signup?invite=Y3RS-MWTL'), or ''. */
export const inviteOf = (hash: string): string => new URLSearchParams(hash.split('?')[1] ?? '').get('invite') ?? '';
const parse = (): Route => routeOf(location.hash);

export const route = readable<Route>(parse(), set => {
  const on = () => set(parse());
  on();
  window.addEventListener('hashchange', on);
  return () => window.removeEventListener('hashchange', on);
});

export function go(r: Route): void {
  location.hash = '#/' + r;
}
