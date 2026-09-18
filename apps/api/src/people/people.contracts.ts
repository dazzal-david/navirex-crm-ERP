import { WORKSPACE_ROLES } from "@crm/auth";
import { z } from "zod";

export const employeeProfileOutput = z.object({
	userId: z.string(),
	name: z.string(),
	email: z.string(),
	image: z.string().nullable(),
	designation: z.string().nullable(),
	role: z.enum(WORKSPACE_ROLES),
	employeeCode: z.string().nullable(),
	department: z.string().nullable(),
	location: z.string().nullable(),
	phone: z.string().nullable(),
	employmentType: z.string().nullable(),
	joinedAt: z.date().nullable(),
	bio: z.string().nullable(),
	emergencyContactName: z.string().nullable(),
	emergencyContactPhone: z.string().nullable(),
	managerId: z.string().nullable(),
	managerName: z.string().nullable(),
});

export const employeePortalOutput = z.object({
	profile: employeeProfileOutput,
	canManageEmployees: z.boolean(),
});

export const directoryOutput = z.array(employeeProfileOutput);

export const updateMyProfileInput = z.object({
	phone: z.string().trim().max(50).optional(),
	bio: z.string().trim().max(2000).optional(),
	emergencyContactName: z.string().trim().max(120).optional(),
	emergencyContactPhone: z.string().trim().max(50).optional(),
});

export const updateEmployeeInput = z.object({
	userId: z.string(),
	designation: z.string().trim().max(120).optional(),
	employeeCode: z.string().trim().max(50).optional(),
	department: z.string().trim().max(120).optional(),
	location: z.string().trim().max(120).optional(),
	phone: z.string().trim().max(50).optional(),
	employmentType: z.string().trim().max(80).optional(),
	joinedAt: z.date().optional(),
	managerId: z.string().nullable().optional(),
});

export const reimbursementStatus = z.enum([
	"SUBMITTED",
	"APPROVED",
	"REJECTED",
	"PAID",
]);

export const reimbursementOutput = z.object({
	id: z.string(),
	title: z.string(),
	description: z.string().nullable(),
	amount: z.string(),
	currency: z.string(),
	expenseDate: z.date(),
	receiptUrl: z.string().nullable(),
	status: reimbursementStatus,
	reviewNote: z.string().nullable(),
	employeeId: z.string(),
	employeeName: z.string(),
	reviewedByName: z.string().nullable(),
	reviewedAt: z.date().nullable(),
	paidAt: z.date().nullable(),
	createdAt: z.date(),
});

export const reimbursementsOutput = z.array(reimbursementOutput);

export const submitReimbursementInput = z.object({
	title: z.string().trim().min(1).max(160),
	description: z.string().trim().max(2000).optional(),
	amount: z.string().regex(/^\d{1,12}(?:\.\d{1,2})?$/),
	currency: z.string().trim().length(3).default("INR"),
	expenseDate: z.date(),
	receiptUrl: z.url().max(2000).optional(),
});

export const reviewReimbursementInput = z.object({
	id: z.string(),
	decision: z.enum(["APPROVED", "REJECTED"]),
	reviewNote: z.string().trim().max(2000).optional(),
});

export const reimbursementIdInput = z.object({ id: z.string() });

export type UpdateMyProfileInput = z.infer<typeof updateMyProfileInput>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeInput>;
export type SubmitReimbursementInput = z.infer<typeof submitReimbursementInput>;
export type ReviewReimbursementInput = z.infer<typeof reviewReimbursementInput>;
