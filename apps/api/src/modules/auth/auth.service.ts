import { eq, and, isNull } from 'drizzle-orm';
import {
  type AppDatabase,
  users,
  tenants,
  tenantSettings,
  userTenants,
  refreshTokens,
  roles,
  userRoles,
  rolePermissions,
  permissions,
} from '@sr-workspace/database';
import {
  hashPassword,
  verifyPassword,
  generateSecureToken,
  hashToken,
  signAccessToken,
} from '../../lib/crypto';
import { AUTH_CONSTANTS } from '../../config/constants';
import type { LoginInput, RegisterInput } from './auth.schemas';

export interface RequestMetadata {
  userAgent?: string;
  ipAddress?: string;
}

export class AuthService {
  /**
   * Authenticate a user by email and password, creating a new session.
   */
  static async login(
    db: AppDatabase,
    input: LoginInput,
    metadata: RequestMetadata,
    jwtSecret: string = AUTH_CONSTANTS.DEFAULT_DEV_JWT_SECRET
  ) {
    if (!input.email || !input.password) {
      throw { code: 'AUTH_INVALID_CREDENTIALS', message: 'Email and password are required.', status: 400 };
    }

    const user = await db.query.users.findFirst({
      where: eq(users.email, input.email.toLowerCase()),
    });

    if (!user) {
      throw { code: 'AUTH_INVALID_CREDENTIALS', message: 'Invalid email or password.', status: 401 };
    }

    if (user.status !== 'ACTIVE') {
      throw {
        code: 'AUTH_ACCOUNT_DISABLED',
        message: `Account is currently ${user.status.toLowerCase()}. Please contact your administrator.`,
        status: 403,
      };
    }

    const isMatch = await verifyPassword(input.password, user.passwordHash);
    if (!isMatch) {
      throw { code: 'AUTH_INVALID_CREDENTIALS', message: 'Invalid email or password.', status: 401 };
    }

    // Resolve user's active tenant
    const userTenantList = await db.query.userTenants.findMany({
      where: and(eq(userTenants.userId, user.id), eq(userTenants.status, 'ACTIVE')),
      with: {
        tenant: true,
      },
    });

    const activeUserTenant = userTenantList.find((ut) => ut.isDefault) || userTenantList[0];
    const activeTenant = activeUserTenant?.tenant;

    // Resolve user's roles and permissions within active tenant
    const userRolesList = await db.query.userRoles.findMany({
      where: eq(userRoles.userId, user.id),
      with: {
        role: {
          with: {
            rolePermissions: {
              with: {
                permission: true,
              },
            },
          },
        },
      },
    });

    const roleCodes = Array.from(new Set(userRolesList.map((ur) => ur.role.code)));
    const permissionCodes = Array.from(
      new Set(
        userRolesList.flatMap((ur) =>
          ur.role.rolePermissions.map((rp) => rp.permission.code)
        )
      )
    );

    // Generate high-entropy refresh token and store its SHA-256 hash
    const rawRefreshToken = generateSecureToken(32);
    const tokenHash = await hashToken(rawRefreshToken);
    const expiresAt = new Date(Date.now() + AUTH_CONSTANTS.REFRESH_TOKEN_TTL_SECONDS * 1000);

    await db.insert(refreshTokens).values({
      userId: user.id,
      tokenHash,
      userAgent: metadata.userAgent,
      ipAddress: metadata.ipAddress,
      expiresAt,
    });

    // Update last login timestamp
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

    // Sign short-lived JWT access token
    const accessToken = await signAccessToken(
      {
        sub: user.id,
        email: user.email,
        tenantId: activeTenant?.id,
        roles: roleCodes,
      },
      jwtSecret
    );

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        avatarUrl: user.avatarUrl,
        status: user.status,
      },
      tenant: activeTenant
        ? {
            id: activeTenant.id,
            name: activeTenant.name,
            slug: activeTenant.slug,
            plan: activeTenant.plan,
          }
        : null,
      roles: roleCodes,
      permissions: permissionCodes,
      accessToken,
      rawRefreshToken,
    };
  }

  /**
   * Controlled user registration.
   * If database is unseeded, allows initial bootstrap of system administrator.
   */
  static async register(
    db: AppDatabase,
    input: RegisterInput,
    metadata: RequestMetadata,
    jwtSecret: string = AUTH_CONSTANTS.DEFAULT_DEV_JWT_SECRET
  ) {
    // Check if any users exist in the database
    const existingAnyUser = await db.query.users.findFirst();
    const hasUsers = Boolean(existingAnyUser);

    // If users already exist, public registration is forbidden unless an authorized setupKey is provided
    if (hasUsers && input.setupKey !== 'SR_WORKSPACE_INITIAL_SETUP_KEY') {
      throw {
        code: 'REGISTRATION_CLOSED',
        message: 'Public registration is disabled. Users must be invited by a tenant administrator.',
        status: 403,
      };
    }

    // Check if email already registered
    const existing = await db.query.users.findFirst({
      where: eq(users.email, input.email.toLowerCase()),
    });

    if (existing) {
      throw { code: 'EMAIL_ALREADY_EXISTS', message: 'A user with this email address already exists.', status: 409 };
    }

    const passwordHash = await hashPassword(input.password);
    const userId = crypto.randomUUID();

    // Create user record
    await db.insert(users).values({
      id: userId,
      email: input.email.toLowerCase(),
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      status: 'ACTIVE',
      emailVerified: true,
    });

    // Create default tenant if this is the initial user
    const tenantId = crypto.randomUUID();
    const tenantName = input.tenantName || 'SR CODE LABS';
    const baseSlug = tenantName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'default-workspace';
    const tenantSlug = hasUsers ? `${baseSlug}-${userId.substring(0, 8)}` : baseSlug;

    await db.insert(tenants).values({
      id: tenantId,
      name: tenantName,
      slug: tenantSlug,
      status: 'ACTIVE',
      plan: 'ENTERPRISE',
    });

    await db.insert(tenantSettings).values({
      tenantId,
      timezone: 'UTC',
      currency: 'USD',
    });

    // Map user to tenant as default
    await db.insert(userTenants).values({
      userId,
      tenantId,
      isDefault: true,
      status: 'ACTIVE',
    });

    // Assign SUPER_ADMIN role if initial bootstrap
    let superAdminRole = await db.query.roles.findFirst({
      where: eq(roles.code, 'SUPER_ADMIN'),
    });

    if (!superAdminRole) {
      const roleId = crypto.randomUUID();
      await db.insert(roles).values({
        id: roleId,
        name: 'Super Administrator',
        code: 'SUPER_ADMIN',
        roleType: 'SYSTEM',
        description: 'Initial system administrator',
      });
      superAdminRole = { id: roleId, code: 'SUPER_ADMIN' } as any;
    }

    await db.insert(userRoles).values({
      userId,
      roleId: superAdminRole!.id,
      tenantId,
    });

    // Generate session tokens
    const rawRefreshToken = generateSecureToken(32);
    const tokenHash = await hashToken(rawRefreshToken);
    const expiresAt = new Date(Date.now() + AUTH_CONSTANTS.REFRESH_TOKEN_TTL_SECONDS * 1000);

    await db.insert(refreshTokens).values({
      userId,
      tokenHash,
      userAgent: metadata.userAgent,
      ipAddress: metadata.ipAddress,
      expiresAt,
    });

    const accessToken = await signAccessToken(
      {
        sub: userId,
        email: input.email.toLowerCase(),
        tenantId,
        roles: ['SUPER_ADMIN'],
      },
      jwtSecret
    );

    return {
      user: {
        id: userId,
        email: input.email.toLowerCase(),
        firstName: input.firstName,
        lastName: input.lastName,
        status: 'ACTIVE',
      },
      tenant: {
        id: tenantId,
        name: tenantName,
        slug: tenantSlug,
        plan: 'ENTERPRISE',
      },
      roles: ['SUPER_ADMIN'],
      accessToken,
      rawRefreshToken,
    };
  }

  /**
   * Rotate a refresh token and return fresh access and refresh tokens.
   * Enforces token reuse detection (revokes all sessions if a revoked token is presented).
   */
  static async refresh(
    db: AppDatabase,
    rawRefreshToken: string,
    metadata: RequestMetadata,
    jwtSecret: string = AUTH_CONSTANTS.DEFAULT_DEV_JWT_SECRET
  ) {
    if (!rawRefreshToken) {
      throw { code: 'AUTH_UNAUTHORIZED', message: 'No refresh token provided.', status: 401 };
    }

    const tokenHash = await hashToken(rawRefreshToken);
    const storedToken = await db.query.refreshTokens.findFirst({
      where: eq(refreshTokens.tokenHash, tokenHash),
    });

    // REUSE DETECTION: If token exists but was already revoked, a breach is suspected.
    if (storedToken && storedToken.revokedAt !== null) {
      // Invalidate all tokens for this user immediately
      await db
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(eq(refreshTokens.userId, storedToken.userId));

      throw {
        code: 'AUTH_TOKEN_REUSED',
        message: 'Security violation: Refresh token reuse detected. All active sessions have been invalidated.',
        status: 401,
      };
    }

    if (!storedToken || storedToken.expiresAt < new Date()) {
      throw { code: 'AUTH_UNAUTHORIZED', message: 'Invalid or expired session. Please log in again.', status: 401 };
    }

    // Verify user account status
    const user = await db.query.users.findFirst({
      where: eq(users.id, storedToken.userId),
    });

    if (!user || user.status !== 'ACTIVE') {
      throw { code: 'AUTH_FORBIDDEN', message: 'User account is inactive or disabled.', status: 403 };
    }

    // Atomic compare-and-swap rotation: only revoke if not already revoked
    // Prevents race conditions from concurrent duplicate refresh requests
    const updateResult = await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.id, storedToken.id), isNull(refreshTokens.revokedAt)))
      .returning({ id: refreshTokens.id });

    if (updateResult.length === 0) {
      // Token was rotated or revoked by a concurrent request at this exact moment!
      // Invalidate all tokens for this user immediately as breach prevention
      await db
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(eq(refreshTokens.userId, storedToken.userId));

      throw {
        code: 'AUTH_TOKEN_REUSED',
        message: 'Concurrent refresh conflict or token reuse detected. All active sessions have been invalidated.',
        status: 401,
      };
    }

    // Generate new refresh token and persist its hash
    const newRawRefreshToken = generateSecureToken(32);
    const newTokenHash = await hashToken(newRawRefreshToken);
    const expiresAt = new Date(Date.now() + AUTH_CONSTANTS.REFRESH_TOKEN_TTL_SECONDS * 1000);

    await db.insert(refreshTokens).values({
      userId: user.id,
      tokenHash: newTokenHash,
      userAgent: metadata.userAgent || storedToken.userAgent,
      ipAddress: metadata.ipAddress || storedToken.ipAddress,
      expiresAt,
    });

    // Fetch active tenant and roles
    const userTenant = await db.query.userTenants.findFirst({
      where: and(eq(userTenants.userId, user.id), eq(userTenants.status, 'ACTIVE')),
      with: { tenant: true },
    });

    const userRolesList = await db.query.userRoles.findMany({
      where: eq(userRoles.userId, user.id),
      with: { role: true },
    });

    const roleCodes = Array.from(new Set(userRolesList.map((ur) => ur.role.code)));

    const newAccessToken = await signAccessToken(
      {
        sub: user.id,
        email: user.email,
        tenantId: userTenant?.tenantId,
        roles: roleCodes,
      },
      jwtSecret
    );

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        status: user.status,
      },
      tenant: userTenant?.tenant || null,
      roles: roleCodes,
      accessToken: newAccessToken,
      rawRefreshToken: newRawRefreshToken,
    };
  }

  /**
   * Revoke an active refresh token session upon logout.
   */
  static async logout(db: AppDatabase, rawRefreshToken?: string) {
    if (!rawRefreshToken) return;

    try {
      const tokenHash = await hashToken(rawRefreshToken);
      await db
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(eq(refreshTokens.tokenHash, tokenHash));
    } catch {
      // Non-fatal error on logout
    }
  }

  /**
   * Retrieve the current authenticated user's profile and active tenant context.
   */
  static async getMe(db: AppDatabase, userId: string) {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      throw { code: 'USER_NOT_FOUND', message: 'User profile not found.', status: 404 };
    }

    const memberships = await db.query.userTenants.findMany({
      where: and(eq(userTenants.userId, userId), eq(userTenants.status, 'ACTIVE')),
      with: {
        tenant: true,
      },
    });

    const userRolesList = await db.query.userRoles.findMany({
      where: eq(userRoles.userId, userId),
      with: {
        role: {
          with: {
            rolePermissions: {
              with: {
                permission: true,
              },
            },
          },
        },
      },
    });

    const activeMembership = memberships.find((m) => m.isDefault) || memberships[0];
    const roleCodes = Array.from(new Set(userRolesList.map((ur) => ur.role.code)));
    const permissionCodes = Array.from(
      new Set(
        userRolesList.flatMap((ur) =>
          ur.role.rolePermissions.map((rp) => rp.permission.code)
        )
      )
    );

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        avatarUrl: user.avatarUrl,
        status: user.status,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
      },
      activeTenant: activeMembership?.tenant || null,
      tenants: memberships.map((m) => ({
        id: m.tenant.id,
        name: m.tenant.name,
        slug: m.tenant.slug,
        plan: m.tenant.plan,
        isDefault: m.isDefault,
      })),
      roles: roleCodes,
      permissions: permissionCodes,
    };
  }
}
