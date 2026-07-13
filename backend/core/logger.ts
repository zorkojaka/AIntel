import pino from 'pino';

const nodeEnv = process.env.NODE_ENV;
const isProduction = nodeEnv === 'production';
// The `node --test` harness does not set NODE_ENV; `--test` is a node flag so it
// lands in execArgv, not argv. Check both plus NODE_ENV for robustness.
const isTest =
  nodeEnv === 'test' ||
  process.execArgv.includes('--test') ||
  process.argv.includes('--test');

// Prod emits one structured JSON line per log entry. Local dev gets a
// human-readable pretty stream only on an interactive terminal. Tests stay
// silent unless LOG_LEVEL is set explicitly.
const level = process.env.LOG_LEVEL ?? (isTest ? 'silent' : 'info');
const usePretty = !isProduction && !isTest && process.stdout.isTTY;

export const logger = pino({
  level,
  base: { service: 'aintel-backend' },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      'req.body.password',
    ],
    remove: true,
  },
  ...(usePretty
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' },
        },
      }
    : {}),
});
