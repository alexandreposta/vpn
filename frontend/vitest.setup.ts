import { beforeEach, expect, vi } from 'vitest';
import matchers from '@testing-library/jest-dom/matchers';

expect.extend(matchers);

vi.mock('axios');

beforeEach(() => {
  vi.clearAllMocks();
});
