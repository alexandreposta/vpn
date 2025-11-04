import '@testing-library/jest-dom';
import { beforeEach, vi } from 'vitest';

vi.mock('axios');

beforeEach(() => {
  vi.clearAllMocks();
});

