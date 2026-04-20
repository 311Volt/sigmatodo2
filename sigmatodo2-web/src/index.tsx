import { serve } from 'bun';
import index from './index.html';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

serve({
  routes: {
    '/api/*': async req => {
      const url = new URL(req.url);
      const target = `${API_URL}${url.pathname}${url.search}`;
      return fetch(target, {
        method: req.method,
        headers: req.headers,
        body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined,
        // @ts-ignore — duplex required by Bun's fetch when body is a stream
        duplex: 'half',
      });
    },
    '/*': index,
  },
  development: process.env.NODE_ENV !== 'production' && {
    hmr: true,
    console: true,
  },
});

console.log('sigmatodo2-web running on http://localhost:3000');
