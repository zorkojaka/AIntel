import fs from 'node:fs';
import path from 'node:path';

import dotenv from 'dotenv';

const candidatePaths = [
  path.resolve(__dirname, '.env'),
  path.resolve(__dirname, '..', '.env'),
  path.resolve(__dirname, '..', '..', '.env'),
  path.resolve(__dirname, '..', '..', '..', '.env')
];

export function loadEnvironment() {
  const envFile = candidatePaths.find((candidate) => fs.existsSync(candidate));
  if (envFile) {
    dotenv.config({ path: envFile });
    return;
  }
  dotenv.config();
}
