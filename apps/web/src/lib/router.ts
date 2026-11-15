import { readable } from 'svelte/store';

export type Route = 'today' | 'attendance' | 'setup' | 'signin';
const ROUTES: Route[] = ['today', 'attendance', 'setup', 'signin'];

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
