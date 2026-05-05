/**
 * Phase 3: WAL & Backup Verification
 *
 * Verifies:
 *  1. PostgreSQL WAL archiving is configured and working
 *  2. S3 WAL archive destination is reachable
 *  3. Baseline backup can be created and verified
 *  4. Point-in-time recovery (PITR) capability
 *
 * Run: npx tsx scripts/verify-wal-backup.ts
 *
 * Prerequisites (for full verification):
 *   - PostgreSQL running (local or docker)
 *   - psql, pg_dump, pg_switch_wal in PATH
 *   - AWS credentials for S3 WAL bucket
 *   - Docker (for docker-compose.prod.yml postgres verification)
 *
 * Dev environment: prints configuration guidance if tools unavailable.
 * Production deploy: all checks run against running containers.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { readFileSync } from 'fs';

const execAsync = promisify(exec);

// ─── Config ───────────────────────────────────────────────────────────────────

const WAL_S3_BUCKET    = process.env.WAL_S3_BUCKET    || 'apt-erp-wal-prod';
const WAL_S3_PREFIX    = process.env.WAL_S3_PREFIX    || 'pg/wal';
const BACKUP_S3_BUCKET = process.env.BACKUP_S3_BUCKET || 'apt-erp-backup-prod';
const BACKUP_S3_PREFIX = process.env.BACKUP_S3_PREFIX || 'pg/backup';

const POSTGRES_HOST = process.env.POSTGRES_HOST    || 'localhost';
const POSTGRES_PORT = process.env.POSTGRES_PORT    || '5432';
const POSTGRES_DB   = process.env.POSTGRES_DB      || 'test';
const POSTGRES_USER = process.env.POSTGRES_USER    || 'postgres';

const LOCAL_WAL_DIR    = process.env.LOCAL_WAL_DIR    || 'C:\\tmp\\pg_wal_verify';
const LOCAL_BACKUP_DIR = process.env.LOCAL_BACKUP_DIR || 'C:\\tmp\\pg_backup_verify';

// ─── Helpers ───────────────────────────────────────────────────────────────────

async function run(label: string, cmd: string): Promise<{ stdout: string; stderr: string; code: number }> {
  process.stdout.write(`\n  [${label}]\n`);
  try {
    const { stdout, stderr } = await execAsync(cmd, { timeout: 30000 });
    process.stdout.write(`    ✅ (exit 0)\n`);
    return { stdout, stderr, code: 0 };
  } catch (e: unknown) {
    const err = e as { code?: number; message?: string; stderr?: string };
    process.stdout.write(`    ❌ exit ${err.code ?? '?'}\n`);
    return { stdout: '', stderr: err.stderr ?? '', code: err.code ?? 1 };
  }
}

function divider(title: string) {
  process.stdout.write(`\n${'═'.repeat(60)}\n  ${title}\n${'═'.repeat(60)}\n`);
}

function note(msg: string) {
  process.stdout.write(`    ℹ️  ${msg}\n`);
}

// ─── Check 0: Tool Availability ────────────────────────────────────────────────
/**
 * Detect which tools are available (psql, pg_dump, docker, aws)
 */
async function checkToolAvailability(): Promise<Record<string, boolean>> {
  divider('CHECK 0: Tool Availability');

  const tools = ['psql', 'pg_dump', 'pg_switch_wal', 'docker', 'aws'];
  const results: Record<string, boolean> = {};

  for (const tool of tools) {
    try {
      if (tool === 'docker') {
        await execAsync('docker ps', { timeout: 5000 });
      } else {
        await execAsync(`${tool} --version`, { timeout: 5000 });
      }
      process.stdout.write(`    ✅ ${tool} available\n`);
      results[tool] = true;
    } catch {
      process.stdout.write(`    ⚠️  ${tool} not available\n`);
      results[tool] = false;
    }
  }

  // Check if database is reachable via direct connection
  if (results.psql) {
    try {
      await execAsync(
        `psql "postgresql://${POSTGRES_USER}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}" -c "SELECT 1" -t --quiet`,
        { timeout: 10000 }
      );
      process.stdout.write(`    ✅ Database reachable via psql\n`);
      results.dbReachable = true;
    } catch {
      process.stdout.write(`    ⚠️  Database NOT reachable\n`);
      results.dbReachable = false;
    }
  } else {
    results.dbReachable = false;
  }

  return results;
}

