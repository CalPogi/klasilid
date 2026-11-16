import { readable } from 'svelte/store';

/** Built pages, plus the mockup's other pages, which show "coming in the next update" until their plan lands. */
export const SOON = {
  grades: 'Report card grades', manage: 'Manage classes', reports: 'Reports',
  reader: 'Door reader',
} as const;
export type SoonRoute = keyof typeof SOON;
export type Route = 'today' | 'attendance' | 'seat' | 'students' | 'calendar' | 'settings' | 'account' | 'setup' | 'signin' | 'signup' | SoonRoute;
const ROUTES = ['today', 'attendance', 'seat', 'students', 'calendar', 'settings', 'account', 'setup', 'signin', 'signup', ...Object.keys(SOON)] as Route[];

const parse = (): Route => {
  const r = location.hash.replace(/^#\//, '') as Route;
  return ROUTES.includes(r) ? r : 'today';
};

export const route = readable<Route>(parse(), set => {
  const on = () => set(parse());
  on();
  window.addEventListener('hashchange', on);
  return () => window.removeEventListener('hashchange', on);
});

export function go(r: Route): void {
  location.hash = '#/' + r;
}
