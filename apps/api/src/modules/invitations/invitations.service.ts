import { eq, and, isNull } from 'drizzle-orm';
import {
  type AppDatabase,
  invitations,
  employees,
  roles,
  users,
  userTenants,
  userRoles,
  refreshTokens,
  auditLogs,
} from '@sr-workspace/database';
import {
  generateSecureToken,
  hashToken,
  hashPassword,
  signAccessToken,
} from '../../lib/crypto';
import { AUTH_CONSTANTS } from '../../config/constants';
import {
  INVITATION_EXPIRY_DURATIONS,
  type InviteEmployeeInput,
  type AcceptInvitationInput,
} from './invitations.schemas';

export interface RequestMetadata {
  ipAddress?: string;
  userAgent?: string;
}

export class InvitationsService {
  /**
   * Create and issue an employee invitation.
   * Stores only the SHA-256 token hash in D1.
   * Never stores or logs the plain token.
   */
  static async createInvitation(
    db: AppDatabase,
    tenantId: string,
    employeeId: string,
    inviterId: string,
    input: InviteEmployeeInput,
    meta?: RequestMetadata
  ) {
    // 1. Verify employee exists and belongs to this tenant
    const employee = await db.query.employees.findFirst({
      where: and(
        eq(employees.id, employeeId),
        eq(employees.tenantId, tenantId)
      ),
    });

    if (!employee) {
      throw {
        code: 'EMPLOYEE_NOT_FOUND',
        message: 'Employee record not found within this workspace.',
        status: 404,
      };
    }

    // 2. Reject if employee is already linked to a user account
    if (employee.userId) {
      throw {
        code: 'EMPLOYEE_ALREADY_LINKED',
        message: 'This employee is already linked to an active user account.',
        status: 409,
      };
    }

    // 3. Resolve target invitation email from employee profile
    const invitationEmail = (employee.workEmail || employee.personalEmail)?.toLowerCase();
    if (!invitationEmail) {
      throw {
        code: 'EMPLOYEE_MISSING_EMAIL',
        message: 'Employee record must have a work email or personal email to receive an invitation.',
        status: 400,
      };
    }

    // 4. Resolve and validate the assigned role
    let roleId = input.roleId;
    if (roleId) {
      const selectedRole = await db.query.roles.findFirst({
        where: eq(roles.id, roleId),
      });

      if (!selectedRole) {
        throw {
          code: 'ROLE_NOT_FOUND',
          message: 'The selected role does not exist.',
          status: 404,
        };
      }

      // Ensure role is either a global system role or belongs to the current tenant
      if (selectedRole.tenantId && selectedRole.tenantId !== tenantId) {
        throw {
          code: 'INVALID_ROLE_SCOPE',
          message: 'The selected role does not belong to this workspace.',
          status: 403,
        };
      }
    } else {
      // Default to the standard system EMPLOYEE role
      const defaultRole = await db.query.roles.findFirst({
        where: eq(roles.code, 'EMPLOYEE'),
      });

      if (!defaultRole) {
        throw {
          code: 'DEFAULT_ROLE_NOT_FOUND',
          message: 'Standard employee role configuration not found.',
          status: 500,
        };
      }
      roleId = defaultRole.id;
    }

    // 5. Handle existing invitations for this employee
    const existingInvites = await db.query.invitations.findMany({
      where: and(
        eq(invitations.employeeId, employeeId),
        eq(invitations.tenantId, tenantId)
      ),
    });

    const now = new Date();
    const activePendingInvite = existingInvites.find((inv) => inv.status === 'PENDING');

    if (activePendingInvite) {
      // Check if the pending invitation is stale/expired
      if (activePendingInvite.expiresAt.getTime() <= now.getTime()) {
        // Mark stale pending invitation as EXPIRED before issuing replacement
        await db
          .update(invitations)
          .set({ status: 'EXPIRED', updatedAt: now })
          .where(eq(invitations.id, activePendingInvite.id));
      } else {
        // Still active and pending
        throw {
          code: 'INVITATION_ALREADY_PENDING',
          message: 'An active pending invitation already exists for this employee. Please revoke it first or wait for expiry.',
          status: 409,
        };
      }
    }

    // 6. Generate cryptographically secure token and SHA-256 hash
    const rawToken = generateSecureToken(32); // 64-character high-entropy hex string
    const tokenHash = await hashToken(rawToken);

    // 7. Calculate expiry based on approved durations
    const durationKey = input.expiresIn || '7d';
    const ttlMs = INVITATION_EXPIRY_DURATIONS[durationKey] || INVITATION_EXPIRY_DURATIONS['7d'];
    const expiresAt = new Date(now.getTime() + ttlMs);
    const invitationId = crypto.randomUUID();

    // 8. Insert invitation record
    await db.insert(invitations).values({
      id: invitationId,
      tenantId,
      employeeId,
      email: invitationEmail,
      tokenHash,
      roleId,
      status: 'PENDING',
      invitedBy: inviterId,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    });

    // 9. Write audit log (Never include raw token or token hash)
    await db.insert(auditLogs).values({
      tenantId,
      userId: inviterId,
      action: 'CREATE',
      entityType: 'invitation',
      entityId: invitationId,
      changes: JSON.stringify({
        employeeId,
        email: invitationEmail,
        roleId,
        expiresIn: durationKey,
        expiresAt: expiresAt.toISOString(),
      }),
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
      createdAt: now,
    });

    return {
      invitation: {
        id: invitationId,
        tenantId,
        employeeId,
        email: invitationEmail,
        roleId,
        status: 'PENDING' as const,
        expiresAt,
        createdAt: now,
      },
      rawToken,
    };
  }

