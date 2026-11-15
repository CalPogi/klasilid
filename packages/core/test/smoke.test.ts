import { expect, it } from 'vitest';
import * as core from '../src/index';

it('core package loads', () => {
  expect(typeof core).toBe('object');
});