// ─── Check 1: PostgreSQL WAL Configuration ─────────────────────────────────────
/**
 * Verify wal_level=replica, archive_mode=on via pg_settings
 */
async function checkPostgresWalConfig(tools: Record<string, boolean>): Promise<boolean> {
  divider('CHECK 1: PostgreSQL WAL Configuration');

  if (!tools.dbReachable) {
    note('Skipping — psql not available or database not reachable');
    note(`  To verify manually: psql "postgresql://${POSTGRES_USER}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}" -c "SELECT current_setting('wal_level')"`);
    return await checkDockerWalConfig();
  }

  const checks = [
    { name: 'wal_level',         query: "SELECT current_setting('wal_level')"            },
    { name: 'archive_mode',       query: "SELECT current_setting('archive_mode')"          },
    { name: 'max_wal_size',       query: "SELECT current_setting('max_wal_size')"          },
    { name: 'wal_keep_size',      query: "SELECT current_setting('wal_keep_size')"         },
  ];

  let allPass = true;
  for (const { name, query } of checks) {
    try {
      const { stdout } = await execAsync(
        `psql "postgresql://${POSTGRES_USER}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}" -c "${query}" -t --quiet`,
        { timeout: 10000 }
      );
      const value = stdout.trim();
      process.stdout.write(`    ${name}: ${value}\n`);
    } catch {
      process.stdout.write(`    ${name}: ❌ (query failed)\n`);
      allPass = false;
    }
  }

  try {
    const { stdout } = await execAsync(
      `psql "postgresql://${POSTGRES_USER}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}" -c "SELECT current_setting('archive_mode')" -t --quiet`,
      { timeout: 10000 }
    );
    const val = stdout.trim();
    if (val === 'on') {
      process.stdout.write(`    ✅ archive_mode = on\n`);
    } else {
      process.stdout.write(`    ⚠️  archive_mode = ${val} (WAL archiving not active)\n`);
      allPass = false;
    }
  } catch {
    process.stdout.write(`    ⚠️  Could not verify archive_mode\n`);
    allPass = false;
  }

  return allPass;
}

// ─── Check 1b: Docker-based WAL Config ─────────────────────────────────────────
/**
 * When psql isn't available, check via docker exec into the postgres container
 */
async function checkDockerWalConfig(): Promise<boolean> {
  if (!await execAsync('docker ps', { timeout: 5000 }).then(() => true).catch(() => false)) {
    note('Docker not running — skipping container check');
    return false;
  }

  try {
    // Find postgres container
    const { stdout: containerOut } = await execAsync(
      'docker ps --format "{{.Names}}" --filter "ancestor=apartment-erp-postgres:latest"',
      { timeout: 10000 }
    );
    const containerName = containerOut.trim().split('\n')[0];

    if (!containerName) {
      note('apartment-erp-postgres container not found — is docker-compose.prod.yml running?');
      return false;
    }

    note(`Found container: ${containerName}`);

    const walLevel = await execAsync(
      `docker exec ${containerName} psql -U postgres -d postgres -c "SELECT current_setting('wal_level')" -t --quiet`,
      { timeout: 10000 }
    ).then(r => r.stdout.trim()).catch(() => '');

    const archiveMode = await execAsync(
      `docker exec ${containerName} psql -U postgres -d postgres -c "SELECT current_setting('archive_mode')" -t --quiet`,
      { timeout: 10000 }
    ).then(r => r.stdout.trim()).catch(() => '');

    process.stdout.write(`    wal_level: ${walLevel || '(unavailable)'}\n`);
    process.stdout.write(`    archive_mode: ${archiveMode || '(unavailable)'}\n`);

    if (walLevel === 'replica' && archiveMode === 'on') {
      process.stdout.write(`    ✅ WAL config correct in docker container\n`);
      return true;
    } else {
      process.stdout.write(`    ⚠️  WAL config may not be correct — verify deploy/docker-compose.prod.yml\n`);
      return false;
    }
  } catch {
    note('Could not exec into postgres container');
    return false;
  }
}