  /**
   * Public verification of an invitation token.
   * Hashes the incoming token and returns safe public metadata.
   */
  static async verifyInvitation(db: AppDatabase, rawToken: string) {
    if (!rawToken || typeof rawToken !== 'string') {
      throw {
        code: 'INVALID_INVITATION',
        message: 'Invalid invitation token.',
        status: 400,
      };
    }

    const tokenHash = await hashToken(rawToken.trim());

    const invitation = await db.query.invitations.findFirst({
      where: eq(invitations.tokenHash, tokenHash),
      with: {
        tenant: true,
        employee: true,
        role: true,
      },
    });

    if (!invitation) {
      throw {
        code: 'INVITATION_NOT_FOUND',
        message: 'Invitation not found or token is invalid.',
        status: 404,
      };
    }

    if (invitation.status === 'ACCEPTED') {
      throw {
        code: 'INVITATION_ALREADY_ACCEPTED',
        message: 'This invitation has already been accepted.',
        status: 409,
      };
    }

    if (invitation.status === 'REVOKED') {
      throw {
        code: 'INVITATION_REVOKED',
        message: 'This invitation has been revoked by an administrator.',
        status: 410,
      };
    }

    const now = new Date();
    if (invitation.status === 'EXPIRED' || invitation.expiresAt.getTime() <= now.getTime()) {
      if (invitation.status === 'PENDING') {
        await db
          .update(invitations)
          .set({ status: 'EXPIRED', updatedAt: now })
          .where(eq(invitations.id, invitation.id));
      }
      throw {
        code: 'INVITATION_EXPIRED',
        message: 'This invitation has expired. Please request a new invitation from your administrator.',
        status: 410,
      };
    }

    if (invitation.status !== 'PENDING') {
      throw {
        code: 'INVALID_INVITATION',
        message: 'Invalid invitation state.',
        status: 400,
      };
    }

    // Ensure associated employee hasn't already been claimed
    if (invitation.employee.userId) {
      throw {
        code: 'EMPLOYEE_ALREADY_LINKED',
        message: 'The employee account associated with this invitation has already been claimed.',
        status: 409,
      };
    }

    return {
      email: invitation.email,
      tenantName: invitation.tenant.name,
      firstName: invitation.employee.firstName,
      lastName: invitation.employee.lastName,
      jobTitle: invitation.employee.jobTitle,
      roleName: invitation.role.name,
      expiresAt: invitation.expiresAt,
    };
  }

