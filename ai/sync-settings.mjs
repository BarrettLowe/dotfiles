import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';

const [target, base, ...overrides] = process.argv.slice(2);
const read = path => existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
function merge(base, override) {
  const result = { ...base };
  for (const [key, value] of Object.entries(override)) {
    result[key] = value && typeof value === 'object' && !Array.isArray(value)
      ? merge(result[key] ?? {}, value)
      : value;
  }
  return result;
}
let settings = read(existsSync(target) ? target : base);
for (const path of overrides) settings = merge(settings, read(path));
writeFileSync(`${target}.tmp`, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
renameSync(`${target}.tmp`, target);
