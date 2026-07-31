// @ts-check
const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ['127.0.0.1'],
  transpilePackages: ['@agentic-webapp/contracts', '@agentic-webapp/ui'],
  turbopack: {
    root: path.join(__dirname, '../..'),
  },
};

module.exports = nextConfig;
