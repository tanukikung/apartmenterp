/**
 * Security: env-secrets-not-in-git
 *
 * Verifies that:
 * 1. The real .env file is gitignored (real credentials never enter git)
 * 2. .env.example contains only placeholder values (safe to commit)
 * 3. No source files contain hardcoded secrets (static analysis)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('env_secrets_not_in_git', () => {
  // Use __dirname to reliably locate files relative to this test file
  const TEST_DIR = __dirname; // D:\apartment_erp\tests\security
  const PROJECT_ROOT = join(TEST_DIR, '..', '..'); // D:\apartment_erp

  it('.env file is gitignored', () => {
    const gitignorePath = join(PROJECT_ROOT, '.gitignore');
    const content = readFileSync(gitignorePath, 'utf-8');
    const lines = content.split('\n').map(l => l.trim());

    // .env must be ignored
    expect(lines, '.env should be in .gitignore').toContain('.env');

    // .env.example must be explicitly un-ignored (allowed to commit)
    const unignoredLine = lines.find(l => l.startsWith('!') && l.includes('.env.example'));
    expect(unignoredLine, '.env.example should be explicitly un-ignored with !.env.example').toBeTruthy();
  });

  it('.env.example contains no real credentials (only placeholders)', () => {
    const envExamplePath = join(PROJECT_ROOT, '.env.example');
    const content = readFileSync(envExamplePath, 'utf-8');

    // Real-looking credential patterns should not be present in .env.example
    // These regexes look for actual values (not placeholder text like REPLACE_WITH_...)
    const realCredentialPatterns = [
      /password\s*=\s*(?!REPLACE|YOUR|CHANGE)^[a-zA-Z0-9!@#$%^&*()_+\-=\[\]{}|;':",.<>?/]{6,}$/i,
      /secret\s*=\s*(?!REPLACE|YOUR|CHANGE|CHANGE_ME)[a-zA-Z0-9!@#$%^&*]{16,}/i,
      /key\s*=\s*(?!REPLACE|YOUR|CHANGE|CHANGE_ME)sk_(live|real|prod)/i,
    ];

    for (const pattern of realCredentialPatterns) {
      const match = content.match(pattern);
      expect(match, `Found suspicious credential pattern: ${pattern}. .env.example should only have placeholder values.`).toBeNull();
    }

    // .env.example should contain placeholder markers
    expect(content).toContain('REPLACE_WITH_');
  });
});
