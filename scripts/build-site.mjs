#!/usr/bin/env node
// Builds the Cloudflare Pages site: the landing page at /, the web app (apps/web/dist, built first) at /app/.
// Usage: npm run build -w @klasilid/web && node scripts/build-site.mjs
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';

const out = 'site';
if (!existsSync('apps/web/dist/index.html')) {
  console.error('Build the web app first: npm run build -w @klasilid/web');
  process.exit(1);
}
rmSync(out, { recursive: true, force: true });
mkdirSync(out);
cpSync('apps/landing', out, { recursive: true });
cpSync('apps/web/dist', `${out}/app`, { recursive: true });
// No _redirects: Pages already serves privacy.html at /privacy and redirects /app to /app/.
writeFileSync(
  `${out}/_headers`,
  ['/*', '  X-Content-Type-Options: nosniff', '  Referrer-Policy: same-origin', '  X-Frame-Options: DENY', ''].join('\n'),
);
console.log(`site/ ready: landing at /, app at /app/`);
