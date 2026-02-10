import * as Sentry from '@sentry/node';

export function initSentry() {
  const dsn = process.env['SENTRY_DSN'];
  
  if (!dsn) {
    console.log('Sentry DSN not configured, skipping error monitoring');
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env['NODE_ENV'] || 'development',
    tracesSampleRate: process.env['NODE_ENV'] === 'production' ? 0.2 : 1.0,
    // Don't send errors in development unless DSN is explicitly set
    enabled: !!dsn,
  });

  console.log('✅ Sentry error monitoring initialized');
}

export { Sentry };
