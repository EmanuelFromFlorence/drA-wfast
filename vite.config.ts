import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  if (env.HF_TOKEN) {
    process.env.HF_TOKEN = env.HF_TOKEN;
  }
  if (env.FAL_KEY) {
    process.env.FAL_KEY = env.FAL_KEY;
  }

  return {

  plugins: [
    react(),
    {
      name: 'ai-proxy-middleware',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          // 1. Fal.ai Proxy
          if (req.url && req.url.startsWith('/api/fal/proxy')) {
            const falKey = process.env.FAL_KEY;
            const targetUrl = req.headers['x-fal-target-url'] as string;
            console.log(`[Proxy] FAL Request. Target URL: ${targetUrl}`);
            if (!falKey) {
              console.error('[Proxy] Error: FAL_KEY is not configured');
              res.statusCode = 500;
              res.end('FAL_KEY is not configured in local environment variables (.env.local)');
              return;
            }
            if (!targetUrl) {
              console.error('[Proxy] Error: Missing x-fal-target-url header');
              res.statusCode = 400;
              res.end('Missing x-fal-target-url header');
              return;
            }

            // Read request body
            let chunks: Buffer[] = [];
            req.on('data', (chunk) => {
              chunks.push(chunk);
            });

            req.on('end', async () => {
              try {
                const bodyBuffer = Buffer.concat(chunks);
                const headers = new Headers();
                headers.set('Authorization', `Key ${falKey}`);
                headers.set('Content-Type', req.headers['content-type'] as string || 'application/json');

                console.log(`[Proxy] Fetching FAL target: ${targetUrl}`);
                const response = await fetch(targetUrl, {
                  method: req.method,
                  headers,
                  body: req.method !== 'GET' && req.method !== 'HEAD' ? bodyBuffer : undefined,
                });

                console.log(`[Proxy] FAL target response status: ${response.status}`);
                res.statusCode = response.status;
                response.headers.forEach((value, key) => {
                  if (key.toLowerCase() !== 'content-length' && key.toLowerCase() !== 'content-encoding') {
                    res.setHeader(key, value);
                  }
                });

                const resBuffer = await response.arrayBuffer();
                res.end(Buffer.from(resBuffer));
              } catch (err) {
                console.error('Local FAL proxy error:', err);
                res.statusCode = 500;
                res.end('Local FAL proxy error');
              }
            });
            return;
          }

          // 2. Hugging Face Proxy
          if (req.url && req.url.startsWith('/api/hf/proxy')) {
            const hfToken = process.env.HF_TOKEN;
            if (!hfToken) {
              console.warn('[Proxy] HF_TOKEN is not configured in local environment variables (.env.local). Returning 501.');
              res.statusCode = 501;
              res.end('HF_TOKEN not configured');
              return;
            }

            // Read request body
            let chunks: Buffer[] = [];
            req.on('data', (chunk) => {
              chunks.push(chunk);
            });

            req.on('end', async () => {
              try {
                const bodyBuffer = Buffer.concat(chunks);
                const { prompt, image, strength } = JSON.parse(bodyBuffer.toString());

                if (!image) {
                  res.statusCode = 400;
                  res.end('Missing image parameter');
                  return;
                }

                const base64Data = image.split(',')[1] || image;
                const hfUrl = 'https://router.huggingface.co/hf-inference/models/runwayml/stable-diffusion-v1-5';
                
                console.log(`[Proxy] Sending image-to-image request to Hugging Face for prompt: "${prompt}"`);
                
                const payload = {
                  inputs: base64Data,
                  parameters: {
                    prompt: prompt,
                    strength: strength !== undefined ? strength : 0.65,
                    num_inference_steps: 15,
                  }
                };

                const hfResponse = await fetch(hfUrl, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${hfToken}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify(payload),
                });

                console.log(`[Proxy] Hugging Face response status: ${hfResponse.status}`);
                if (!hfResponse.ok) {
                  const errorText = await hfResponse.text();
                  console.error('[Proxy] Hugging Face error:', errorText);
                  res.statusCode = hfResponse.status;
                  res.end(errorText);
                  return;
                }

                const resBuffer = await hfResponse.arrayBuffer();
                const base64Result = Buffer.from(resBuffer).toString('base64');
                const contentType = hfResponse.headers.get('content-type') || 'image/jpeg';
                
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({
                  url: `data:${contentType};base64,${base64Result}`
                }));
              } catch (err) {
                console.error('Local Hugging Face proxy error:', err);
                res.statusCode = 500;
                res.end('Local Hugging Face proxy error');
              }
            });
            return;
          }

          // 3. Pollinations.ai Proxy
          if (req.url && req.url.startsWith('/api/pollinations/proxy')) {
            let chunks: Buffer[] = [];
            req.on('data', (chunk) => {
              chunks.push(chunk);
            });

            req.on('end', async () => {
              try {
                const bodyBuffer = Buffer.concat(chunks);
                const { prompt, image, seed } = JSON.parse(bodyBuffer.toString());

                if (!prompt) {
                  res.statusCode = 400;
                  res.end('Missing prompt');
                  return;
                }

                let targetUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=512&height=512&nologo=true`;
                if (seed !== undefined) {
                  targetUrl += `&seed=${seed}`;
                }
                if (image) {
                  targetUrl += `&image=${encodeURIComponent(image)}`;
                }

                console.log(`[Proxy] Fetching Pollinations: ${targetUrl.substring(0, 120)}...`);
                const response = await fetch(targetUrl);

                if (!response.ok) {
                  console.error(`[Proxy] Pollinations returned status ${response.status}`);
                  res.statusCode = response.status;
                  res.end(`Pollinations error: ${response.statusText}`);
                  return;
                }

                res.statusCode = response.status;
                const contentType = response.headers.get('content-type') || 'image/jpeg';
                res.setHeader('Content-Type', contentType);

                const resBuffer = await response.arrayBuffer();
                res.end(Buffer.from(resBuffer));
              } catch (err) {
                console.error('Local Pollinations proxy error:', err);
                res.statusCode = 500;
                res.end('Local Pollinations proxy error');
              }
            });
            return;
          }
          next();
        });
      }
    }
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
  }
};
});
