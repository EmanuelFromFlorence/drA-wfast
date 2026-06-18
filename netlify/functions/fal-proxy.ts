export default async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, DELETE',
        'Access-Control-Allow-Headers': '*',
      },
    });
  }

  const targetUrl = req.headers.get('x-fal-target-url');
  if (!targetUrl) {
    return new Response('Missing x-fal-target-url header', { status: 400 });
  }

  // Security check: ensure target is a valid fal.ai/fal.run domain
  try {
    const parsedUrl = new URL(targetUrl);
    if (!parsedUrl.hostname.endsWith('.fal.ai') && !parsedUrl.hostname.endsWith('.fal.run')) {
      return new Response('Invalid target URL domain', { status: 412 });
    }
  } catch (e) {
    return new Response('Malformed target URL', { status: 400 });
  }

  const falKey = process.env.FAL_KEY;
  if (!falKey) {
    return new Response('FAL_KEY is not configured on the server environment', { status: 500 });
  }

  const headers = new Headers();
  headers.set('Authorization', `Key ${falKey}`);
  headers.set('Content-Type', req.headers.get('content-type') || 'application/json');

  // Forward request body if method is not GET or HEAD
  let body: any = null;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    body = await req.arrayBuffer();
  }

  try {
    const response = await fetch(targetUrl, {
      method: req.method,
      headers,
      body,
    });

    const responseHeaders = new Headers();
    response.headers.forEach((value, key) => {
      // Exclude content encoding and content length to let hosting platform handle it
      if (key.toLowerCase() !== 'content-length' && key.toLowerCase() !== 'content-encoding') {
        responseHeaders.set(key, value);
      }
    });

    // Add CORS headers
    responseHeaders.set('Access-Control-Allow-Origin', '*');

    const resBody = await response.arrayBuffer();

    return new Response(resBody, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('Fal proxy serverless function error:', error);
    return new Response(`Fal proxy error: ${error instanceof Error ? error.message : String(error)}`, { status: 500 });
  }
}
