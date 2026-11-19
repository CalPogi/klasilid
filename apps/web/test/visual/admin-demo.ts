// Dev-only: mounts the admin section with the tests' fake data (made-up names, codes and keys).
import { mount } from 'svelte';
import '../../src/styles/mockup.css';
import '../../src/styles/app.css';
import '../../src/styles/phone.css';
import '../../src/styles/admin.css';
import AdminApp from '../../src/pages/admin/AdminApp.svelte';
import { fakeAdmin } from '../admin-helpers';

// The icon sprite lives in index.html; borrow it.
const html = await (await fetch('./index.html')).text();
const sprite = new DOMParser().parseFromString(html, 'text/html').querySelector('svg');
if (sprite) document.body.prepend(sprite);

const q = new URLSearchParams(location.search);
const two = q.get('two');
const f = fakeAdmin({ levels: two === 'setup' ? ['aal1', 'aal1'] : two === 'code' ? ['aal1', 'aal2'] : ['aal2', 'aal2'] });
mount(AdminApp, { target: document.getElementById('app')!, props: { sb: f.sb, onsignout: () => {}, now: () => new Date('2026-11-19T00:02:00Z') } });
const tab = q.get('tab');
if (tab) setTimeout(() => (document.querySelector(`nav[aria-label="Admin"] :is(a,button):nth-child(${['schools', 'teachers', 'readers'].indexOf(tab) + 1})`) as HTMLElement)?.click(), 300);
