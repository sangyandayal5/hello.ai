'use strict';

/**
 * Testing library/framework:
 * - Node.js built-in test runner (node:test)
 * - Assertions via node:assert/strict
 *
 * Rationale:
 * - No external test framework detected in repo; avoid introducing new dependencies.
 * - Focus is on the diff-provided file (package.json). For a JSON config, we validate schema elements,
 *   script commands, critical dependency presence, and consistency between related versions.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

function loadPackageJson() {
  const pkgPath = path.join(process.cwd(), 'package.json');
  const raw = fs.readFileSync(pkgPath, 'utf8');
  return JSON.parse(raw);
}

// Basic semver-ish validator allowing ^, ~ prefixes and simple ranges like ^19, ^19.0.0, 15.3.2, etc.
// Avoids extra dependencies.
function isSemverLike(ver) {
  if (typeof ver !== 'string' || !ver.trim()) return false;
  // Accept prefixes ^ or ~ or none
  const v = ver.trim();
  // Permit tags like ^4, ^4.0, ^4.0.14, 4, 4.0, 4.0.14
  return /^(\^|~)?\d+(?:\.\d+){0,2}([.-][0-9A-Za-z]+)?$/.test(v);
}

// Normalize version for comparison: strip ^/~ and any prerelease/build metadata
function normalizeVersion(ver) {
  if (typeof ver !== 'string') return '';
  let v = ver.trim().replace(/^[~^]/, '');
  // strip build/prerelease parts
  v = v.split('-')[0];
  v = v.split('+')[0];
  return v;
}

// Compare if two versions are exactly equal after normalization
function versionsEqual(a, b) {
  return normalizeVersion(a) === normalizeVersion(b);
}

// Helper validator returning collected error messages (allows negative tests)
function validatePackageShape(pkg) {
  const errs = [];

  // Top-level checks
  if (typeof pkg !== 'object' || pkg === null) errs.push('package.json must be an object');
  if (!('name' in pkg)) errs.push('missing "name"');
  if (!('version' in pkg)) errs.push('missing "version"');
  if (!('private' in pkg)) errs.push('missing "private"');
  if (!('scripts' in pkg)) errs.push('missing "scripts"');
  if (!('dependencies' in pkg)) errs.push('missing "dependencies"');
  if (!('devDependencies' in pkg)) errs.push('missing "devDependencies"');

  if ('name' in pkg && typeof pkg.name !== 'string') errs.push('"name" must be a string');
  if ('version' in pkg && typeof pkg.version !== 'string') errs.push('"version" must be a string');
  if ('private' in pkg && typeof pkg.private !== 'boolean') errs.push('"private" must be a boolean');

  if ('scripts' in pkg && (typeof pkg.scripts !== 'object' || pkg.scripts === null)) {
    errs.push('"scripts" must be an object');
  }

  if ('dependencies' in pkg && (typeof pkg.dependencies !== 'object' || pkg.dependencies === null)) {
    errs.push('"dependencies" must be an object');
  }

  if ('devDependencies' in pkg && (typeof pkg.devDependencies !== 'object' || pkg.devDependencies === null)) {
    errs.push('"devDependencies" must be an object');
  }

  return errs;
}

test('package.json: structure and required top-level keys exist', () => {
  const pkg = loadPackageJson();
  const errs = validatePackageShape(pkg);
  assert.deepEqual(errs, [], `Unexpected package.json validation errors: ${errs.join(', ')}`);

  assert.equal(pkg.name, 'hello.ai');
  assert.equal(pkg.version, '0.1.0');
  assert.equal(pkg.private, true);
});

test('package.json: scripts include required commands with exact values', () => {
  const { scripts } = loadPackageJson();
  // Required scripts and expected values
  const expected = {
    dev: 'next dev --turbopack',
    build: 'next build',
    start: 'next start',
    lint: 'next lint',
    'db:push': 'drizzle-kit push',
    'db:studio': 'drizzle-kit studio',
  };

  for (const [k, v] of Object.entries(expected)) {
    assert.ok(k in scripts, `scripts must include "${k}"`);
    assert.equal(scripts[k], v, `scripts["${k}"] should be "${v}"`);
  }

  // If a test script exists, ensure it is runnable by node --test (we add it below if missing)
  if ('test' in scripts) {
    assert.match(String(scripts.test), /node\s+--test/, 'test script should run node --test');
  }
});

test('package.json: critical dependencies are present with valid semver-like versions', () => {
  const { dependencies, devDependencies } = loadPackageJson();

  // Critical runtime deps
  const requiredDeps = [
    'next',
    'react',
    'react-dom',
    'zod',
  ];

  requiredDeps.forEach(dep => {
    assert.ok(dep in dependencies, `dependencies must include "${dep}"`);
    assert.ok(isSemverLike(dependencies[dep]), `"${dep}" should have a semver-like version`);
  });

  // Selected dev deps
  const requiredDevDeps = [
    'eslint',
    'eslint-config-next',
    'typescript',
    'tailwindcss',
    'drizzle-kit'
  ];

  requiredDevDeps.forEach(dep => {
    assert.ok(dep in devDependencies, `devDependencies must include "${dep}"`);
    assert.ok(isSemverLike(devDependencies[dep]), `"${dep}" should have a semver-like version`);
  });
});

test('package.json: version alignment for ecosystem packages', () => {
  const { dependencies, devDependencies } = loadPackageJson();

  // Next and eslint-config-next should align on the same major.minor.patch where applicable
  assert.ok('next' in dependencies, 'dependencies must include "next"');
  assert.ok('eslint-config-next' in devDependencies, 'devDependencies must include "eslint-config-next"');

  const nextVer = dependencies['next'];
  const eslintNextVer = devDependencies['eslint-config-next'];

  assert.equal(
    normalizeVersion(nextVer),
    normalizeVersion(eslintNextVer),
    `Expected next (${nextVer}) and eslint-config-next (${eslintNextVer}) to match after normalization`
  );

  // React and react-dom should align on normalized versions
  assert.ok('react' in dependencies, 'dependencies must include "react"');
  assert.ok('react-dom' in dependencies, 'dependencies must include "react-dom"');

  const reactVer = dependencies['react'];
  const reactDomVer = dependencies['react-dom'];
  assert.ok(isSemverLike(reactVer), 'react should be semver-like');
  assert.ok(isSemverLike(reactDomVer), 'react-dom should be semver-like');
  assert.ok(
    versionsEqual(reactVer, reactDomVer),
    `react (${reactVer}) and react-dom (${reactDomVer}) should have equal normalized versions`
  );
});

test('package.json: negative validation scenarios against the validator', () => {
  const base = loadPackageJson();

  // Missing keys
  {
    const bad = { ...base };
    delete bad.name;
    const errs = validatePackageShape(bad);
    assert.ok(errs.includes('missing "name"'));
  }

  // Wrong types
  {
    const bad = { ...base, private: 'yes' };
    const errs = validatePackageShape(bad);
    assert.ok(errs.includes('"private" must be a boolean'));
  }

  // Scripts wrong type
  {
    const bad = { ...base, scripts: null };
    const errs = validatePackageShape(bad);
    assert.ok(errs.includes('"scripts" must be an object'));
  }

  // Dependencies wrong type
  {
    const bad = { ...base, dependencies: [] };
    const errs = validatePackageShape(bad);
    assert.ok(errs.includes('"dependencies" must be an object'));
  }
});

test('package.json: dev script contains turbopack flag for Next.js 15', () => {
  const { scripts } = loadPackageJson();
  assert.ok(typeof scripts.dev === 'string', 'scripts.dev should be a string');
  assert.match(scripts.dev, /\bnext dev\b/, 'dev script should invoke next dev');
  assert.match(scripts.dev, /--turbopack\b/, 'dev script should include --turbopack');
});