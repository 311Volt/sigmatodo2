import { serve } from 'bun';
import index from './index.html';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';
const LOG_API_REQUESTS = process.env.LOG_API_REQUESTS ?? "false";

serve({
  routes: {
    '/api/*': async (req) => {
      const url = new URL(req.url);
      
      // 1. Construct the destination URL.
      // If your backend routes don't include "/api" (e.g. backend expects "/users"), 
      // change `url.pathname` to `url.pathname.replace(/^\/api/, '')`.
      const targetUrl = new URL(url.pathname + url.search, API_URL);

      // 2. Clone headers and remove 'host' so it adapts to the backend's URL.
      const headers = new Headers(req.headers);
      headers.delete('host');
      // Prevent Render's edge from compressing the response — Bun's fetch
      // would auto-decompress the body but forward Content-Encoding: br,
      // causing ERR_NETWORK_DECODING_FAILED in the browser.
      headers.set('accept-encoding', 'identity');
      
      // Optionally preserve the original client IP for your backend logs/rate limiting
      const clientIp = req.headers.get('x-forwarded-for');
      if (clientIp) {
         headers.set('x-forwarded-for', clientIp);
      }

      if(LOG_API_REQUESTS !== "false") {
        console.log(`sending api request to ${url} with headers: ${JSON.stringify(headers)}`);
      }
      try {
        // 3. Proxy the request to the API
        return await fetch(targetUrl, {
          method: req.method,
          headers,
          // GET and HEAD requests cannot have a body
          body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined,
          redirect: 'manual',
        });
      } catch (err) {
        console.error('Proxy error:', err);
        return new Response('502 Bad Gateway - API Unavailable', { status: 502 });
      }
    },
    '/*': index,
  },
  development: process.env.NODE_ENV !== 'production' && {
    hmr: true,
    console: true,
  },
});

console.log(`sigmatodo2-web running on http://localhost:3000, API is ${API_URL}`);
