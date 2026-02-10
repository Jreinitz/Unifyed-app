import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
  transpilePackages: ['@unifyed/types'],
};

export default withSentryConfig(nextConfig, {
  // Suppress source map upload logs in CI
  silent: true,
  // Upload source maps for better error readability
  widenClientFileUpload: true,
  // Hide source maps from client bundles
  hideSourceMaps: true,
  // Disable Sentry telemetry
  disableLogger: true,
});
