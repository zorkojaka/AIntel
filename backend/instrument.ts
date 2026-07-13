// Loaded first (before the app and its modules) so Sentry can install its process
// handlers and instrumentation before anything else runs. Env must load first so
// SENTRY_DSN is available; loadEnvironment is idempotent with the call in server.ts.
import { loadEnvironment } from './loadEnv';
import { initSentry } from './core/sentry';

loadEnvironment();
initSentry();
