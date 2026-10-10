import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const script = new URL('../scripts/check-release.mjs', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const check = tag => spawnSync(process.execPath, [fileURLToPath(script), ...(tag === undefined ? [] : [tag])], { encoding: 'utf8' });

test('publication : accepter uniquement le tag stable de la version courante', () => {
  assert.equal(check(`v${manifest.version}`).status, 0);
  for (const tag of [undefined, manifest.version, `v${manifest.version}-beta`, 'main', 'v999.999.999']) {
    const result = check(tag);
    assert.notEqual(result.status, 0, `Refuser ${tag}`);
  }
});
