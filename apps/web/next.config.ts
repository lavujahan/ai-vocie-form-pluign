import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@vff/shared'],
  // Allow the dev server to be reached through a tunnel (ngrok / cloudflared) for the phone.
  allowedDevOrigins: ['*.ngrok-free.app', '*.ngrok.app', '*.trycloudflare.com'],
};

export default config;
