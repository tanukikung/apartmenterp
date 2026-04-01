#!/usr/bin/env tsx
/**
 * Apartment ERP — Setup Script
 *
 * One-command local setup:
 *   npm run setup
 *
 * Prerequisites:
 *   - Docker: docker compose -f docker-compose.dev.yml up -d
 *   - OR PostgreSQL running on localhost:5432
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = __dirname;
const ENV_FILE = join(ROOT, '.env');
const ENV_EXAMPLE = join(ROOT, '.env.example');

function generateSecret(len: number = 32): string {
  const chars = 'abcdef0123456789';
  return Array.from({ length: len }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join('');
}

function main() {
  console.log('\n🏠 Apartment ERP Setup\n' + '─'.repeat(40));

  // Step 1: Create .env if missing
  if (!existsSync(ENV_FILE)) {
    if (existsSync(ENV_EXAMPLE)) {
      console.log('📄 Creating .env from .env.example…');
      let content = readFileSync(ENV_EXAMPLE, 'utf-8');
      // Generate secrets
      content = content.replace(
        /NEXTAUTH_SECRET="REPLACE_WITH_[^"]*"/,
        `NEXTAUTH_SECRET="${generateSecret(32)}"`
      );
      content = content.replace(
        /CRON_SECRET="REPLACE_WITH_[^"]*"/,
        `CRON_SECRET="${generateSecret(32)}"`
      );
      writeFileSync(ENV_FILE, content);
      console.log('✅ .env created with generated secrets.');
    } else {
      console.log('❌ .env.example not found. Cannot create .env.');
      process.exit(1);
    }
  } else {
    console.log('✅ .env already exists, skipping creation.');
  }

  // Step 2: Run migrations
  console.log('\n🔄 Running Prisma migrations…');
  try {
    execSync('npx prisma migrate dev --name init', {
      cwd: ROOT,
      stdio: 'inherit',
    });
    console.log('✅ Migrations applied.');
  } catch (err: any) {
    if (err.status === 0 || err.message?.includes('already been applied')) {
      console.log('ℹ️  No pending migrations (already up to date).');
    } else {
      console.error('❌ Migration failed:', err.message);
      process.exit(1);
    }
  }

  // Step 3: Seed database
  console.log('\n🌱 Seeding database…');
  try {
    execSync('npx prisma db seed', { cwd: ROOT, stdio: 'inherit' });
    console.log('✅ Seed complete.');
  } catch (err: any) {
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  }

  console.log('\n' + '─'.repeat(40));
  console.log('🎉 Setup complete!');
  console.log('\nNext steps:');
  console.log('  npm run dev        → Start development server on http://localhost:3001');
  console.log('  npm run db:studio  → Open Prisma Studio\n');
}

main();
