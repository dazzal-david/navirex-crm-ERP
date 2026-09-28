import {
	appUrl,
	canChangeRole,
	INVITE_STATUS,
	INVITES,
	invitationForToken,
	isInvitableRole,
	newInviteToken,
	WORKSPACE_ID,
	workspaceRoleOf,
} from "@crm/auth";
import type { Db } from "@crm/db";
import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	Injectable,
	Logger,
	NotFoundException,
} from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import { GraphMailService } from "../microsoft/graph-mail.service";
import type {
	Invitation,
	InvitationLookup,
	InviteInput,
	InviteOutput,
} from "./invitations.contracts";

const INVITATION_SELECT = {
	id: true,
	email: true,
	role: true,
	expiresAt: true,
	user: { select: { name: true } },
} as const;

type InvitationRow = {
	id: string;
	email: string;
	role: string | null;
	expiresAt: Date;
	user: { name: string };
};

@Injectable()
export class InvitationsService {
	private readonly logger = new Logger(InvitationsService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly graphMail: GraphMailService,
	) {}

	async list(userId: string): Promise<Invitation[]> {
		await this.assertCanInvite(userId);
		const rows = await this.db.invitation.findMany({
			where: {
				organizationId: WORKSPACE_ID,
				status: INVITE_STATUS.pending,
				expiresAt: { gt: new Date() },
			},
			select: INVITATION_SELECT,
			orderBy: { createdAt: "desc" },
		});
		return rows.map(toInvitation);
	}

	async invite(userId: string, input: InviteInput): Promise<InviteOutput> {
		await this.assertCanInvite(userId);
		const email = input.email;

		const existing = await this.db.member.findFirst({
			where: {
				organizationId: WORKSPACE_ID,
				user: { email: { equals: email, mode: "insensitive" } },
			},
			select: { id: true },
		});
		if (existing) {
			throw new ConflictException(`${email} is already a member.`);
		}

		const { token, id } = newInviteToken();
		const row = await this.db.$transaction(async (tx) => {
			await tx.invitation.updateMany({
				where: {
					organizationId: WORKSPACE_ID,
					email: { equals: email, mode: "insensitive" },
					status: INVITE_STATUS.pending,
				},
				data: { status: INVITE_STATUS.canceled },
			});
			return tx.invitation.create({
				data: {
					id,
					organizationId: WORKSPACE_ID,
					email,
					role: input.role,
					status: INVITE_STATUS.pending,
					expiresAt: new Date(Date.now() + INVITES.ttlMs),
					inviterId: userId,
				},
				select: INVITATION_SELECT,
			});
		});

		const link = new URL(`/invite/${token}`, appUrl).toString();
		const emailed = await this.sendInvite(email, link, row.user.name);

		this.logger.log({
			message: "Workspace invitation created",
			userId,
			invitationId: row.id,
			emailed,
		});

		return { ...toInvitation(row), link, emailed };
	}

	async revoke(userId: string, id: string): Promise<Invitation> {
		await this.assertCanInvite(userId);
		const row = await this.db.invitation.findFirst({
			where: {
				id,
				organizationId: WORKSPACE_ID,
				status: INVITE_STATUS.pending,
			},
			select: { id: true },
		});
		if (!row) throw new NotFoundException("That invitation is not pending.");

		const updated = await this.db.invitation.update({
			where: { id: row.id },
			data: { status: INVITE_STATUS.canceled },
			select: INVITATION_SELECT,
		});
		this.logger.log({ message: "Workspace invitation revoked", userId, id });
		return toInvitation(updated);
	}

	async removeMember(userId: string, memberId: string) {
		await this.assertCanInvite(userId);

		await this.db.$transaction(async (tx) => {
			const target = await tx.member.findFirst({
				where: { id: memberId, organizationId: WORKSPACE_ID },
				select: {
					id: true,
					role: true,
					userId: true,
					user: { select: { email: true } },
				},
			});
			if (!target) {
				throw new NotFoundException("That person is not in this workspace.");
			}
			if (target.userId === userId) {
				throw new BadRequestException("You cannot remove yourself.");
			}
			if (target.role === "owner") {
				throw new ForbiddenException(
					"A Founder cannot be removed. Change their role first.",
				);
			}

			await tx.member.delete({ where: { id: target.id } });
			await tx.session.deleteMany({ where: { userId: target.userId } });
			await tx.invitation.updateMany({
				where: {
					organizationId: WORKSPACE_ID,
					email: { equals: target.user.email, mode: "insensitive" },
					status: INVITE_STATUS.pending,
				},
				data: { status: INVITE_STATUS.canceled },
			});
		});

		this.logger.log({ message: "Workspace member removed", userId, memberId });
		return { removed: true as const };
	}

	async lookup(token: string): Promise<InvitationLookup> {
		const invitation = await invitationForToken(token, this.db);
		if (!invitation) {
			throw new NotFoundException(
				"This invitation link is invalid, used, or expired.",
			);
		}
		const workspace = await this.db.organization.findUnique({
			where: { id: WORKSPACE_ID },
			select: { name: true },
		});
		return {
			email: invitation.email,
			workspace: workspace?.name ?? "Navirex",
			expiresAt: invitation.expiresAt.toISOString(),
		};
	}

	private async sendInvite(
		email: string,
		link: string,
		inviter: string,
	): Promise<boolean> {
		if (!this.graphMail.configured) return false;
		try {
			await this.graphMail.send(
				email,
				"You are invited to Navirex CRM",
				[
					"Hello,",
					"",
					`${inviter} invited you to Navirex CRM.`,
					"",
					"Open this link to create your account:",
					link,
					"",
					`The link works once and expires in ${INVITES.ttlDays} days.`,
					"If you did not expect this email, ignore it.",
				].join("\n"),
			);
			return true;
		} catch (error) {
			this.logger.error(
				{ message: "Invitation email failed" },
				error instanceof Error ? error.stack : undefined,
			);
			return false;
		}
	}

	private async assertCanInvite(userId: string) {
		if (!canChangeRole(await workspaceRoleOf(userId, this.db))) {
			throw new ForbiddenException(
				"Only a Founder or Superadmin can manage access.",
			);
		}
	}
}

function toInvitation(row: InvitationRow): Invitation {
	return {
		id: row.id,
		email: row.email,
		role: isInvitableRole(row.role) ? row.role : "member",
		expiresAt: row.expiresAt.toISOString(),
		invitedBy: row.user.name,
	};
}
