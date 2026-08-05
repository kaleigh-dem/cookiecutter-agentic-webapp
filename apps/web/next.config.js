// @ts-check
const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../..'),
  transpilePackages: ['@steadystack/contracts', '@steadystack/ui'],
  turbopack: {
    root: path.join(__dirname, '../..'),
  },
};

module.exports = nextConfig;