  /**
   * Public acceptance of an invitation.
   * Atomically creates user account, links employee, creates tenant membership,
   * assigns role, sets status to ACCEPTED, and creates user session.
   */
  static async acceptInvitation(
    db: AppDatabase,
    input: AcceptInvitationInput,
    metadata: RequestMetadata,
    jwtSecret: string
  ) {
    if (!input.token || typeof input.token !== 'string') {
      throw {
        code: 'INVALID_INVITATION',
        message: 'Invitation token is required.',
        status: 400,
      };
    }

    const tokenHash = await hashToken(input.token.trim());

    // 1. Resolve invitation
    const invitation = await db.query.invitations.findFirst({
      where: eq(invitations.tokenHash, tokenHash),
      with: {
        tenant: true,
        employee: true,
        role: true,
      },
    });

    if (!invitation) {
      throw {
        code: 'INVITATION_NOT_FOUND',
        message: 'Invitation not found or token is invalid.',
        status: 404,
      };
    }

    if (invitation.status === 'ACCEPTED') {
      throw {
        code: 'INVITATION_ALREADY_ACCEPTED',
        message: 'This invitation has already been accepted.',
        status: 409,
      };
    }

    if (invitation.status === 'REVOKED') {
      throw {
        code: 'INVITATION_REVOKED',
        message: 'This invitation has been revoked by an administrator.',
        status: 410,
      };
    }

    const now = new Date();
    if (invitation.status === 'EXPIRED' || invitation.expiresAt.getTime() <= now.getTime()) {
      if (invitation.status === 'PENDING') {
        await db
          .update(invitations)
          .set({ status: 'EXPIRED', updatedAt: now })
          .where(eq(invitations.id, invitation.id));
      }
      throw {
        code: 'INVITATION_EXPIRED',
        message: 'This invitation has expired. Please request a new invitation from your administrator.',
        status: 410,
      };
    }

    if (invitation.status !== 'PENDING') {
      throw {
        code: 'INVALID_INVITATION',
        message: 'Invalid invitation state.',
        status: 400,
      };
    }

    // 2. Re-verify employee eligibility
    const employee = await db.query.employees.findFirst({
      where: and(
        eq(employees.id, invitation.employeeId),
        eq(employees.tenantId, invitation.tenantId)
      ),
    });

    if (!employee) {
      throw {
        code: 'EMPLOYEE_NOT_FOUND',
        message: 'Associated employee record was not found.',
        status: 404,
      };
    }

    if (employee.userId) {
      throw {
        code: 'EMPLOYEE_ALREADY_LINKED',
        message: 'The employee account associated with this invitation is already linked to a user.',
        status: 409,
      };
    }

    // 3. Lock email strictly to invitation email and ensure no existing user
    const lockedEmail = invitation.email.toLowerCase();
    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, lockedEmail),
    });

    if (existingUser) {
      throw {
        code: 'EMAIL_ALREADY_EXISTS',
        message: 'A user account with this email address already exists.',
        status: 409,
      };
    }

    // 4. Prepare user creation credentials and session
    const userId = crypto.randomUUID();
    const passwordHash = await hashPassword(input.password);
    const firstName = input.firstName?.trim() || employee.firstName;
    const lastName = input.lastName?.trim() || employee.lastName;

    const rawRefreshToken = generateSecureToken(32);
    const refreshTokenHash = await hashToken(rawRefreshToken);
    const refreshTokenExpiresAt = new Date(
      now.getTime() + AUTH_CONSTANTS.REFRESH_TOKEN_TTL_SECONDS * 1000
    );

    // 5. Execute atomic account creation via D1 batch
    await db.batch([
      // Create user record
      db.insert(users).values({
        id: userId,
        email: lockedEmail,
        passwordHash,
        firstName,
        lastName,
        status: 'ACTIVE',
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      }),
      // Link employee record to the newly created user
      db
        .update(employees)
        .set({
          userId,
          updatedAt: now,
        })
        .where(and(eq(employees.id, employee.id), isNull(employees.userId))),
      // Create tenant membership
      db.insert(userTenants).values({
        userId,
        tenantId: invitation.tenantId,
        isDefault: true,
        status: 'ACTIVE',
        joinedAt: now,
      }),
      // Assign the approved role
      db.insert(userRoles).values({
        userId,
        roleId: invitation.roleId,
        tenantId: invitation.tenantId,
      }),
      // Mark invitation as ACCEPTED
      db
        .update(invitations)
        .set({
          status: 'ACCEPTED',
          acceptedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(invitations.id, invitation.id),
            eq(invitations.status, 'PENDING')
          )
        ),
      // Create active refresh token session
      db.insert(refreshTokens).values({
        userId,
        tokenHash: refreshTokenHash,
        userAgent: metadata.userAgent,
        ipAddress: metadata.ipAddress,
        expiresAt: refreshTokenExpiresAt,
        createdAt: now,
      }),
      // Write audit log entry
      db.insert(auditLogs).values({
        tenantId: invitation.tenantId,
        userId,
        action: 'CREATE',
        entityType: 'user',
        entityId: userId,
        changes: JSON.stringify({
          action: 'ACCEPT_INVITATION',
          invitationId: invitation.id,
          employeeId: employee.id,
          roleId: invitation.roleId,
        }),
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        createdAt: now,
      }),
    ]);

    // 6. Sign JWT access token
    const accessToken = await signAccessToken(
      {
        sub: userId,
        email: lockedEmail,
        tenantId: invitation.tenantId,
        roles: [invitation.role.code],
      },
      jwtSecret
    );

    return {
      user: {
        id: userId,
        email: lockedEmail,
        firstName,
        lastName,
        status: 'ACTIVE',
      },
      tenant: {
        id: invitation.tenant.id,
        name: invitation.tenant.name,
        slug: invitation.tenant.slug,
        plan: invitation.tenant.plan,
      },
      roles: [invitation.role.code],
      permissions: [],
      accessToken,
      rawRefreshToken,
    };
  }

  /**
   * Revoke a pending invitation.
   */
  static async revokeInvitation(
    db: AppDatabase,
    tenantId: string,
    invitationId: string,
    userId: string,
    meta?: RequestMetadata
  ) {
    const invitation = await db.query.invitations.findFirst({
      where: and(
        eq(invitations.id, invitationId),
        eq(invitations.tenantId, tenantId)
      ),
    });

    if (!invitation) {
      throw {
        code: 'INVITATION_NOT_FOUND',
        message: 'Invitation record not found.',
        status: 404,
      };
    }

    if (invitation.status !== 'PENDING') {
      throw {
        code: 'INVALID_INVITATION_STATUS',
        message: `Only PENDING invitations can be revoked. Current status is ${invitation.status}.`,
        status: 400,
      };
    }

    const now = new Date();
    await db
      .update(invitations)
      .set({ status: 'REVOKED', updatedAt: now })
      .where(eq(invitations.id, invitationId));

    // Audit log
    await db.insert(auditLogs).values({
      tenantId,
      userId,
      action: 'UPDATE',
      entityType: 'invitation',
      entityId: invitationId,
      changes: JSON.stringify({
        action: 'REVOKE_INVITATION',
        previousStatus: 'PENDING',
        newStatus: 'REVOKED',
      }),
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
      createdAt: now,
    });

    return {
      id: invitationId,
      status: 'REVOKED' as const,
      updatedAt: now,
    };
  }
}
