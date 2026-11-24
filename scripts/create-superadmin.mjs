import readline from 'node:readline';
import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

// Resolve bcrypt-ts from @sr-workspace/api using the existing pnpm workspace architecture
let hashFn;
try {
  const bcryptModule = await import('bcrypt-ts');
  hashFn = bcryptModule.hash;
} catch {
  const apiRequire = createRequire(new URL('../apps/api/package.json', import.meta.url));
  const bcryptTsUrl = pathToFileURL(apiRequire.resolve('bcrypt-ts')).href;
  const bcryptModule = await import(bcryptTsUrl);
  hashFn = bcryptModule.hash;
}

// Load backend hashing configuration to ensure CLI password hashes match authentication API
let bcryptSaltRounds = 8;
try {
  const { AUTH_CONSTANTS } = await import('../apps/api/src/config/constants.ts');
  if (AUTH_CONSTANTS?.BCRYPT_SALT_ROUNDS) {
    bcryptSaltRounds = AUTH_CONSTANTS.BCRYPT_SALT_ROUNDS;
  }
} catch {
  bcryptSaltRounds = 8;
}

/**
 * Hash a plain text password using pure bcrypt-ts matching backend implementation.
 * Work factor strictly defaults to AUTH_CONSTANTS.BCRYPT_SALT_ROUNDS (8).
 */
async function hashPassword(password, saltRounds = bcryptSaltRounds) {
  return hashFn(password, saltRounds);
}

function question(rl, query) {
  return new Promise((resolve) => rl.question(query, resolve));
}

function escapeSql(str) {
  return str.replace(/'/g, "''");
}

function runD1Sql(sql) {
  const sanitized = sql.replace(/\r?\n/g, ' ');
  // Strictly enforce --local flag to connect only to the local D1 database
  execSync(`pnpm --filter @sr-workspace/api exec wrangler d1 execute DB --local --command "${sanitized}"`, {
    stdio: 'pipe',
  });
}

async function main() {
  console.log('========================================================');
  console.log('  SR WORKSPACE - Secure Super Administrator Setup');
  console.log('========================================================\n');

  let email = process.argv[2];
  let password = process.argv[3];
  let tenantName = process.argv[4];

  let rl;
  if (!email || !password || !tenantName) {
    rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  try {
    if (!email) {
      email = await question(rl, 'Enter administrator email: ');
    }
    if (!password) {
      password = await question(rl, 'Enter secure administrator password (min 8 chars): ');
    }
    if (!tenantName) {
      tenantName = (await question(rl, 'Enter workspace/tenant name (default: SR CODE LABS): ')) || 'SR CODE LABS';
    }
  } finally {
    if (rl) {
      rl.close();
    }
  }

  email = (email || '').trim().toLowerCase();
  password = (password || '').trim();
  tenantName = (tenantName || '').trim() || 'SR CODE LABS';

  if (!email || !email.includes('@')) {
    console.error('Error: A valid email address is required.');
    process.exit(1);
  }

  if (password.length < 8) {
    console.error('Error: Password must be at least 8 characters long.');
    process.exit(1);
  }

  console.log(`Hashing password securely using backend bcrypt-ts configuration (salt rounds: ${bcryptSaltRounds})...`);
  const passwordHash = await hashPassword(password);

  const userId = crypto.randomUUID();
  const tenantId = crypto.randomUUID();
  const roleId = crypto.randomUUID();
  const now = Date.now();

  const slug = tenantName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'workspace';

  console.log(`Checking local Cloudflare D1 database state...`);

  // Check if account with same email already exists
  const checkUserOutput = execSync(
    `pnpm --filter @sr-workspace/api exec wrangler d1 execute DB --local --command "SELECT id FROM users WHERE email='${escapeSql(email)}';"`,
    { encoding: 'utf-8' }
  );

  if (checkUserOutput.includes(`"id":`)) {
    console.error(`\nError: An account with email "${email}" already exists in local D1.`);
    process.exit(1);
  }

  // Check if SUPER_ADMIN role exists in database or insert
  const checkRoleOutput = execSync(
    `pnpm --filter @sr-workspace/api exec wrangler d1 execute DB --local --command "SELECT id FROM roles WHERE code='SUPER_ADMIN';"`,
    { encoding: 'utf-8' }
  );

  let superAdminRoleId = roleId;
  const match = checkRoleOutput.match(/"id":\s*"([^"]+)"/);
  if (match && match[1]) {
    superAdminRoleId = match[1];
  } else {
    runD1Sql(
      `INSERT INTO roles (id, name, code, role_type, description, is_default, created_at, updated_at) VALUES ('${roleId}', 'Super Administrator', 'SUPER_ADMIN', 'SYSTEM', 'Full system access across all tenants', 0, ${now}, ${now});`
    );
  }

  console.log(`Registering SUPER_ADMIN account in local Cloudflare D1...`);

  // 1. Insert user
  runD1Sql(
    `INSERT INTO users (id, email, password_hash, first_name, last_name, status, email_verified, created_at, updated_at) VALUES ('${userId}', '${escapeSql(email)}', '${passwordHash}', 'System', 'Administrator', 'ACTIVE', 1, ${now}, ${now});`
  );

  // 2. Insert tenant
  runD1Sql(
    `INSERT INTO tenants (id, name, slug, status, plan, created_at, updated_at) VALUES ('${tenantId}', '${escapeSql(tenantName)}', '${escapeSql(slug)}-${userId.substring(0, 6)}', 'ACTIVE', 'ENTERPRISE', ${now}, ${now});`
  );

  // 3. Insert tenant settings
  const settingsId = crypto.randomUUID();
  runD1Sql(
    `INSERT INTO tenant_settings (id, tenant_id, timezone, currency, created_at, updated_at) VALUES ('${settingsId}', '${tenantId}', 'UTC', 'USD', ${now}, ${now});`
  );

  // 4. Map user to tenant as default
  const userTenantId = crypto.randomUUID();
  runD1Sql(
    `INSERT INTO user_tenants (id, user_id, tenant_id, is_default, status, joined_at) VALUES ('${userTenantId}', '${userId}', '${tenantId}', 1, 'ACTIVE', ${now});`
  );

  // 5. Map user to SUPER_ADMIN role
  const userRoleId = crypto.randomUUID();
  runD1Sql(
    `INSERT INTO user_roles (id, user_id, role_id, tenant_id, assigned_at) VALUES ('${userRoleId}', '${userId}', '${superAdminRoleId}', '${tenantId}', ${now});`
  );

  console.log('\n========================================================');
  console.log('✓ SUPER_ADMIN ACCOUNT CREATED SUCCESSFULLY IN LOCAL D1!');
  console.log('========================================================');
  console.log(`Email:       ${email}`);
  console.log(`Workspace:   ${tenantName}`);
  console.log(`User ID:     ${userId}`);
  console.log(`Tenant ID:   ${tenantId}`);
  console.log(`Role:        SUPER_ADMIN (${superAdminRoleId})`);
  console.log('\nYou can now log in at http://localhost:5173/login using these credentials.\n');
}

main().catch((err) => {
  console.error('Failed to create super administrator:', err.message);
  process.exit(1);
});