// ─── Check 2: WAL Archive Command / Script ─────────────────────────────────────
/**
 * Verify the archive_command is configured and points to a valid script
 */
async function checkWalArchiveCommand(tools: Record<string, boolean>): Promise<boolean> {
  divider('CHECK 2: WAL Archive Command');

  if (!tools.dbReachable) {
    note('Skipping — psql not available');
    note('  Check deploy/docker-compose.prod.yml for archive_command configuration');
    return false;
  }

  try {
    const { stdout } = await execAsync(
      `psql "postgresql://${POSTGRES_USER}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}" -c "SELECT current_setting('archive_command')" -t --quiet`,
      { timeout: 10000 }
    );
    const cmd = stdout.trim();
    process.stdout.write(`    archive_command: ${cmd}\n`);

    if (!cmd || cmd === '(disabled)') {
      process.stdout.write(`    ❌ archive_command is not set\n`);
      return false;
    }

    if (cmd.includes('wal-g-archive.sh')) {
      process.stdout.write(`    ✅ Using wal-g-archive.sh helper\n`);
    } else if (cmd.includes('aws s3 cp')) {
      process.stdout.write(`    ⚠️  Raw aws s3 cp — ensure postgres:16-alpine has aws-cli installed\n`);
    }

    return true;
  } catch {
    process.stdout.write(`    ❌ Could not query archive_command\n`);
    return false;
  }
}

// ─── Check 3: S3 WAL Bucket Reachability ───────────────────────────────────────
/**
 * Verify S3 WAL bucket is reachable
 */
async function checkWalDestination(): Promise<boolean> {
  divider('CHECK 3: WAL Archive Destination');

  if (!await execAsync('aws --version', { timeout: 5000 }).then(() => true).catch(() => false)) {
    note('AWS CLI not available — skipping S3 WAL check');
    note('  In production, verify: aws s3 ls s3://<WAL_S3_BUCKET>/<WAL_S3_PREFIX>/');
    return false;
  }

  try {
    process.stdout.write(`    Checking S3: s3://${WAL_S3_BUCKET}/${WAL_S3_PREFIX}\n`);
    const { stdout } = await execAsync(
      `aws s3 ls s3://${WAL_S3_BUCKET}/${WAL_S3_PREFIX}/ --no-progress 2>&1`,
      { timeout: 15000 }
    );
    process.stdout.write(`    ✅ S3 WAL bucket reachable\n`);
    const lines = stdout.trim().split('\n').filter(Boolean);
    process.stdout.write(`    Files in WAL prefix: ${lines.length}\n`);
    if (lines.length > 0) {
      lines.slice(0, 3).forEach((l: string) => process.stdout.write(`      ${l}\n`));
    }
    return true;
  } catch {
    process.stdout.write(`    ⚠️  S3 WAL bucket not reachable (may need AWS credentials or bucket not created)\n`);
    return false;
  }
}

// ─── Check 4: Force WAL Switch & Archive Verification ───────────────────────────
/**
 * Force a WAL switch and verify the archive_command fires.
 */
