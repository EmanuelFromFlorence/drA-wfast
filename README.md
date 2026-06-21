# draw-fast ⚡️

A high-performance, real-time AI drawing canvas that transforms your hand-drawn sketches into high-fidelity AI-generated images as you paint. Built on top of **tldraw** and designed for seamless multi-engine support.

---

## ✨ Features

- **Real-Time Interactive Canvas**: Powered by the cutting-edge `@tldraw/tldraw` library, providing a smooth vector sketching experience.
- **Three Generative AI Engines**:
  - **Fal.ai (WebSocket / Paid)**: Ultra-low latency, real-time image-to-image feedback using Latent Consistency Models (LCM SD1.5). Updates instantly as your brush strokes touch the canvas.
  - **Pollinations.ai (HTTP / Free)**: Free image-to-image generation. Requests are automatically debounced (800ms) to ensure smooth integration with the public API.
  - **Puter.js (SDK / Free)**: Fully client-side AI image generator leveraging the Puter.js SDK, utilizing Stable Diffusion XL.
- **Dynamic Controls & UI**:
  - Floating settings panel to switch engines on-the-fly and monitor connection states (`generating`, `connected`, `idle`, etc.).
  - Side-by-side comparative viewport or direct image overlay directly on the canvas frame.
  - Interactive canvas export tools to download your generated PNGs or save vector SVGs.
- **Serverless Backend Proxying**: Built-in support for proxy endpoints to secure API keys and bypass CORS policies, optimized for direct hosting.

---

## 🛠️ Tech Stack

- **Core**: React 18, TypeScript, Vite, TailwindCSS
- **Canvas engine**: `@tldraw/tldraw`
- **Integrations**: `@fal-ai/serverless-client`, Puter.js SDK, Pollinations.ai API
- **Routing & Proxy**: Netlify Functions (deployed via serverless endpoints)

---

## 🚀 Setup & Local Installation

### 1. Prerequisites

Make sure you have Node.js (version 18 or higher) installed.

### 2. Clone and Configure

Clone the repository and create your environment file:

```bash
# Create local environment config
touch .env.local
```

Open `.env.local` and add your Fal.ai API token:

```env
FAL_KEY=your_fal_ai_api_key_here
```

> 💡 **Note**: If you don't have a Fal.ai key, you can sign up at [fal.ai](https://www.fal.ai/dashboard/keys). You can still run the project for free using the **Pollinations.ai** and **Puter.js** engines without adding any keys.

### 3. Run Dev Server

Install the project dependencies and launch the local Vite server:

```bash
npm install
npm run dev
```

Your browser will automatically open or prompt you to navigate to `http://localhost:5173`.

---

## 📦 Deployment & Serverless Integration

The project includes configurations for zero-config deployments to **Netlify** out of the box:

- **Redirects (`netlify.toml`)**: Maps `/api/fal/proxy` and `/api/pollinations/proxy` to local Netlify functions, shielding client code from directly exposing API secrets.
- **Serverless Functions (`netlify/functions/`)**:
  - `fal-proxy.ts`: Formats and proxies HTTP requests to Fal.ai APIs using the backend `FAL_KEY` environment variable.
  - `pollinations-proxy.ts`: Fetches edit models from Pollinations.ai, handling seed parameters and custom image bounds.
