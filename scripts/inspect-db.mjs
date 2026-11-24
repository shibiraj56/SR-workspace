import { DatabaseSync } from 'node:sqlite';

const dbPath = 'apps/api/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/9b75c6a3fa194222caa4b69ae41bd3ea54926321786b5dac259f1f032c1482e0.sqlite';
const db = new DatabaseSync(dbPath);

const usersList = db.prepare("SELECT id, email, first_name, last_name, status FROM users").all();
console.log('Users:', usersList);

const tenantsList = db.prepare("SELECT id, name, slug, status FROM tenants").all();
console.log('Tenants:', tenantsList);

const userTenantsList = db.prepare("SELECT * FROM user_tenants").all();
console.log('User Tenants:', userTenantsList);

const userRolesList = db.prepare("SELECT ur.*, r.name as role_name, r.code as role_code FROM user_roles ur JOIN roles r ON ur.role_id = r.id").all();
console.log('User Roles:', userRolesList);
