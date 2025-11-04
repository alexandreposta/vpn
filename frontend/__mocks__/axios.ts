import { vi } from 'vitest';

const axios = {
  create: () => axios,
  get: vi.fn(async (url) => {
    if (url === '/regions') {
      return { data: { regions: ['eu-west-3'] } };
    }
    if (url === '/instances') {
      return { data: { instances: [] } };
    }
    return { data: {} };
  }),
  post: vi.fn(async () => ({ data: {} }))
};

export default axios;