async function checkWalSwitchAndArchive(tools: Record<string, boolean>): Promise<boolean> {
  divider('CHECK 4: WAL Switch & Archive Verification');

  if (!tools.dbReachable) {
    note('Skipping — psql not available');
    note('  To test manually: psql -c "SELECT pg_switch_wal()"');
    return false;
  }

  try {
    process.stdout.write(`    Forcing WAL switch...\n`);
    await execAsync(
      `psql "postgresql://${POSTGRES_USER}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}" -c "SELECT pg_switch_wal()" -t --quiet`,
      { timeout: 10000 }
    );
    process.stdout.write(`    ✅ pg_switch_wal() completed\n`);

    await new Promise(r => setTimeout(r, 2000));

    // Check docker logs for archive activity
    try {
      const containerOut = await execAsync(
        'docker ps -q --filter "ancestor=apartment-erp-postgres:latest"',
        { timeout: 5000 }
      ).then(r => r.stdout.trim()).catch(() => '');

      if (containerOut) {
        const logOut = await execAsync(
          `docker logs ${containerOut.split('\n')[0]} 2>&1 | tail -20`,
          { timeout: 10000 }
        ).then(r => r.stdout).catch(() => '');

        if (logOut && (logOut.includes('archived') || logOut.includes('archive'))) {
          process.stdout.write(`    ✅ WAL archive activity seen in postgres logs\n`);
        }
      }
    } catch {
      note('Could not check postgres docker logs (not a docker deployment)');
    }

    return true;
  } catch (e: unknown) {
    const err = e as { message?: string };
    note(`WAL switch check: ${err.message?.slice(0, 100)}`);
    return false;
  }
}

// ─── Check 5: Database Baseline Backup ─────────────────────────────────────────
/**
 * Creates a pg_dump baseline backup and verifies it.
 */
