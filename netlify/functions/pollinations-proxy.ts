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

  try {
    if (req.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const { prompt, image, seed } = await req.json();

    if (!prompt) {
      return new Response('Missing prompt', { status: 400 });
    }

    let targetUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=512&height=512&nologo=true&model=p-image-edit`;
    if (seed !== undefined) {
      targetUrl += `&seed=${seed}`;
    }
    if (image) {
      targetUrl += `&image=${encodeURIComponent(image)}`;
    }

    console.log(`[Netlify Proxy] Fetching Pollinations: ${targetUrl.substring(0, 120)}...`);
    const response = await fetch(targetUrl);

    if (!response.ok) {
      console.error(`[Netlify Proxy] Pollinations returned status ${response.status}`);
      return new Response(`Pollinations error: ${response.statusText}`, { status: response.status });
    }

    const responseHeaders = new Headers();
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    responseHeaders.set('Content-Type', contentType);
    responseHeaders.set('Access-Control-Allow-Origin', '*');

    const resBody = await response.arrayBuffer();
    return new Response(resBody, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('Pollinations proxy serverless function error:', error);
    return new Response(`Pollinations proxy error: ${error instanceof Error ? error.message : String(error)}`, { status: 500 });
  }
}
