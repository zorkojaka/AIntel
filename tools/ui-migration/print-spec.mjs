import { readJson, specPath } from './shared.mjs';

const spec = readJson(specPath);
console.log(JSON.stringify(spec, null, 2));
