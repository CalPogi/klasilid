import { configure } from '@testing-library/svelte';

// The whole suite runs in parallel; give findBy/waitFor room before they give up (default 1 s).
configure({ asyncUtilTimeout: 5000 });
