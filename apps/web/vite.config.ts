import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [svelte(), svelteTesting()],
  test: {
    name: 'web',
    environment: 'jsdom',
    include: ['test/**/*.test.ts'],
    setupFiles: ['fake-indexeddb/auto'],
    testTimeout: 15_000, // seeding demo data into fake-indexeddb is slow when the whole suite runs in parallel
  },
});
