import { readable } from 'svelte/store';

/** Built pages, plus the mockup's other pages, which show "coming in the next update" until their plan lands. */
export const SOON = {
  students: 'Students', grades: 'Report card grades', manage: 'Manage classes', reports: 'Reports',
  calendar: 'School calendar', reader: 'Door reader', settings: 'Settings', account: 'Account',
} as const;
export type SoonRoute = keyof typeof SOON;
export type Route = 'today' | 'attendance' | 'seat' | 'setup' | 'signin' | SoonRoute;
const ROUTES = ['today', 'attendance', 'seat', 'setup', 'signin', ...Object.keys(SOON)] as Route[];

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
