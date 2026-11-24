import { eq, and, or, sql, desc, asc, count, isNull, inArray } from 'drizzle-orm';
import type { AppDatabase } from '@sr-workspace/database';
import {
  tenants,
  employees,
  departments,
  branches,
  users,
  shifts,
  employeeShifts,
  holidays,
  attendanceRecords,
  attendanceRegularizations,
  leaveTypes,
  leaveAllocations,
  leaveRequests,
  performanceCycles,
  performanceReviews,
  hrOnboardingTasks,
  hrLifecycleEvents,
  hrResignations,
  hrExitChecklists,
  hrDocumentMetadata,
  auditLogs,
} from '@sr-workspace/database';

export class HrService {
  // ==========================================
  // SHARED UTILITIES
  // ==========================================

  /**
   * Resolves the employee profile corresponding to a user within a tenant.
   */
  static async getEmployeeForUser(db: AppDatabase, tenantId: string, userId: string) {
    const emp = await db.query.employees.findFirst({
      where: and(eq(employees.tenantId, tenantId), eq(employees.userId, userId)),
    });
    return emp || null;
  }

  /**
   * Asserts an employee exists and belongs to the active tenant.
   */
  static async assertEmployeeInTenant(db: AppDatabase, tenantId: string, employeeId: string) {
    const emp = await db.query.employees.findFirst({
      where: and(eq(employees.tenantId, tenantId), eq(employees.id, employeeId)),
    });
    if (!emp) {
      throw {
        code: 'EMPLOYEE_NOT_FOUND',
        message: 'Employee record not found in this workspace.',
        status: 404,
      };
    }
    return emp;
  }

  // ==========================================
  // A. EMPLOYEE LIFECYCLE MANAGEMENT
  // ==========================================

  static async getLifecycle(db: AppDatabase, tenantId: string, employeeId: string) {
    await this.assertEmployeeInTenant(db, tenantId, employeeId);

    const [events, tasks, resignationsList] = await Promise.all([
      db.query.hrLifecycleEvents.findMany({
        where: and(eq(hrLifecycleEvents.tenantId, tenantId), eq(hrLifecycleEvents.employeeId, employeeId)),
        orderBy: [desc(hrLifecycleEvents.createdAt)],
      }),
      db.query.hrOnboardingTasks.findMany({
        where: and(eq(hrOnboardingTasks.tenantId, tenantId), eq(hrOnboardingTasks.employeeId, employeeId)),
        orderBy: [asc(hrOnboardingTasks.createdAt)],
      }),
      db.query.hrResignations.findMany({
        where: and(eq(hrResignations.tenantId, tenantId), eq(hrResignations.employeeId, employeeId)),
        orderBy: [desc(hrResignations.createdAt)],
        with: {
          exitChecklists: true,
        },
      }),
    ]);

    return {
      employeeId,
      events,
      onboardingTasks: tasks,
      resignations: resignationsList,
    };
  }

