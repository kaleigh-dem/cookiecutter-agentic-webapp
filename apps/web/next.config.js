// @ts-check
const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    '@agentic-webapp/contracts',
    '@agentic-webapp/observability',
    '@agentic-webapp/ui',
  ],
  turbopack: {
    root: path.join(__dirname, '../..'),
  },
};

module.exports = nextConfig;
