import { readable } from 'svelte/store';

/** Built pages, plus the mockup's other pages, which show "coming in the next update" until their plan lands. */
export const SOON = {
  grades: 'Report card grades', manage: 'Manage classes', reports: 'Reports',
  reader: 'Door reader', classes: 'My classes',
} as const;
export type SoonRoute = keyof typeof SOON;
/** student, day and seat-edit are phone screens (a learner's page, a past school day, the seat editor). */
export type Route = 'today' | 'attendance' | 'seat' | 'students' | 'calendar' | 'settings' | 'account' | 'setup' | 'signin' | 'signup'
  | 'student' | 'day' | 'seat-edit' | SoonRoute;
const ROUTES = ['today', 'attendance', 'seat', 'students', 'calendar', 'settings', 'account', 'setup', 'signin', 'signup',
  'student', 'day', 'seat-edit', ...Object.keys(SOON)] as Route[];

/** '#/signup?invite=…' → 'signup'; unknown → 'today'. */
export const routeOf = (hash: string): Route => {
  const r = hash.replace(/^#\//, '').split('?')[0] as Route;
  return ROUTES.includes(r) ? r : 'today';
};
/** A value after the route: param('id', '#/student?id=l1') → 'l1'; missing → ''. */
export function param(name: string, hash = location.hash): string {
  return new URLSearchParams(hash.split('?')[1] ?? '').get(name) ?? '';
}
/** The sign-up code carried by an adviser's invite link ('#/signup?invite=Y3RS-MWTL'), or ''. */
export const inviteOf = (hash: string): string => param('invite', hash);
/** The laptop has no phone-only screens: a phone link opened on a laptop shows the matching laptop page. */
export function laptopRoute(r: Route): Route {
  return r === 'student' ? 'students' : r === 'day' ? 'attendance' : r === 'seat-edit' ? 'seat' : r;
}
const parse = (): Route => routeOf(location.hash);

export const route = readable<Route>(parse(), set => {
  const on = () => set(parse());
  on();
  window.addEventListener('hashchange', on);
  return () => window.removeEventListener('hashchange', on);
});
/** The whole hash, so screens that read param() can refresh when only the values change. */
export const hash = readable(location.hash, set => {
  const on = () => set(location.hash);
  on();
  window.addEventListener('hashchange', on);
  return () => window.removeEventListener('hashchange', on);
});

export function go(r: Route, params?: Record<string, string>): void {
  location.hash = '#/' + r + (params ? '?' + new URLSearchParams(params) : '');
}
