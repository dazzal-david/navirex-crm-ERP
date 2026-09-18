import {
	canManageEmployees,
	canReviewReimbursements,
	toWorkspaceRole,
	WORKSPACE_ID,
	workspaceRoleOf,
} from "@crm/auth";
import type { Db } from "@crm/db";
import {
	BadRequestException,
	ForbiddenException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import type {
	ReviewReimbursementInput,
	SubmitReimbursementInput,
	UpdateEmployeeInput,
	UpdateMyProfileInput,
} from "./people.contracts";

const profileInclude = {
	manager: { select: { name: true } },
} as const;

@Injectable()
export class PeopleService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	async me(userId: string) {
		const role = await workspaceRoleOf(userId, this.db);
		return {
			profile: await this.profile(userId),
			canManageEmployees: canManageEmployees(role),
		};
	}

	async directory(userId: string) {
		await this.assertCanManage(userId);
		const members = await this.db.member.findMany({
			where: { organizationId: WORKSPACE_ID },
			include: {
				user: { include: { employeeProfile: { include: profileInclude } } },
			},
			orderBy: { user: { name: "asc" } },
		});
		return members.map((member) =>
			this.toProfile(member.user, toWorkspaceRole(member.role)),
		);
	}

	async updateMyProfile(input: UpdateMyProfileInput, userId: string) {
		await this.db.employeeProfile.upsert({
			where: { userId },
			create: { userId, ...optionalText(input) },
			update: optionalText(input),
		});
		return this.profile(userId);
	}

	async updateEmployee(input: UpdateEmployeeInput, userId: string) {
		await this.assertCanManage(userId);
		const target = await this.db.user.findUnique({
			where: { id: input.userId },
			select: { id: true },
		});
		if (!target) throw new NotFoundException("That employee no longer exists.");
		const { userId: targetId, designation, ...profile } = input;
		await this.db.$transaction([
			this.db.user.update({
				where: { id: targetId },
				data:
					designation === undefined ? {} : { designation: blank(designation) },
			}),
			this.db.employeeProfile.upsert({
				where: { userId: targetId },
				create: { userId: targetId, ...optionalText(profile) },
				update: optionalText(profile),
			}),
		]);
		return this.profile(targetId);
	}

	async myReimbursements(userId: string) {
		return this.reimbursementRows({ employeeId: userId });
	}

	async reimbursements(userId: string) {
		await this.assertCanManage(userId);
		return this.reimbursementRows({});
	}

	async submit(input: SubmitReimbursementInput, userId: string) {
		const row = await this.db.reimbursement.create({
			data: {
				title: input.title,
				description: blank(input.description),
				amount: input.amount,
				currency: input.currency.toUpperCase(),
				expenseDate: input.expenseDate,
				receiptUrl: blank(input.receiptUrl),
				employeeId: userId,
			},
			select: { id: true },
		});
		return this.reimbursement(row.id);
	}

	async review(input: ReviewReimbursementInput, userId: string) {
		await this.assertCanReview(userId);
		const current = await this.db.reimbursement.findUnique({
			where: { id: input.id },
			select: { status: true },
		});
		if (!current)
			throw new NotFoundException("That reimbursement no longer exists.");
		if (current.status !== "SUBMITTED") {
			throw new BadRequestException(
				"Only submitted reimbursements can be reviewed.",
			);
		}
		await this.db.reimbursement.update({
			where: { id: input.id },
			data: {
				status: input.decision,
				reviewNote: blank(input.reviewNote),
				reviewedById: userId,
				reviewedAt: new Date(),
			},
		});
		return this.reimbursement(input.id);
	}

	async markPaid(id: string, userId: string) {
		await this.assertCanReview(userId);
		const current = await this.db.reimbursement.findUnique({
			where: { id },
			select: { status: true },
		});
		if (!current)
			throw new NotFoundException("That reimbursement no longer exists.");
		if (current.status !== "APPROVED") {
			throw new BadRequestException(
				"Approve the reimbursement before marking it paid.",
			);
		}
		await this.db.reimbursement.update({
			where: { id },
			data: { status: "PAID", paidAt: new Date() },
		});
		return this.reimbursement(id);
	}

	private async profile(userId: string) {
		const member = await this.db.member.findUnique({
			where: {
				organizationId_userId: { organizationId: WORKSPACE_ID, userId },
			},
			include: {
				user: { include: { employeeProfile: { include: profileInclude } } },
			},
		});
		if (!member)
			throw new NotFoundException("That employee is not in this workspace.");
		return this.toProfile(member.user, toWorkspaceRole(member.role));
	}

	private toProfile(
		user: {
			id: string;
			name: string;
			email: string;
			image: string | null;
			designation: string | null;
			employeeProfile: {
				employeeCode: string | null;
				department: string | null;
				location: string | null;
				phone: string | null;
				employmentType: string | null;
				joinedAt: Date | null;
				bio: string | null;
				emergencyContactName: string | null;
				emergencyContactPhone: string | null;
				managerId: string | null;
				manager: { name: string } | null;
			} | null;
		},
		role: "owner" | "admin" | "manager" | "member",
	) {
		const profile = user.employeeProfile;
		return {
			userId: user.id,
			name: user.name,
			email: user.email,
			image: user.image,
			designation: user.designation,
			role,
			employeeCode: profile?.employeeCode ?? null,
			department: profile?.department ?? null,
			location: profile?.location ?? null,
			phone: profile?.phone ?? null,
			employmentType: profile?.employmentType ?? null,
			joinedAt: profile?.joinedAt ?? null,
			bio: profile?.bio ?? null,
			emergencyContactName: profile?.emergencyContactName ?? null,
			emergencyContactPhone: profile?.emergencyContactPhone ?? null,
			managerId: profile?.managerId ?? null,
			managerName: profile?.manager?.name ?? null,
		};
	}

	private async reimbursementRows(where: { employeeId?: string }) {
		const rows = await this.db.reimbursement.findMany({
			where,
			include: {
				employee: { select: { name: true } },
				reviewedBy: { select: { name: true } },
			},
			orderBy: { createdAt: "desc" },
		});
		return rows.map((row) => ({
			...row,
			amount: row.amount.toFixed(2),
			employeeName: row.employee.name,
			reviewedByName: row.reviewedBy?.name ?? null,
		}));
	}

	private async reimbursement(id: string) {
		const rows = await this.reimbursementRows({});
		const row = rows.find((item) => item.id === id);
		if (!row)
			throw new NotFoundException("That reimbursement no longer exists.");
		return row;
	}

	private async assertCanManage(userId: string) {
		if (!canManageEmployees(await workspaceRoleOf(userId, this.db))) {
			throw new ForbiddenException(
				"Only a Founder, Superadmin, or Manager can manage employees.",
			);
		}
	}

	private async assertCanReview(userId: string) {
		if (!canReviewReimbursements(await workspaceRoleOf(userId, this.db))) {
			throw new ForbiddenException(
				"Only a Founder, Superadmin, or Manager can review reimbursements.",
			);
		}
	}
}

function blank(value: string | undefined): string | null {
	const normalized = value?.trim();
	return normalized ? normalized : null;
}

function optionalText<T extends Record<string, unknown>>(input: T): T {
	return Object.fromEntries(
		Object.entries(input).map(([key, value]) => [
			key,
			typeof value === "string" ? blank(value) : value,
		]),
	) as T;
}