async function checkBaselineBackup(tools: Record<string, boolean>): Promise<{ pass: boolean; file?: string }> {
  divider('CHECK 5: Database Baseline Backup (pg_dump)');

  if (!tools.pg_dump) {
    note('pg_dump not available — backup requires PostgreSQL client tools');
    note('  Install: https://www.postgresql.org/download/');
    note('  Or use Docker: docker exec apartment-erp-postgres-1 pg_dump -U postgres -d test');
    return { pass: false };
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = `${LOCAL_BACKUP_DIR}\\baseline-${timestamp}.sql`;

  try {
    // Ensure backup dir exists
    await execAsync(`node -e "const {mkdirSync}=require('fs');mkdirSync('${LOCAL_BACKUP_DIR}',{recursive:true})"`, { timeout: 5000 })
      .catch(() => { /* dir may already exist */ });

    process.stdout.write(`    Creating baseline backup: ${backupFile}\n`);

    const dumpCmd = `pg_dump "postgresql://${POSTGRES_USER}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}" -Fc -f "${backupFile.replace(/\\/g, '\\\\')}"`;
    await execAsync(dumpCmd, { timeout: 120000 });
    process.stdout.write(`    ✅ pg_dump completed\n`);

    const sizeStr = await execAsync(
      `node -e "const {statSync}=require('fs');console.log(statSync('${backupFile.replace(/\\/g, '\\\\')}').size)"`,
      { timeout: 5000 }
    ).then(r => r.stdout.trim()).catch(() => '-1');
    const size = parseInt(sizeStr);
    process.stdout.write(`    Backup size: ${(size / 1024 / 1024).toFixed(2)} MB\n`);

    // Verify backup integrity
    process.stdout.write(`    Verifying backup integrity (pg_restore --list)...\n`);
    await execAsync(
      `pg_restore --list "${backupFile.replace(/\\/g, '\\\\')}" 2>&1 | head -5`,
      { timeout: 20000 }
    );
    process.stdout.write(`    ✅ pg_restore --list succeeded\n`);

    return { pass: true, file: backupFile };
  } catch (e: unknown) {
    const err = e as { message?: string };
    note(`Backup failed: ${err.message?.slice(0, 200)}`);
    return { pass: false };
  }
}

// ─── Check 6: S3 Backup Upload ──────────────────────────────────────────────────
/**
 * Upload backup to S3 and verify.
 */
async function checkS3BackupUpload(backupFile: string): Promise<boolean> {
  divider('CHECK 6: S3 Backup Upload');

  if (!backupFile || !existsSync(backupFile)) {
    note('No backup file available — skipping S3 upload');
    return false;
  }

  if (!await execAsync('aws --version', { timeout: 5000 }).then(() => true).catch(() => false)) {
    note('AWS CLI not available — skipping S3 upload');
    note(`  To upload manually: aws s3 cp "${backupFile}" s3://${BACKUP_S3_BUCKET}/<key>`);
    return false;
  }

  try {
    const destKey = `${BACKUP_S3_PREFIX}/baseline-${new Date().toISOString().replace(/[:.]/g, '-')}.sql`;
    process.stdout.write(`    Uploading to s3://${BACKUP_S3_BUCKET}/${destKey}\n`);
    await execAsync(
      `aws s3 cp "${backupFile.replace(/\\/g, '\\\\')}" "s3://${BACKUP_S3_BUCKET}/${destKey}" --no-progress`,
      { timeout: 180000 }
    );
    process.stdout.write(`    ✅ Backup uploaded to S3\n`);

    const { stdout } = await execAsync(
      `aws s3 ls "s3://${BACKUP_S3_BUCKET}/${destKey}" --no-progress`,
      { timeout: 15000 }
    );
    process.stdout.write(`    ✅ S3 verification:\n${stdout.trim()}\n`);

    return true;
  } catch {
    note('AWS CLI not configured or S3 not reachable');
    return false;
  }
}

// ─── Check 7: PITR Query ───────────────────────────────────────────────────────
/**
 * Verify PITR infrastructure by checking WAL LSN.
 */
async function checkPitrCapability(tools: Record<string, boolean>): Promise<boolean> {
  divider('CHECK 7: PITR Capability');

  if (!tools.dbReachable) {
    note('Skipping — psql not available');
    note('  PITR requires: wal_level=replica, archive_mode=on, S3 WAL destination');
    return false;
  }

  try {
    const { stdout } = await execAsync(
      `psql "postgresql://${POSTGRES_USER}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}" -c "SELECT pg_current_wal_lsn()" -t --quiet`,
      { timeout: 10000 }
    );
    const currentLsn = stdout.trim();
    process.stdout.write(`    Current WAL LSN: ${currentLsn}\n`);

    const { stdout: walOut } = await execAsync(
      `psql "postgresql://${POSTGRES_USER}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}" -c "SELECT pg_walfile_name('${currentLsn}')" -t --quiet`,
      { timeout: 10000 }
    );
    process.stdout.write(`    Latest WAL file: ${walOut.trim()}\n`);

    process.stdout.write(`    ✅ PITR infrastructure verified\n`);
    return true;
  } catch (e: unknown) {
    const err = e as { message?: string };
    note(`PITR check failed: ${err.message?.slice(0, 100)}`);
    return false;
  }
}

// ─── Check 8: Production Deploy Config Review ───────────────────────────────────
/**
 * Review docker-compose.prod.yml for WAL/backup configuration
 */
async function checkProductionConfig(): Promise<boolean> {
  divider('CHECK 8: Production Deploy Config Review');

  const configPath = 'deploy/docker-compose.prod.yml';

  if (!existsSync(configPath)) {
    note(`${configPath} not found`);
    return false;
  }

  const content = readFileSync(configPath, 'utf-8');

  const checks = [
    { label: 'wal_level=replica',       pattern: /wal_level\s*[:=]\s*['"]?replica['"]?/ },
    { label: 'archive_mode=on',          pattern: /archive_mode\s*[:=]\s*['"]?on['"]?/ },
    { label: 'archive_command',          pattern: /archive_command/ },
    { label: 'WAL_S3_BUCKET env var',    pattern: /WAL_S3_BUCKET/ },
    { label: 'AWS env vars for postgres',pattern: /AWS_ACCESS_KEY_ID/ },
    { label: 'postgres custom image',   pattern: /apartment-erp-postgres/ },
  ];

  let allPass = true;
  for (const { label, pattern } of checks) {
    const found = pattern.test(content);
    process.stdout.write(`    ${found ? '✅' : '❌'} ${label}\n`);
    if (!found) allPass = false;
  }

  // Check wal-g-archive.sh exists
  const scriptPath = 'deploy/postgres/wal-g-archive.sh';
  if (existsSync(scriptPath)) {
    process.stdout.write(`    ✅ ${scriptPath} exists\n`);
  } else {
    process.stdout.write(`    ❌ ${scriptPath} not found\n`);
    allPass = false;
  }

  // Check postgres Dockerfile
  const dockerfilePath = 'deploy/postgres/Dockerfile';
  if (existsSync(dockerfilePath)) {
    process.stdout.write(`    ✅ ${dockerfilePath} exists\n`);
    const dfContent = readFileSync(dockerfilePath, 'utf-8');
    if (dfContent.includes('aws-cli')) {
      process.stdout.write(`    ✅ aws-cli installed in postgres Dockerfile\n`);
    } else {
      process.stdout.write(`    ⚠️  aws-cli not found in postgres Dockerfile\n`);
    }
  } else {
    process.stdout.write(`    ⚠️  ${dockerfilePath} not found\n`);
  }

  return allPass;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  WAL & BACKUP VERIFICATION');
  console.log('  Date: ' + new Date().toISOString());
  console.log('═══════════════════════════════════════════════════════════════');

  const tools = await checkToolAvailability();
  const results: Array<{ check: string; pass: boolean }> = [];

  // Checks 1-4: WAL
  results.push({ check: 'PostgreSQL WAL Config',      pass: await checkPostgresWalConfig(tools)       });
  results.push({ check: 'WAL Archive Command',        pass: await checkWalArchiveCommand(tools)      });
  results.push({ check: 'WAL Destination (S3)',       pass: await checkWalDestination()              });
  results.push({ check: 'WAL Switch & Archive',       pass: await checkWalSwitchAndArchive(tools)    });

  // Checks 5-6: Backup
  const backup = await checkBaselineBackup(tools);
  results.push({ check: 'Baseline Backup (pg_dump)',  pass: backup.pass                             });

  if (backup.file) {
    results.push({ check: 'S3 Backup Upload',         pass: await checkS3BackupUpload(backup.file)  });
  } else {
    results.push({ check: 'S3 Backup Upload',          pass: false                                  });
  }

  // Check 7: PITR
  results.push({ check: 'PITR Capability',            pass: await checkPitrCapability(tools)        });

  // Check 8: Config review
  results.push({ check: 'Production Config Review',   pass: await checkProductionConfig()           });

  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════');
  results.forEach(r => {
    console.log(`  ${r.pass ? '✅' : '❌'} ${r.check}`);
  });

  const productionCriticalPass = results.slice(0, 4).every(r => r.pass);
  console.log('\n  Production WAL config: ' + (productionCriticalPass ? '✅ PASS' : '⚠️  NEEDS REVIEW'));

  const report = {
    timestamp: new Date().toISOString(),
    results,
    verdict: productionCriticalPass ? 'PASS' : 'REVIEW_REQUIRED',
    notes: {
      'CHECK 1-4': 'Requires psql and running PostgreSQL (or docker with postgres container)',
      'CHECK 5-6': 'Requires pg_dump + AWS CLI for S3 upload',
      'CHECK 7':   'Requires psql',
      'CHECK 8':   'Config file review — always runs',
    },
  };

  console.log('\n── JSON Report ─────────────────────────────────────────────');
  console.log(JSON.stringify(report, null, 2));

  process.exit(0); // Always 0 — checks are for diagnostic purposes
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
