import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'node', include: ['packages/*/test/**/*.test.ts', 'supabase/tests/**/*.test.ts', 'scripts/**/*.test.mjs'] } },
      'apps/web',
    ],
  },
});
