import { handleNavigationRouteRequest } from '../supabase/functions/navigation-route/index.ts';

/**
 * Vercel Serverless Function mirror for `/api/navigation-route`
 * Executes the exact `navigation-route` Edge Function handler server-side.
 */
export default async function handler(req, res) {
  try {
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers.host || 'www.outerabd.buzz';
    const url = `${protocol}://${host}${req.url || '/api/navigation-route'}`;

    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers || {})) {
      if (typeof value === 'string') {
        headers.set(key, value);
      } else if (Array.isArray(value)) {
        headers.set(key, value.join(', '));
      }
    }

    const bodyStr =
      req.method === 'POST'
        ? typeof req.body === 'string'
          ? req.body
          : JSON.stringify(req.body || {})
        : undefined;

    const webReq = new Request(url, {
      method: req.method || 'POST',
      headers,
      body: bodyStr,
    });

    const webRes = await handleNavigationRouteRequest(webReq);
    const responseText = await webRes.text();

    webRes.headers.forEach((val, key) => {
      res.setHeader(key, val);
    });

    res.status(webRes.status).send(responseText);
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: {
        code: 'UPSTREAM_ERROR',
        message: 'Internal server error in navigation-route handler.',
      },
    });
  }
}