  static async createOnboardingTask(
    db: AppDatabase,
    tenantId: string,
    employeeId: string,
    input: any,
    userId: string
  ) {
    await this.assertEmployeeInTenant(db, tenantId, employeeId);

    if (input.assignedToEmployeeId) {
      await this.assertEmployeeInTenant(db, tenantId, input.assignedToEmployeeId);
    }

    const taskId = crypto.randomUUID();
    const now = new Date();

    const record = {
      id: taskId,
      tenantId,
      employeeId,
      title: input.title,
      category: input.category || 'DOCUMENTATION',
      status: 'PENDING' as const,
      assignedToEmployeeId: input.assignedToEmployeeId || null,
      dueDate: input.dueDate || null,
      notes: input.notes || null,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(hrOnboardingTasks).values(record);

    await db.insert(auditLogs).values({
      tenantId,
      userId,
      action: 'CREATE',
      entityType: 'hr_onboarding_task',
      entityId: taskId,
      changes: JSON.stringify({ employeeId, title: input.title }),
    });

    return record;
  }

  static async getOnboardingTasks(db: AppDatabase, tenantId: string, employeeId: string) {
    await this.assertEmployeeInTenant(db, tenantId, employeeId);

    return db.query.hrOnboardingTasks.findMany({
      where: and(eq(hrOnboardingTasks.tenantId, tenantId), eq(hrOnboardingTasks.employeeId, employeeId)),
      orderBy: [asc(hrOnboardingTasks.createdAt)],
    });
  }

  static async updateOnboardingTask(
    db: AppDatabase,
    tenantId: string,
    taskId: string,
    input: any,
    userId: string
  ) {
    const task = await db.query.hrOnboardingTasks.findFirst({
      where: and(eq(hrOnboardingTasks.tenantId, tenantId), eq(hrOnboardingTasks.id, taskId)),
    });

    if (!task) {
      throw {
        code: 'TASK_NOT_FOUND',
        message: 'Onboarding task not found.',
        status: 404,
      };
    }

    const updates: any = {
      updatedAt: new Date(),
    };

    if (input.title !== undefined) updates.title = input.title;
    if (input.category !== undefined) updates.category = input.category;
    if (input.status !== undefined) {
      updates.status = input.status;
      if (input.status === 'COMPLETED' && !task.completedAt) {
        updates.completedAt = new Date();
      }
    }
    if (input.assignedToEmployeeId !== undefined) updates.assignedToEmployeeId = input.assignedToEmployeeId;
    if (input.dueDate !== undefined) updates.dueDate = input.dueDate;
    if (input.notes !== undefined) updates.notes = input.notes;

    await db.update(hrOnboardingTasks).set(updates).where(eq(hrOnboardingTasks.id, taskId));

    await db.insert(auditLogs).values({
      tenantId,
      userId,
      action: 'UPDATE',
      entityType: 'hr_onboarding_task',
      entityId: taskId,
      changes: JSON.stringify(updates),
    });

    return { ...task, ...updates };
  }

  static async createResignation(
    db: AppDatabase,
    tenantId: string,
    employeeId: string,
    input: any,
    userId: string
  ) {
    await this.assertEmployeeInTenant(db, tenantId, employeeId);

    // Prevent duplicate active resignations
    const activeResignation = await db.query.hrResignations.findFirst({
      where: and(
        eq(hrResignations.tenantId, tenantId),
        eq(hrResignations.employeeId, employeeId),
        sql`${hrResignations.status} IN ('SUBMITTED', 'UNDER_REVIEW', 'APPROVED')`
      ),
    });

    if (activeResignation) {
      throw {
        code: 'RESIGNATION_EXISTS',
        message: 'An active resignation request already exists for this employee.',
        status: 409,
      };
    }

    const resignationId = crypto.randomUUID();
    const now = new Date();

    const record = {
      id: resignationId,
      tenantId,
      employeeId,
      resignationDate: input.resignationDate,
      proposedLastWorkingDate: input.proposedLastWorkingDate,
      reason: input.reason,
      status: 'SUBMITTED' as const,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(hrResignations).values(record);

    // Seed default exit clearance checklist items
    const defaultDepartments = ['IT', 'FINANCE', 'HR', 'ADMIN', 'OPERATIONS'] as const;
    const defaultItems: Record<string, string> = {
      IT: 'Return hardware assets, access cards and revoke software licenses',
      FINANCE: 'Settle travel expenses, advances and company credit card',
      HR: 'Exit interview, handover documentation and benefits termination',
      ADMIN: 'Return office keys and parking passes',
      OPERATIONS: 'Project handover and documentation sign-off',
    };

    for (const dept of defaultDepartments) {
      await db.insert(hrExitChecklists).values({
        id: crypto.randomUUID(),
        tenantId,
        resignationId,
        department: dept,
        item: defaultItems[dept],
        status: 'PENDING',
        createdAt: now,
        updatedAt: now,
      });
    }

    await db.insert(auditLogs).values({
      tenantId,
      userId,
      action: 'CREATE',
      entityType: 'hr_resignation',
      entityId: resignationId,
      changes: JSON.stringify({ employeeId, resignationDate: input.resignationDate }),
    });

    return record;
  }

  static async updateResignation(
    db: AppDatabase,
    tenantId: string,
    resignationId: string,
    input: any,
    userId: string,
    reviewerEmployeeId?: string
  ) {
    const resignation = await db.query.hrResignations.findFirst({
      where: and(eq(hrResignations.tenantId, tenantId), eq(hrResignations.id, resignationId)),
    });

    if (!resignation) {
      throw {
        code: 'RESIGNATION_NOT_FOUND',
        message: 'Resignation record not found.',
        status: 404,
      };
    }

    const updates: any = {
      updatedAt: new Date(),
    };

    if (input.status !== undefined) {
      updates.status = input.status;
      if (reviewerEmployeeId) {
        updates.reviewedByEmployeeId = reviewerEmployeeId;
        updates.reviewedAt = new Date();
      }
      // If approved or completed, record lifecycle event and update employee status
      if (input.status === 'COMPLETED') {
        await db.update(employees)
          .set({ employmentStatus: 'TERMINATED', updatedAt: new Date() })
          .where(and(eq(employees.tenantId, tenantId), eq(employees.id, resignation.employeeId)));

        await db.insert(hrLifecycleEvents).values({
          id: crypto.randomUUID(),
          tenantId,
          employeeId: resignation.employeeId,
          eventType: 'RESIGNATION',
          previousState: 'ACTIVE',
          newState: 'TERMINATED',
          effectiveDate: input.actualLastWorkingDate || resignation.proposedLastWorkingDate,
          remarks: 'Resignation exit clearance completed',
          recordedByUserId: userId,
          createdAt: new Date(),
        });
      }
    }

    if (input.actualLastWorkingDate !== undefined) updates.actualLastWorkingDate = input.actualLastWorkingDate;
    if (input.managerComments !== undefined) updates.managerComments = input.managerComments;
    if (input.exitInterviewNotes !== undefined) updates.exitInterviewNotes = input.exitInterviewNotes;

    await db.update(hrResignations).set(updates).where(eq(hrResignations.id, resignationId));

    await db.insert(auditLogs).values({
      tenantId,
      userId,
      action: 'UPDATE',
      entityType: 'hr_resignation',
      entityId: resignationId,
      changes: JSON.stringify(updates),
    });

    return { ...resignation, ...updates };
  }

  static async getExitChecklist(db: AppDatabase, tenantId: string, employeeId: string) {
    await this.assertEmployeeInTenant(db, tenantId, employeeId);

    const resignation = await db.query.hrResignations.findFirst({
      where: and(eq(hrResignations.tenantId, tenantId), eq(hrResignations.employeeId, employeeId)),
      orderBy: [desc(hrResignations.createdAt)],
    });

    if (!resignation) {
      return [];
    }

    return db.query.hrExitChecklists.findMany({
      where: and(eq(hrExitChecklists.tenantId, tenantId), eq(hrExitChecklists.resignationId, resignation.id)),
      orderBy: [asc(hrExitChecklists.department)],
    });
  }

  // ==========================================
  // B. EMPLOYEE DOCUMENT METADATA
  // ==========================================

  static async getDocuments(db: AppDatabase, tenantId: string, employeeId: string) {
    await this.assertEmployeeInTenant(db, tenantId, employeeId);

    return db.query.hrDocumentMetadata.findMany({
      where: and(eq(hrDocumentMetadata.tenantId, tenantId), eq(hrDocumentMetadata.employeeId, employeeId)),
      orderBy: [desc(hrDocumentMetadata.createdAt)],
    });
  }

  static async createDocument(
    db: AppDatabase,
    tenantId: string,
    employeeId: string,
    input: any,
    userId: string
  ) {
    await this.assertEmployeeInTenant(db, tenantId, employeeId);

    const docId = crypto.randomUUID();
    const now = new Date();

    const record = {
      id: docId,
      tenantId,
      employeeId,
      title: input.title,
      documentType: input.documentType,
      documentNumber: input.documentNumber || null,
      issuedDate: input.issuedDate || null,
      expiryDate: input.expiryDate || null,
      verificationStatus: 'PENDING' as const,
      notes: input.notes || null,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(hrDocumentMetadata).values(record);

    await db.insert(auditLogs).values({
      tenantId,
      userId,
      action: 'CREATE',
      entityType: 'hr_document_metadata',
      entityId: docId,
      changes: JSON.stringify({ employeeId, title: input.title, documentType: input.documentType }),
    });

    return record;
  }

  static async updateDocument(
    db: AppDatabase,
    tenantId: string,
    documentId: string,
    input: any,
    userId: string,
    verifiedByEmployeeId?: string
  ) {
    const doc = await db.query.hrDocumentMetadata.findFirst({
      where: and(eq(hrDocumentMetadata.tenantId, tenantId), eq(hrDocumentMetadata.id, documentId)),
    });

    if (!doc) {
      throw {
        code: 'DOCUMENT_NOT_FOUND',
        message: 'Document metadata record not found.',
        status: 404,
      };
    }

    const updates: any = {
      updatedAt: new Date(),
    };

    if (input.title !== undefined) updates.title = input.title;
    if (input.documentType !== undefined) updates.documentType = input.documentType;
    if (input.documentNumber !== undefined) updates.documentNumber = input.documentNumber;
    if (input.issuedDate !== undefined) updates.issuedDate = input.issuedDate;
    if (input.expiryDate !== undefined) updates.expiryDate = input.expiryDate;
    if (input.notes !== undefined) updates.notes = input.notes;

    if (input.verificationStatus !== undefined) {
      updates.verificationStatus = input.verificationStatus;
      if (verifiedByEmployeeId) {
        updates.verifiedByEmployeeId = verifiedByEmployeeId;
        updates.verifiedAt = new Date();
      }
    }

    await db.update(hrDocumentMetadata).set(updates).where(eq(hrDocumentMetadata.id, documentId));

    await db.insert(auditLogs).values({
      tenantId,
      userId,
      action: 'UPDATE',
      entityType: 'hr_document_metadata',
      entityId: documentId,
      changes: JSON.stringify(updates),
    });

    return { ...doc, ...updates };
  }

  static async deleteDocument(db: AppDatabase, tenantId: string, documentId: string, userId: string) {
    const doc = await db.query.hrDocumentMetadata.findFirst({
      where: and(eq(hrDocumentMetadata.tenantId, tenantId), eq(hrDocumentMetadata.id, documentId)),
    });

    if (!doc) {
      throw {
        code: 'DOCUMENT_NOT_FOUND',
        message: 'Document metadata record not found.',
        status: 404,
      };
    }

    await db.delete(hrDocumentMetadata).where(eq(hrDocumentMetadata.id, documentId));

    await db.insert(auditLogs).values({
      tenantId,
      userId,
      action: 'DELETE',
      entityType: 'hr_document_metadata',
      entityId: documentId,
      changes: JSON.stringify({ title: doc.title }),
    });

    return { success: true };
  }

  // ==========================================
  // C. ATTENDANCE & REGULARIZATION
  // ==========================================

  static async punchIn(
    db: AppDatabase,
    tenantId: string,
    employeeId: string,
    input: any,
    ipAddress?: string
  ) {
    await this.assertEmployeeInTenant(db, tenantId, employeeId);

    const now = new Date();
    const dateStr = input.date || now.toISOString().slice(0, 10);

    // Look for active shift
    const activeShiftAssignment = await db.query.employeeShifts.findFirst({
      where: and(
        eq(employeeShifts.tenantId, tenantId),
        eq(employeeShifts.employeeId, employeeId),
        sql`${employeeShifts.effectiveFrom} <= ${dateStr}`,
        or(isNull(employeeShifts.effectiveTo), sql`${employeeShifts.effectiveTo} >= ${dateStr}`)
      ),
      with: { shift: true },
    });

    const shift = activeShiftAssignment?.shift;

    // Check existing attendance for date
    const existing = await db.query.attendanceRecords.findFirst({
      where: and(
        eq(attendanceRecords.tenantId, tenantId),
        eq(attendanceRecords.employeeId, employeeId),
        eq(attendanceRecords.date, dateStr)
      ),
    });

    if (existing && existing.punchInTime) {
      // Idempotent punch-in
      return existing;
    }

    // Determine status (PRESENT vs LATE based on shift start time & grace period)
    let initialStatus: 'PRESENT' | 'LATE' = 'PRESENT';
    if (shift) {
      const [shiftHour, shiftMinute] = shift.startTime.split(':').map(Number);
      const shiftStartMinutes = shiftHour * 60 + shiftMinute + shift.gracePeriodMinutes;
      const punchDate = new Date(now.getTime());
      const punchMinutes = punchDate.getUTCHours() * 60 + punchDate.getUTCMinutes();

      // If local date matches, compare minutes
      if (punchMinutes > shiftStartMinutes) {
        initialStatus = 'LATE';
      }
    }

    const recordId = existing ? existing.id : crypto.randomUUID();

    if (existing) {
      const updates = {
        punchInTime: now,
        punchInIp: ipAddress || null,
        punchInNote: input.note || null,
        status: initialStatus,
        shiftId: shift ? shift.id : existing.shiftId,
        updatedAt: now,
      };
      await db.update(attendanceRecords).set(updates).where(eq(attendanceRecords.id, existing.id));
      return { ...existing, ...updates };
    } else {
      const newRecord = {
        id: recordId,
        tenantId,
        employeeId,
        shiftId: shift ? shift.id : null,
        date: dateStr,
        punchInTime: now,
        punchOutTime: null,
        totalWorkMinutes: 0,
        totalBreakMinutes: 0,
        status: initialStatus,
        punchInIp: ipAddress || null,
        punchInNote: input.note || null,
        createdAt: now,
        updatedAt: now,
      };
      await db.insert(attendanceRecords).values(newRecord);
      return newRecord;
    }
  }

  static async punchOut(
    db: AppDatabase,
    tenantId: string,
    employeeId: string,
    input: any,
    ipAddress?: string
  ) {
    await this.assertEmployeeInTenant(db, tenantId, employeeId);

    const now = new Date();
    const dateStr = input.date || now.toISOString().slice(0, 10);

    const existing = await db.query.attendanceRecords.findFirst({
      where: and(
        eq(attendanceRecords.tenantId, tenantId),
        eq(attendanceRecords.employeeId, employeeId),
        eq(attendanceRecords.date, dateStr)
      ),
      with: { shift: true },
    });

    if (!existing || !existing.punchInTime) {
      throw {
        code: 'PUNCH_IN_REQUIRED',
        message: 'Cannot punch out without an existing punch-in record for today.',
        status: 400,
      };
    }

    if (existing.punchOutTime) {
      // Idempotent punch-out
      return existing;
    }

    const punchInMs = new Date(existing.punchInTime).getTime();
    const punchOutMs = now.getTime();
    const workMinutes = Math.max(0, Math.round((punchOutMs - punchInMs) / 60000) - existing.totalBreakMinutes);

    let finalStatus = existing.status;
    if (existing.shift && workMinutes < existing.shift.halfDayThresholdMinutes) {
      if (finalStatus === 'PRESENT' || finalStatus === 'LATE') {
        finalStatus = 'HALF_DAY';
      }
    }

    const updates = {
      punchOutTime: now,
      punchOutIp: ipAddress || null,
      punchOutNote: input.note || null,
      totalWorkMinutes: workMinutes,
      status: finalStatus,
      updatedAt: now,
    };

    await db.update(attendanceRecords).set(updates).where(eq(attendanceRecords.id, existing.id));
    return { ...existing, ...updates };
  }

  static async listAttendance(db: AppDatabase, tenantId: string, query: any) {
    const conditions = [eq(attendanceRecords.tenantId, tenantId)];

    if (query.employeeId) {
      conditions.push(eq(attendanceRecords.employeeId, query.employeeId));
    }
    if (query.startDate) {
      conditions.push(sql`${attendanceRecords.date} >= ${query.startDate}`);
    }
    if (query.endDate) {
      conditions.push(sql`${attendanceRecords.date} <= ${query.endDate}`);
    }
    if (query.status) {
      conditions.push(eq(attendanceRecords.status, query.status));
    }

    const whereClause = and(...conditions);
    const page = query.page || 1;
    const pageSize = query.pageSize || 50;
    const offset = (page - 1) * pageSize;

    const [totalRes, items] = await Promise.all([
      db.select({ total: count() }).from(attendanceRecords).where(whereClause),
      db.query.attendanceRecords.findMany({
        where: whereClause,
        limit: pageSize,
        offset,
        orderBy: [desc(attendanceRecords.date), desc(attendanceRecords.punchInTime)],
        with: {
          shift: true,
          employee: {
            columns: {
              id: true,
              employeeCode: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
    ]);

    return {
      items,
      total: totalRes[0]?.total ?? 0,
      page,
      pageSize,
    };
  }

  static async getAttendanceById(db: AppDatabase, tenantId: string, id: string) {
    const record = await db.query.attendanceRecords.findFirst({
      where: and(eq(attendanceRecords.tenantId, tenantId), eq(attendanceRecords.id, id)),
      with: {
        shift: true,
        employee: true,
        regularizations: true,
      },
    });

    if (!record) {
      throw {
        code: 'ATTENDANCE_NOT_FOUND',
        message: 'Attendance record not found.',
        status: 404,
      };
    }

    return record;
  }

  static async createRegularization(
    db: AppDatabase,
    tenantId: string,
    employeeId: string,
    input: any,
    userId: string
  ) {
    await this.assertEmployeeInTenant(db, tenantId, employeeId);

    const regId = crypto.randomUUID();
    const now = new Date();

    const record = {
      id: regId,
      tenantId,
      employeeId,
      attendanceRecordId: input.attendanceRecordId || null,
      date: input.date,
      requestedPunchIn: new Date(input.requestedPunchIn),
      requestedPunchOut: new Date(input.requestedPunchOut),
      reason: input.reason,
      status: 'PENDING' as const,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(attendanceRegularizations).values(record);

    await db.insert(auditLogs).values({
      tenantId,
      userId,
      action: 'CREATE',
      entityType: 'attendance_regularization',
      entityId: regId,
      changes: JSON.stringify({ employeeId, date: input.date }),
    });

    return record;
  }

  static async listRegularizations(db: AppDatabase, tenantId: string, employeeId?: string) {
    const conditions = [eq(attendanceRegularizations.tenantId, tenantId)];
    if (employeeId) {
      conditions.push(eq(attendanceRegularizations.employeeId, employeeId));
    }

    return db.query.attendanceRegularizations.findMany({
      where: and(...conditions),
      orderBy: [desc(attendanceRegularizations.createdAt)],
      with: {
        employee: {
          columns: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  }

  static async updateRegularization(
    db: AppDatabase,
    tenantId: string,
    id: string,
    input: any,
    userId: string,
    reviewerEmployeeId?: string,
    isSuperAdmin?: boolean
  ) {
    const reg = await db.query.attendanceRegularizations.findFirst({
      where: and(eq(attendanceRegularizations.tenantId, tenantId), eq(attendanceRegularizations.id, id)),
    });

    if (!reg) {
      throw {
        code: 'REGULARIZATION_NOT_FOUND',
        message: 'Regularization request not found.',
        status: 404,
      };
    }

    if (reviewerEmployeeId && reg.employeeId === reviewerEmployeeId && input.status === 'APPROVED') {
      throw {
        code: 'SELF_APPROVAL_FORBIDDEN',
        message: 'Employees cannot approve their own attendance regularization requests.',
        status: 403,
      };
    }

    const now = new Date();
    const updates = {
      status: input.status,
      reviewNotes: input.reviewNotes || null,
      reviewedByEmployeeId: reviewerEmployeeId || null,
      reviewedAt: now,
      updatedAt: now,
    };

    await db.update(attendanceRegularizations).set(updates).where(eq(attendanceRegularizations.id, id));

    // If approved, update or insert attendance record
    if (input.status === 'APPROVED') {
      const punchInMs = new Date(reg.requestedPunchIn).getTime();
      const punchOutMs = new Date(reg.requestedPunchOut).getTime();
      const durationMins = Math.max(0, Math.round((punchOutMs - punchInMs) / 60000));

      if (reg.attendanceRecordId) {
        await db.update(attendanceRecords)
          .set({
            punchInTime: new Date(reg.requestedPunchIn),
            punchOutTime: new Date(reg.requestedPunchOut),
            totalWorkMinutes: durationMins,
            status: 'PRESENT',
            updatedAt: now,
          })
          .where(eq(attendanceRecords.id, reg.attendanceRecordId));
      } else {
        await db.insert(attendanceRecords).values({
          id: crypto.randomUUID(),
          tenantId,
          employeeId: reg.employeeId,
          date: reg.date,
          punchInTime: new Date(reg.requestedPunchIn),
          punchOutTime: new Date(reg.requestedPunchOut),
          totalWorkMinutes: durationMins,
          totalBreakMinutes: 0,
          status: 'PRESENT',
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    await db.insert(auditLogs).values({
      tenantId,
      userId,
      action: 'UPDATE',
      entityType: 'attendance_regularization',
      entityId: id,
      changes: JSON.stringify(updates),
    });

    return { ...reg, ...updates };
  }

  // ==========================================
  // D. LEAVE MANAGEMENT
  // ==========================================

  static async listLeaveTypes(db: AppDatabase, tenantId: string) {
    return db.query.leaveTypes.findMany({
      where: eq(leaveTypes.tenantId, tenantId),
      orderBy: [asc(leaveTypes.name)],
    });
  }

  static async createLeaveType(db: AppDatabase, tenantId: string, input: any, userId: string) {
    const existing = await db.query.leaveTypes.findFirst({
      where: and(eq(leaveTypes.tenantId, tenantId), eq(leaveTypes.code, input.code)),
    });

    if (existing) {
      throw {
        code: 'LEAVE_TYPE_EXISTS',
        message: `Leave type with code '${input.code}' already exists.`,
        status: 409,
      };
    }

    const typeId = crypto.randomUUID();
    const now = new Date();

    const record = {
      id: typeId,
      tenantId,
      code: input.code,
      name: input.name,
      description: input.description || null,
      defaultDaysPerYear: input.defaultDaysPerYear || 0,
      isPaid: input.isPaid ?? true,
      requiresProof: input.requiresProof ?? false,
      isActive: input.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(leaveTypes).values(record);

    await db.insert(auditLogs).values({
      tenantId,
      userId,
      action: 'CREATE',
      entityType: 'leave_type',
      entityId: typeId,
      changes: JSON.stringify({ code: input.code, name: input.name }),
    });

    return record;
  }

  static async updateLeaveType(db: AppDatabase, tenantId: string, id: string, input: any, userId: string) {
    const lt = await db.query.leaveTypes.findFirst({
      where: and(eq(leaveTypes.tenantId, tenantId), eq(leaveTypes.id, id)),
    });

    if (!lt) {
      throw {
        code: 'LEAVE_TYPE_NOT_FOUND',
        message: 'Leave type not found.',
        status: 404,
      };
    }

    const updates: any = {
      updatedAt: new Date(),
    };

    if (input.name !== undefined) updates.name = input.name;
    if (input.description !== undefined) updates.description = input.description;
    if (input.defaultDaysPerYear !== undefined) updates.defaultDaysPerYear = input.defaultDaysPerYear;
    if (input.isPaid !== undefined) updates.isPaid = input.isPaid;
    if (input.requiresProof !== undefined) updates.requiresProof = input.requiresProof;
    if (input.isActive !== undefined) updates.isActive = input.isActive;

    await db.update(leaveTypes).set(updates).where(eq(leaveTypes.id, id));

    await db.insert(auditLogs).values({
      tenantId,
      userId,
      action: 'UPDATE',
      entityType: 'leave_type',
      entityId: id,
      changes: JSON.stringify(updates),
    });

    return { ...lt, ...updates };
  }

  static async listLeaveAllocations(db: AppDatabase, tenantId: string, employeeId?: string, year?: number) {
    const conditions = [eq(leaveAllocations.tenantId, tenantId)];
    if (employeeId) conditions.push(eq(leaveAllocations.employeeId, employeeId));
    if (year) conditions.push(eq(leaveAllocations.year, year));

    return db.query.leaveAllocations.findMany({
      where: and(...conditions),
      with: {
        leaveType: true,
        employee: {
          columns: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: [desc(leaveAllocations.year)],
    });
  }

  static async createLeaveAllocation(db: AppDatabase, tenantId: string, input: any, userId: string) {
    await this.assertEmployeeInTenant(db, tenantId, input.employeeId);

    const lt = await db.query.leaveTypes.findFirst({
      where: and(eq(leaveTypes.tenantId, tenantId), eq(leaveTypes.id, input.leaveTypeId)),
    });

    if (!lt) {
      throw {
        code: 'LEAVE_TYPE_NOT_FOUND',
        message: 'Leave type not found in this workspace.',
        status: 404,
      };
    }

    const existing = await db.query.leaveAllocations.findFirst({
      where: and(
        eq(leaveAllocations.tenantId, tenantId),
        eq(leaveAllocations.employeeId, input.employeeId),
        eq(leaveAllocations.leaveTypeId, input.leaveTypeId),
        eq(leaveAllocations.year, input.year)
      ),
    });

    if (existing) {
      throw {
        code: 'ALLOCATION_EXISTS',
        message: `Leave allocation already exists for this employee, leave type and year ${input.year}.`,
        status: 409,
      };
    }

    const allocId = crypto.randomUUID();
    const now = new Date();

    const record = {
      id: allocId,
      tenantId,
      employeeId: input.employeeId,
      leaveTypeId: input.leaveTypeId,
      year: input.year,
      allocatedDays: input.allocatedDays,
      usedDays: 0,
      pendingDays: 0,
      notes: input.notes || null,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(leaveAllocations).values(record);

    await db.insert(auditLogs).values({
      tenantId,
      userId,
      action: 'CREATE',
      entityType: 'leave_allocation',
      entityId: allocId,
      changes: JSON.stringify({ employeeId: input.employeeId, days: input.allocatedDays, year: input.year }),
    });

    return record;
  }

  static async getLeaveBalances(db: AppDatabase, tenantId: string, employeeId: string, targetYear?: number) {
    await this.assertEmployeeInTenant(db, tenantId, employeeId);

    const year = targetYear || new Date().getFullYear();
    const allocations = await db.query.leaveAllocations.findMany({
      where: and(
        eq(leaveAllocations.tenantId, tenantId),
        eq(leaveAllocations.employeeId, employeeId),
        eq(leaveAllocations.year, year)
      ),
      with: { leaveType: true },
    });

    return allocations.map((alloc) => ({
      leaveTypeId: alloc.leaveTypeId,
      leaveTypeCode: alloc.leaveType.code,
      leaveTypeName: alloc.leaveType.name,
      year: alloc.year,
      allocatedDays: alloc.allocatedDays,
      usedDays: alloc.usedDays,
      pendingDays: alloc.pendingDays,
      remainingDays: Math.max(0, alloc.allocatedDays - alloc.usedDays - alloc.pendingDays),
    }));
  }

  static async createLeaveRequest(
    db: AppDatabase,
    tenantId: string,
    employeeId: string,
    input: any,
    userId: string
  ) {
    await this.assertEmployeeInTenant(db, tenantId, employeeId);

    const lt = await db.query.leaveTypes.findFirst({
      where: and(eq(leaveTypes.tenantId, tenantId), eq(leaveTypes.id, input.leaveTypeId)),
    });

    if (!lt || !lt.isActive) {
      throw {
        code: 'LEAVE_TYPE_UNAVAILABLE',
        message: 'The requested leave type is not active or available.',
        status: 400,
      };
    }

    // Check for overlapping pending or approved requests
    const overlapping = await db.query.leaveRequests.findFirst({
      where: and(
        eq(leaveRequests.tenantId, tenantId),
        eq(leaveRequests.employeeId, employeeId),
        sql`${leaveRequests.status} IN ('PENDING', 'APPROVED')`,
        sql`NOT (${leaveRequests.endDate} < ${input.startDate} OR ${leaveRequests.startDate} > ${input.endDate})`
      ),
    });

    if (overlapping) {
      throw {
        code: 'OVERLAPPING_LEAVE_REQUEST',
        message: 'You already have a pending or approved leave request during these dates.',
        status: 409,
      };
    }

    const year = parseInt(input.startDate.slice(0, 4), 10);
    const allocation = await db.query.leaveAllocations.findFirst({
      where: and(
        eq(leaveAllocations.tenantId, tenantId),
        eq(leaveAllocations.employeeId, employeeId),
        eq(leaveAllocations.leaveTypeId, input.leaveTypeId),
        eq(leaveAllocations.year, year)
      ),
    });

    if (!allocation) {
      throw {
        code: 'NO_LEAVE_ALLOCATION',
        message: `No leave quota allocated for year ${year}.`,
        status: 400,
      };
    }

    const remainingDays = allocation.allocatedDays - allocation.usedDays - allocation.pendingDays;
    if (remainingDays < input.totalDays) {
      throw {
        code: 'INSUFFICIENT_LEAVE_BALANCE',
        message: `Insufficient leave balance. Requested: ${input.totalDays}, available: ${remainingDays}.`,
        status: 400,
      };
    }

    // Atomic update to pending_days
    await db.update(leaveAllocations)
      .set({
        pendingDays: allocation.pendingDays + input.totalDays,
        updatedAt: new Date(),
      })
      .where(eq(leaveAllocations.id, allocation.id));

    const reqId = crypto.randomUUID();
    const now = new Date();

    const record = {
      id: reqId,
      tenantId,
      employeeId,
      leaveTypeId: input.leaveTypeId,
      startDate: input.startDate,
      endDate: input.endDate,
      totalDays: input.totalDays,
      isHalfDay: input.isHalfDay ?? false,
      halfDayPeriod: input.halfDayPeriod || null,
      reason: input.reason,
      status: 'PENDING' as const,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(leaveRequests).values(record);

    await db.insert(auditLogs).values({
      tenantId,
      userId,
      action: 'CREATE',
      entityType: 'leave_request',
      entityId: reqId,
      changes: JSON.stringify({ employeeId, totalDays: input.totalDays, startDate: input.startDate }),
    });

    return record;
  }

  static async listLeaveRequests(db: AppDatabase, tenantId: string, query: any) {
    const conditions = [eq(leaveRequests.tenantId, tenantId)];

    if (query.employeeId) conditions.push(eq(leaveRequests.employeeId, query.employeeId));
    if (query.status) conditions.push(eq(leaveRequests.status, query.status));
    if (query.year) {
      const startOfYear = `${query.year}-01-01`;
      const endOfYear = `${query.year}-12-31`;
      conditions.push(sql`${leaveRequests.startDate} >= ${startOfYear} AND ${leaveRequests.startDate} <= ${endOfYear}`);
    }

    const whereClause = and(...conditions);
    const page = query.page || 1;
    const pageSize = query.pageSize || 50;
    const offset = (page - 1) * pageSize;

    const [totalRes, items] = await Promise.all([
      db.select({ total: count() }).from(leaveRequests).where(whereClause),
      db.query.leaveRequests.findMany({
        where: whereClause,
        limit: pageSize,
        offset,
        orderBy: [desc(leaveRequests.createdAt)],
        with: {
          leaveType: true,
          employee: {
            columns: {
              id: true,
              employeeCode: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
    ]);

    return {
      items,
      total: totalRes[0]?.total ?? 0,
      page,
      pageSize,
    };
  }

  static async getLeaveRequestById(db: AppDatabase, tenantId: string, id: string) {
    const req = await db.query.leaveRequests.findFirst({
      where: and(eq(leaveRequests.tenantId, tenantId), eq(leaveRequests.id, id)),
      with: {
        leaveType: true,
        employee: true,
      },
    });

    if (!req) {
      throw {
        code: 'LEAVE_REQUEST_NOT_FOUND',
        message: 'Leave request not found.',
        status: 404,
      };
    }

    return req;
  }

  static async approveLeaveRequest(
    db: AppDatabase,
    tenantId: string,
    id: string,
    reviewerEmployeeId: string,
    reviewNotes?: string,
    userId?: string,
    isSuperAdmin?: boolean
  ) {
    const req = await db.query.leaveRequests.findFirst({
      where: and(eq(leaveRequests.tenantId, tenantId), eq(leaveRequests.id, id)),
    });

    if (!req) {
      throw {
        code: 'LEAVE_REQUEST_NOT_FOUND',
        message: 'Leave request not found.',
        status: 404,
      };
    }

    if (reviewerEmployeeId && req.employeeId === reviewerEmployeeId) {
      throw {
        code: 'SELF_APPROVAL_FORBIDDEN',
        message: 'Employees cannot approve their own leave applications.',
        status: 403,
      };
    }

    if (req.status !== 'PENDING') {
      throw {
        code: 'INVALID_STATUS_TRANSITION',
        message: `Cannot approve a leave request with status '${req.status}'.`,
        status: 400,
      };
    }

    const year = parseInt(req.startDate.slice(0, 4), 10);
    const alloc = await db.query.leaveAllocations.findFirst({
      where: and(
        eq(leaveAllocations.tenantId, tenantId),
        eq(leaveAllocations.employeeId, req.employeeId),
        eq(leaveAllocations.leaveTypeId, req.leaveTypeId),
        eq(leaveAllocations.year, year)
      ),
    });

    if (alloc) {
      // Decrement pending, increment used
      await db.update(leaveAllocations)
        .set({
          pendingDays: Math.max(0, alloc.pendingDays - req.totalDays),
          usedDays: alloc.usedDays + req.totalDays,
          updatedAt: new Date(),
        })
        .where(eq(leaveAllocations.id, alloc.id));
    }

    const now = new Date();
    await db.update(leaveRequests)
      .set({
        status: 'APPROVED',
        reviewedByEmployeeId: reviewerEmployeeId,
        reviewNotes: reviewNotes || null,
        reviewedAt: now,
        updatedAt: now,
      })
      .where(eq(leaveRequests.id, id));

    await db.insert(auditLogs).values({
      tenantId,
      userId: userId || null,
      action: 'UPDATE',
      entityType: 'leave_request',
      entityId: id,
      changes: JSON.stringify({ status: 'APPROVED', reviewerEmployeeId, reviewNotes }),
    });

    return { ...req, status: 'APPROVED', reviewedByEmployeeId: reviewerEmployeeId, reviewedAt: now };
  }

  static async rejectLeaveRequest(
    db: AppDatabase,
    tenantId: string,
    id: string,
    reviewerEmployeeId: string,
    reviewNotes?: string,
    userId?: string
  ) {
    const req = await db.query.leaveRequests.findFirst({
      where: and(eq(leaveRequests.tenantId, tenantId), eq(leaveRequests.id, id)),
    });

    if (!req) {
      throw {
        code: 'LEAVE_REQUEST_NOT_FOUND',
        message: 'Leave request not found.',
        status: 404,
      };
    }

    if (reviewerEmployeeId && req.employeeId === reviewerEmployeeId) {
      throw {
        code: 'SELF_APPROVAL_FORBIDDEN',
        message: 'Employees cannot approve their own leave applications.',
        status: 403,
      };
    }

    if (req.status !== 'PENDING') {
      throw {
        code: 'INVALID_STATUS_TRANSITION',
        message: `Cannot reject a leave request with status '${req.status}'.`,
        status: 400,
      };
    }

    const year = parseInt(req.startDate.slice(0, 4), 10);
    const alloc = await db.query.leaveAllocations.findFirst({
      where: and(
        eq(leaveAllocations.tenantId, tenantId),
        eq(leaveAllocations.employeeId, req.employeeId),
        eq(leaveAllocations.leaveTypeId, req.leaveTypeId),
        eq(leaveAllocations.year, year)
      ),
    });

    if (alloc) {
      // Revert pending
      await db.update(leaveAllocations)
        .set({
          pendingDays: Math.max(0, alloc.pendingDays - req.totalDays),
          updatedAt: new Date(),
        })
        .where(eq(leaveAllocations.id, alloc.id));
    }

    const now = new Date();
    await db.update(leaveRequests)
      .set({
        status: 'REJECTED',
        reviewedByEmployeeId: reviewerEmployeeId,
        reviewNotes: reviewNotes || null,
        reviewedAt: now,
        updatedAt: now,
      })
      .where(eq(leaveRequests.id, id));

    await db.insert(auditLogs).values({
      tenantId,
      userId: userId || null,
      action: 'UPDATE',
      entityType: 'leave_request',
      entityId: id,
      changes: JSON.stringify({ status: 'REJECTED', reviewerEmployeeId, reviewNotes }),
    });

    return { ...req, status: 'REJECTED', reviewedByEmployeeId: reviewerEmployeeId, reviewedAt: now };
  }

  static async cancelLeaveRequest(db: AppDatabase, tenantId: string, id: string, actingEmployeeId?: string, userId?: string) {
    const req = await db.query.leaveRequests.findFirst({
      where: and(eq(leaveRequests.tenantId, tenantId), eq(leaveRequests.id, id)),
    });

    if (!req) {
      throw {
        code: 'LEAVE_REQUEST_NOT_FOUND',
        message: 'Leave request not found.',
        status: 404,
      };
    }

    if (actingEmployeeId && req.employeeId !== actingEmployeeId) {
      throw {
        code: 'FORBIDDEN',
        message: 'You can only cancel your own leave requests.',
        status: 403,
      };
    }

    if (req.status !== 'PENDING' && req.status !== 'APPROVED') {
      throw {
        code: 'INVALID_STATUS_TRANSITION',
        message: `Cannot cancel a leave request with status '${req.status}'.`,
        status: 400,
      };
    }

    const year = parseInt(req.startDate.slice(0, 4), 10);
    const alloc = await db.query.leaveAllocations.findFirst({
      where: and(
        eq(leaveAllocations.tenantId, tenantId),
        eq(leaveAllocations.employeeId, req.employeeId),
        eq(leaveAllocations.leaveTypeId, req.leaveTypeId),
        eq(leaveAllocations.year, year)
      ),
    });

    if (alloc) {
      if (req.status === 'PENDING') {
        await db.update(leaveAllocations)
          .set({
            pendingDays: Math.max(0, alloc.pendingDays - req.totalDays),
            updatedAt: new Date(),
          })
          .where(eq(leaveAllocations.id, alloc.id));
      } else if (req.status === 'APPROVED') {
        await db.update(leaveAllocations)
          .set({
            usedDays: Math.max(0, alloc.usedDays - req.totalDays),
            updatedAt: new Date(),
          })
          .where(eq(leaveAllocations.id, alloc.id));
      }
    }

    const now = new Date();
    await db.update(leaveRequests)
      .set({
        status: 'CANCELLED',
        updatedAt: now,
      })
      .where(eq(leaveRequests.id, id));

    await db.insert(auditLogs).values({
      tenantId,
      userId: userId || null,
      action: 'UPDATE',
      entityType: 'leave_request',
      entityId: id,
      changes: JSON.stringify({ status: 'CANCELLED', actingEmployeeId }),
    });

    return { ...req, status: 'CANCELLED' };
  }

  // ==========================================
  // E. SHIFT MANAGEMENT
  // ==========================================

  static async listShifts(db: AppDatabase, tenantId: string) {
    return db.query.shifts.findMany({
      where: eq(shifts.tenantId, tenantId),
      orderBy: [asc(shifts.code)],
    });
  }

  static async createShift(db: AppDatabase, tenantId: string, input: any, userId: string) {
    const existing = await db.query.shifts.findFirst({
      where: and(eq(shifts.tenantId, tenantId), eq(shifts.code, input.code)),
    });

    if (existing) {
      throw {
        code: 'SHIFT_CODE_EXISTS',
        message: `Shift with code '${input.code}' already exists.`,
        status: 409,
      };
    }

    const shiftId = crypto.randomUUID();
    const now = new Date();

    const record = {
      id: shiftId,
      tenantId,
      code: input.code,
      name: input.name,
      startTime: input.startTime,
      endTime: input.endTime,
      gracePeriodMinutes: input.gracePeriodMinutes ?? 15,
      halfDayThresholdMinutes: input.halfDayThresholdMinutes ?? 240,
      description: input.description || null,
      isActive: input.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(shifts).values(record);

    await db.insert(auditLogs).values({
      tenantId,
      userId,
      action: 'CREATE',
      entityType: 'shift',
      entityId: shiftId,
      changes: JSON.stringify({ code: input.code, name: input.name }),
    });

    return record;
  }

  static async updateShift(db: AppDatabase, tenantId: string, id: string, input: any, userId: string) {
    const shift = await db.query.shifts.findFirst({
      where: and(eq(shifts.tenantId, tenantId), eq(shifts.id, id)),
    });

    if (!shift) {
      throw {
        code: 'SHIFT_NOT_FOUND',
        message: 'Shift not found.',
        status: 404,
      };
    }

    const updates: any = {
      updatedAt: new Date(),
    };

    if (input.name !== undefined) updates.name = input.name;
    if (input.startTime !== undefined) updates.startTime = input.startTime;
    if (input.endTime !== undefined) updates.endTime = input.endTime;
    if (input.gracePeriodMinutes !== undefined) updates.gracePeriodMinutes = input.gracePeriodMinutes;
    if (input.halfDayThresholdMinutes !== undefined) updates.halfDayThresholdMinutes = input.halfDayThresholdMinutes;
    if (input.description !== undefined) updates.description = input.description;
    if (input.isActive !== undefined) updates.isActive = input.isActive;

    await db.update(shifts).set(updates).where(eq(shifts.id, id));

    await db.insert(auditLogs).values({
      tenantId,
      userId,
      action: 'UPDATE',
      entityType: 'shift',
      entityId: id,
      changes: JSON.stringify(updates),
    });

    return { ...shift, ...updates };
  }

  static async getEmployeeShifts(db: AppDatabase, tenantId: string, employeeId: string) {
    await this.assertEmployeeInTenant(db, tenantId, employeeId);

    return db.query.employeeShifts.findMany({
      where: and(eq(employeeShifts.tenantId, tenantId), eq(employeeShifts.employeeId, employeeId)),
      with: { shift: true },
      orderBy: [desc(employeeShifts.effectiveFrom)],
    });
  }

  static async assignShift(
    db: AppDatabase,
    tenantId: string,
    employeeId: string,
    input: any,
    userId: string
  ) {
    await this.assertEmployeeInTenant(db, tenantId, employeeId);

    const shift = await db.query.shifts.findFirst({
      where: and(eq(shifts.tenantId, tenantId), eq(shifts.id, input.shiftId)),
    });

    if (!shift) {
      throw {
        code: 'SHIFT_NOT_FOUND',
        message: 'Shift not found in this workspace.',
        status: 404,
      };
    }

    // Check for overlapping bounded shift assignments
    if (input.effectiveTo) {
      const overlapping = await db.query.employeeShifts.findFirst({
        where: and(
          eq(employeeShifts.tenantId, tenantId),
          eq(employeeShifts.employeeId, employeeId),
          sql`(${employeeShifts.effectiveTo} IS NOT NULL AND ${employeeShifts.effectiveTo} >= ${input.effectiveFrom} AND ${employeeShifts.effectiveFrom} <= ${input.effectiveTo})`
        ),
      });

      if (overlapping) {
        throw {
          code: 'SHIFT_ASSIGNMENT_OVERLAP',
          message: 'Employee already has an overlapping shift assignment for this date range.',
          status: 409,
        };
      }
    }

    // Close any existing open-ended shift assignments if new shift starts after or on same day
    const openShifts = await db.query.employeeShifts.findMany({
      where: and(
        eq(employeeShifts.tenantId, tenantId),
        eq(employeeShifts.employeeId, employeeId),
        isNull(employeeShifts.effectiveTo)
      ),
    });

    for (const openShift of openShifts) {
      if (openShift.effectiveFrom < input.effectiveFrom) {
        // Set effectiveTo to day before effectiveFrom
        const prevDay = new Date(input.effectiveFrom);
        prevDay.setDate(prevDay.getDate() - 1);
        const prevDayStr = prevDay.toISOString().slice(0, 10);
        await db.update(employeeShifts)
          .set({ effectiveTo: prevDayStr, updatedAt: new Date() })
          .where(eq(employeeShifts.id, openShift.id));
      }
    }

    const assignmentId = crypto.randomUUID();
    const now = new Date();

    const record = {
      id: assignmentId,
      tenantId,
      employeeId,
      shiftId: input.shiftId,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo || null,
      assignedBy: userId,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(employeeShifts).values(record);

    await db.insert(auditLogs).values({
      tenantId,
      userId,
      action: 'CREATE',
      entityType: 'employee_shift',
      entityId: assignmentId,
      changes: JSON.stringify({ employeeId, shiftId: input.shiftId, effectiveFrom: input.effectiveFrom }),
    });

    return record;
  }

  static async updateEmployeeShift(db: AppDatabase, tenantId: string, id: string, input: any) {
    const existing = await db.query.employeeShifts.findFirst({
      where: and(eq(employeeShifts.tenantId, tenantId), eq(employeeShifts.id, id)),
    });

    if (!existing) {
      throw {
        code: 'SHIFT_ASSIGNMENT_NOT_FOUND',
        message: 'Employee shift assignment not found.',
        status: 404,
      };
    }

    const updates: any = { updatedAt: new Date() };
    if (input.shiftId !== undefined) updates.shiftId = input.shiftId;
    if (input.effectiveFrom !== undefined) updates.effectiveFrom = input.effectiveFrom;
    if (input.effectiveTo !== undefined) updates.effectiveTo = input.effectiveTo;

    await db.update(employeeShifts).set(updates).where(eq(employeeShifts.id, id));
    return { ...existing, ...updates };
  }

  // ==========================================
  // F. HOLIDAY MANAGEMENT
  // ==========================================

  static async listHolidays(db: AppDatabase, tenantId: string, query: any) {
    const conditions = [eq(holidays.tenantId, tenantId)];

    if (query.year) {
      const startOfYear = `${query.year}-01-01`;
      const endOfYear = `${query.year}-12-31`;
      conditions.push(sql`${holidays.date} >= ${startOfYear} AND ${holidays.date} <= ${endOfYear}`);
    }

    if (query.branchId) {
      // Returns company-wide holidays (isNull) OR branch-specific holidays
      conditions.push(or(isNull(holidays.applicableBranchId), eq(holidays.applicableBranchId, query.branchId))!);
    }

    return db.query.holidays.findMany({
      where: and(...conditions),
      orderBy: [asc(holidays.date)],
      with: { branch: true },
    });
  }

  static async createHoliday(db: AppDatabase, tenantId: string, input: any, userId: string) {
    if (input.applicableBranchId) {
      const branch = await db.query.branches.findFirst({
        where: and(eq(branches.tenantId, tenantId), eq(branches.id, input.applicableBranchId)),
      });
      if (!branch) {
        throw {
          code: 'BRANCH_NOT_FOUND',
          message: 'Specified branch not found in this workspace.',
          status: 404,
        };
      }
    }

    // Check duplicate
    const existing = await db.query.holidays.findFirst({
      where: and(
        eq(holidays.tenantId, tenantId),
        eq(holidays.date, input.date),
        input.applicableBranchId
          ? eq(holidays.applicableBranchId, input.applicableBranchId)
          : isNull(holidays.applicableBranchId)
      ),
    });

    if (existing) {
      throw {
        code: 'HOLIDAY_EXISTS',
        message: `A holiday is already scheduled for date '${input.date}' for this scope.`,
        status: 409,
      };
    }

    const holId = crypto.randomUUID();
    const now = new Date();

    const record = {
      id: holId,
      tenantId,
      name: input.name,
      date: input.date,
      holidayType: input.holidayType || 'MANDATORY',
      description: input.description || null,
      applicableBranchId: input.applicableBranchId || null,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(holidays).values(record);

    await db.insert(auditLogs).values({
      tenantId,
      userId,
      action: 'CREATE',
      entityType: 'holiday',
      entityId: holId,
      changes: JSON.stringify({ name: input.name, date: input.date }),
    });

    return record;
  }

  static async updateHoliday(db: AppDatabase, tenantId: string, id: string, input: any, userId: string) {
    const hol = await db.query.holidays.findFirst({
      where: and(eq(holidays.tenantId, tenantId), eq(holidays.id, id)),
    });

    if (!hol) {
      throw {
        code: 'HOLIDAY_NOT_FOUND',
        message: 'Holiday not found.',
        status: 404,
      };
    }

    const updates: any = { updatedAt: new Date() };
    if (input.name !== undefined) updates.name = input.name;
    if (input.date !== undefined) updates.date = input.date;
    if (input.holidayType !== undefined) updates.holidayType = input.holidayType;
    if (input.description !== undefined) updates.description = input.description;
    if (input.applicableBranchId !== undefined) updates.applicableBranchId = input.applicableBranchId;

    await db.update(holidays).set(updates).where(eq(holidays.id, id));

    await db.insert(auditLogs).values({
      tenantId,
      userId,
      action: 'UPDATE',
      entityType: 'holiday',
      entityId: id,
      changes: JSON.stringify(updates),
    });

    return { ...hol, ...updates };
  }

  static async deleteHoliday(db: AppDatabase, tenantId: string, id: string, userId: string) {
    const hol = await db.query.holidays.findFirst({
      where: and(eq(holidays.tenantId, tenantId), eq(holidays.id, id)),
    });

    if (!hol) {
      throw {
        code: 'HOLIDAY_NOT_FOUND',
        message: 'Holiday not found.',
        status: 404,
      };
    }

    await db.delete(holidays).where(eq(holidays.id, id));

    await db.insert(auditLogs).values({
      tenantId,
      userId,
      action: 'DELETE',
      entityType: 'holiday',
      entityId: id,
      changes: JSON.stringify({ name: hol.name, date: hol.date }),
    });

    return { success: true };
  }

  // ==========================================
  // G. PERFORMANCE MANAGEMENT
  // ==========================================

  static async listPerformanceCycles(db: AppDatabase, tenantId: string) {
    return db.query.performanceCycles.findMany({
      where: eq(performanceCycles.tenantId, tenantId),
      orderBy: [desc(performanceCycles.startDate)],
    });
  }

  static async createPerformanceCycle(db: AppDatabase, tenantId: string, input: any, userId: string) {
    const existing = await db.query.performanceCycles.findFirst({
      where: and(eq(performanceCycles.tenantId, tenantId), eq(performanceCycles.code, input.code)),
    });

    if (existing) {
      throw {
        code: 'CYCLE_CODE_EXISTS',
        message: `Performance cycle with code '${input.code}' already exists.`,
        status: 409,
      };
    }

    const cycleId = crypto.randomUUID();
    const now = new Date();

    const record = {
      id: cycleId,
      tenantId,
      code: input.code,
      name: input.name,
      startDate: input.startDate,
      endDate: input.endDate,
      status: 'DRAFT' as const,
      description: input.description || null,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(performanceCycles).values(record);

    await db.insert(auditLogs).values({
      tenantId,
      userId,
      action: 'CREATE',
      entityType: 'performance_cycle',
      entityId: cycleId,
      changes: JSON.stringify({ code: input.code, name: input.name }),
    });

    return record;
  }

  static async updatePerformanceCycle(db: AppDatabase, tenantId: string, id: string, input: any, userId: string) {
    const cycle = await db.query.performanceCycles.findFirst({
      where: and(eq(performanceCycles.tenantId, tenantId), eq(performanceCycles.id, id)),
    });

    if (!cycle) {
      throw {
        code: 'CYCLE_NOT_FOUND',
        message: 'Performance review cycle not found.',
        status: 404,
      };
    }

    const updates: any = { updatedAt: new Date() };
    if (input.name !== undefined) updates.name = input.name;
    if (input.startDate !== undefined) updates.startDate = input.startDate;
    if (input.endDate !== undefined) updates.endDate = input.endDate;
    if (input.status !== undefined) updates.status = input.status;
    if (input.description !== undefined) updates.description = input.description;

    await db.update(performanceCycles).set(updates).where(eq(performanceCycles.id, id));

    await db.insert(auditLogs).values({
      tenantId,
      userId,
      action: 'UPDATE',
      entityType: 'performance_cycle',
      entityId: id,
      changes: JSON.stringify(updates),
    });

    return { ...cycle, ...updates };
  }

  static async listPerformanceReviews(db: AppDatabase, tenantId: string, query: any) {
    const conditions = [eq(performanceReviews.tenantId, tenantId)];
    if (query.cycleId) conditions.push(eq(performanceReviews.cycleId, query.cycleId));
    if (query.employeeId) conditions.push(eq(performanceReviews.employeeId, query.employeeId));
    if (query.reviewerEmployeeId) conditions.push(eq(performanceReviews.reviewerEmployeeId, query.reviewerEmployeeId));

    return db.query.performanceReviews.findMany({
      where: and(...conditions),
      with: {
        cycle: true,
        employee: {
          columns: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
          },
        },
        reviewer: {
          columns: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: [desc(performanceReviews.createdAt)],
    });
  }

  static async createPerformanceReview(db: AppDatabase, tenantId: string, input: any, userId: string) {
    await this.assertEmployeeInTenant(db, tenantId, input.employeeId);

    const cycle = await db.query.performanceCycles.findFirst({
      where: and(eq(performanceCycles.tenantId, tenantId), eq(performanceCycles.id, input.cycleId)),
    });

    if (!cycle) {
      throw {
        code: 'CYCLE_NOT_FOUND',
        message: 'Performance review cycle not found in this workspace.',
        status: 404,
      };
    }

    const existing = await db.query.performanceReviews.findFirst({
      where: and(
        eq(performanceReviews.tenantId, tenantId),
        eq(performanceReviews.cycleId, input.cycleId),
        eq(performanceReviews.employeeId, input.employeeId)
      ),
    });

    if (existing) {
      throw {
        code: 'REVIEW_EXISTS',
        message: 'Performance review already initiated for this employee in this cycle.',
        status: 409,
      };
    }

    const reviewId = crypto.randomUUID();
    const now = new Date();

    const record = {
      id: reviewId,
      tenantId,
      cycleId: input.cycleId,
      employeeId: input.employeeId,
      reviewerEmployeeId: input.reviewerEmployeeId || null,
      status: 'PENDING_SELF_REVIEW' as const,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(performanceReviews).values(record);

    await db.insert(auditLogs).values({
      tenantId,
      userId,
      action: 'CREATE',
      entityType: 'performance_review',
      entityId: reviewId,
      changes: JSON.stringify({ employeeId: input.employeeId, cycleId: input.cycleId }),
    });

    return record;
  }

  static async getPerformanceReviewById(db: AppDatabase, tenantId: string, id: string) {
    const rev = await db.query.performanceReviews.findFirst({
      where: and(eq(performanceReviews.tenantId, tenantId), eq(performanceReviews.id, id)),
      with: {
        cycle: true,
        employee: true,
        reviewer: true,
      },
    });

    if (!rev) {
      throw {
        code: 'REVIEW_NOT_FOUND',
        message: 'Performance review not found.',
        status: 404,
      };
    }

    return rev;
  }

  static async updatePerformanceReview(db: AppDatabase, tenantId: string, id: string, input: any, userId: string) {
    const rev = await db.query.performanceReviews.findFirst({
      where: and(eq(performanceReviews.tenantId, tenantId), eq(performanceReviews.id, id)),
    });

    if (!rev) {
      throw {
        code: 'REVIEW_NOT_FOUND',
        message: 'Performance review not found.',
        status: 404,
      };
    }

    const updates: any = { updatedAt: new Date() };
    if (input.reviewerEmployeeId !== undefined) updates.reviewerEmployeeId = input.reviewerEmployeeId;
    if (input.selfRating !== undefined) updates.selfRating = input.selfRating;
    if (input.selfFeedback !== undefined) updates.selfFeedback = input.selfFeedback;
    if (input.managerRating !== undefined) updates.managerRating = input.managerRating;
    if (input.managerFeedback !== undefined) updates.managerFeedback = input.managerFeedback;
    if (input.goalsMet !== undefined) updates.goalsMet = input.goalsMet;
    if (input.finalScore !== undefined) updates.finalScore = input.finalScore;

    await db.update(performanceReviews).set(updates).where(eq(performanceReviews.id, id));

    await db.insert(auditLogs).values({
      tenantId,
      userId,
      action: 'UPDATE',
      entityType: 'performance_review',
      entityId: id,
      changes: JSON.stringify(updates),
    });

    return { ...rev, ...updates };
  }

  static async submitPerformanceReview(
    db: AppDatabase,
    tenantId: string,
    id: string,
    input: any,
    userId: string,
    actingEmployeeId?: string
  ) {
    const rev = await db.query.performanceReviews.findFirst({
      where: and(eq(performanceReviews.tenantId, tenantId), eq(performanceReviews.id, id)),
    });

    if (!rev) {
      throw {
        code: 'REVIEW_NOT_FOUND',
        message: 'Performance review not found.',
        status: 404,
      };
    }

    const now = new Date();
    const updates: any = { updatedAt: now };

    if (input.type === 'SELF') {
      if (actingEmployeeId && rev.employeeId !== actingEmployeeId) {
        throw {
          code: 'FORBIDDEN',
          message: 'You can only submit self-evaluations for your own performance review.',
          status: 403,
        };
      }
      if (rev.status !== 'PENDING_SELF_REVIEW') {
        throw {
          code: 'INVALID_STATUS',
          message: `Self review already submitted (current status: ${rev.status}).`,
          status: 400,
        };
      }
      updates.selfRating = input.rating;
      updates.selfFeedback = input.feedback;
      updates.selfSubmittedAt = now;
      updates.status = 'PENDING_MANAGER_REVIEW';
    } else if (input.type === 'MANAGER') {
      if (actingEmployeeId && rev.reviewerEmployeeId && rev.reviewerEmployeeId !== actingEmployeeId) {
        throw {
          code: 'FORBIDDEN',
          message: 'You are not the designated reviewer for this performance evaluation.',
          status: 403,
        };
      }
      if (rev.status !== 'PENDING_MANAGER_REVIEW' && rev.status !== 'PENDING_SELF_REVIEW') {
        throw {
          code: 'INVALID_STATUS',
          message: `Cannot submit manager review for a completed review.`,
          status: 400,
        };
      }
      updates.managerRating = input.rating;
      updates.managerFeedback = input.feedback;
      updates.goalsMet = input.goalsMet;
      updates.finalScore = input.finalScore ?? input.rating;
      updates.managerSubmittedAt = now;
      updates.status = 'COMPLETED';
    }

    await db.update(performanceReviews).set(updates).where(eq(performanceReviews.id, id));

    await db.insert(auditLogs).values({
      tenantId,
      userId,
      action: 'UPDATE',
      entityType: 'performance_review',
      entityId: id,
      changes: JSON.stringify({ type: input.type, status: updates.status }),
    });

    return { ...rev, ...updates };
  }

  // ==========================================
  // H. HR REPORTS & WORKFORCE ANALYTICS
  // ==========================================

  static async getWorkforceSummary(db: AppDatabase, tenantId: string, query: any) {
    const today = new Date().toISOString().slice(0, 10);

    const [headcountRes, activeRes, todayAttendanceRes, pendingLeavesRes, pendingRegRes] = await Promise.all([
      db.select({ count: count() }).from(employees).where(eq(employees.tenantId, tenantId)),
      db.select({ count: count() }).from(employees).where(and(eq(employees.tenantId, tenantId), eq(employees.employmentStatus, 'ACTIVE'))),
      db.select({ count: count() }).from(attendanceRecords).where(and(eq(attendanceRecords.tenantId, tenantId), eq(attendanceRecords.date, today))),
      db.select({ count: count() }).from(leaveRequests).where(and(eq(leaveRequests.tenantId, tenantId), eq(leaveRequests.status, 'PENDING'))),
      db.select({ count: count() }).from(attendanceRegularizations).where(and(eq(attendanceRegularizations.tenantId, tenantId), eq(attendanceRegularizations.status, 'PENDING'))),
    ]);

    const totalEmployees = headcountRes[0]?.count ?? 0;
    const activeEmployees = activeRes[0]?.count ?? 0;
    const punchesToday = todayAttendanceRes[0]?.count ?? 0;
    const attendancePercentage = activeEmployees > 0 ? Math.round((punchesToday / activeEmployees) * 100) : 0;

    return {
      date: today,
      totalHeadcount: totalEmployees,
      activeHeadcount: activeEmployees,
      todayPunches: punchesToday,
      todayAttendanceRate: attendancePercentage,
      pendingLeaveRequests: pendingLeavesRes[0]?.count ?? 0,
      pendingRegularizations: pendingRegRes[0]?.count ?? 0,
    };
  }

  static async getAttendanceMetrics(db: AppDatabase, tenantId: string, query: any) {
    const conditions = [eq(attendanceRecords.tenantId, tenantId)];
    if (query.year) {
      conditions.push(sql`${attendanceRecords.date} LIKE ${`${query.year}-%`}`);
    }

    const records = await db.query.attendanceRecords.findMany({
      where: and(...conditions),
      columns: {
        status: true,
        totalWorkMinutes: true,
      },
    });

    const statusCounts: Record<string, number> = {
      PRESENT: 0,
      LATE: 0,
      HALF_DAY: 0,
      ABSENT: 0,
      ON_LEAVE: 0,
      HOLIDAY: 0,
    };

    let totalMinutes = 0;
    for (const r of records) {
      statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
      totalMinutes += r.totalWorkMinutes || 0;
    }

    return {
      totalRecords: records.length,
      statusCounts,
      averageWorkMinutes: records.length > 0 ? Math.round(totalMinutes / records.length) : 0,
    };
  }

  static async getLeaveMetrics(db: AppDatabase, tenantId: string, query: any) {
    const conditions = [eq(leaveRequests.tenantId, tenantId)];
    if (query.year) {
      conditions.push(sql`${leaveRequests.startDate} LIKE ${`${query.year}-%`}`);
    }

    const requests = await db.query.leaveRequests.findMany({
      where: and(...conditions),
      with: { leaveType: true },
    });

    const typeCounts: Record<string, number> = {};
    const statusCounts: Record<string, number> = {};
    let totalDaysApproved = 0;

    for (const r of requests) {
      const typeName = r.leaveType.name;
      typeCounts[typeName] = (typeCounts[typeName] || 0) + r.totalDays;
      statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
      if (r.status === 'APPROVED') {
        totalDaysApproved += r.totalDays;
      }
    }

    return {
      totalRequests: requests.length,
      totalDaysApproved,
      byType: typeCounts,
      byStatus: statusCounts,
    };
  }

  static async getHeadcountDistribution(db: AppDatabase, tenantId: string, query: any) {
    const allEmployees = await db.query.employees.findMany({
      where: eq(employees.tenantId, tenantId),
      with: {
        department: true,
        branch: true,
      },
    });

    const byDepartment: Record<string, number> = {};
    const byEmploymentType: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    const byBranch: Record<string, number> = {};

    for (const emp of allEmployees) {
      const deptName = emp.department ? emp.department.name : 'Unassigned';
      const branchName = emp.branch ? emp.branch.name : 'Headquarters';

      byDepartment[deptName] = (byDepartment[deptName] || 0) + 1;
      byEmploymentType[emp.employmentType] = (byEmploymentType[emp.employmentType] || 0) + 1;
      byStatus[emp.employmentStatus] = (byStatus[emp.employmentStatus] || 0) + 1;
      byBranch[branchName] = (byBranch[branchName] || 0) + 1;
    }

    return {
      totalHeadcount: allEmployees.length,
      byDepartment,
      byEmploymentType,
      byStatus,
      byBranch,
    };
  }
}
