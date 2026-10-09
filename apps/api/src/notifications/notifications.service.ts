import { appUrl, workspaceRoleOf } from "@crm/auth";
import type { Db } from "@crm/db";
import { WORKSPACE_ID } from "@crm/db/workspace";
import {
	BadRequestException,
	Injectable,
	Logger,
	NotFoundException,
} from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import { LEADS } from "../leads/leads-config";
import { GraphMailService } from "../microsoft/graph-mail.service";
import { NOTIFICATIONS } from "./notifications-config";

export type MentionInput = {
	actorId: string;
	mentionIds: string[];
	leadId: string;
	companyId?: string | null;
	activityId: string;
	text: string;
};

@Injectable()
export class NotificationsService {
	private readonly logger = new Logger(NotificationsService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly mail: GraphMailService,
	) {}

	async notifyMentions(input: MentionInput): Promise<number> {
		const candidates = [...new Set(input.mentionIds)].filter(
			(id) => id !== input.actorId,
		);
		if (candidates.length === 0) return 0;

		const members = [];
		for (const id of candidates) {
			if (await workspaceRoleOf(id, this.db)) members.push(id);
		}
		if (members.length === 0) return 0;

		const [actor, lead, recipients] = await Promise.all([
			this.db.user.findUnique({
				where: { id: input.actorId },
				select: { name: true },
			}),
			this.db.lead.findUnique({
				where: { id: input.leadId },
				select: {
					name: true,
					companyName: true,
					kind: true,
					stage: true,
					owner: { select: { name: true } },
				},
			}),
			this.db.user.findMany({
				where: { id: { in: members } },
				select: { id: true, email: true },
			}),
		]);
		if (!lead) return 0;

		const actorName = actor?.name ?? "Someone";
		const leadTitle =
			lead.kind !== "CUSTOMER" && lead.companyName
				? lead.companyName
				: lead.name;
		const title = `${actorName} mentioned you on ${leadTitle}`;

		await this.db.notification.createMany({
			data: recipients.map((recipient) => ({
				kind: "MENTION" as const,
				userId: recipient.id,
				actorId: input.actorId,
				leadId: input.leadId,
				companyId: input.companyId ?? null,
				activityId: input.activityId,
				title,
				body: input.text.slice(0, NOTIFICATIONS.bodyPreviewChars),
			})),
		});

		if (this.mail.configured) {
			const link = await this.leadLink(input.leadId);
			const body = [
				`${actorName} mentioned you in a note on ${leadTitle}:`,
				"",
				input.text,
				"",
				`Status: ${LEADS.stageLabel[lead.stage]} · Owner: ${lead.owner?.name ?? "Unassigned"}`,
				"",
				`Open the lead: ${link}`,
				"",
				"— Navirex CRM",
			].join("\n");
			const results = await Promise.allSettled(
				recipients.map((recipient) =>
					this.mail.send(recipient.email, title, body),
				),
			);
			for (const result of results) {
				if (result.status === "rejected") {
					this.logger.warn({
						message: "Mention email could not be sent",
						error:
							result.reason instanceof Error
								? result.reason.message
								: String(result.reason),
					});
				}
			}
		}

		return recipients.length;
	}

	async messageMember(input: {
		actorId: string;
		userId: string;
		subject: string;
		body: string;
		leadId?: string;
	}) {
		if (!(await workspaceRoleOf(input.userId, this.db))) {
			throw new NotFoundException("That person is not a member of the CRM.");
		}
		if (!this.mail.configured) {
			throw new BadRequestException(
				"The shared Navirex mailbox is not set up.",
			);
		}
		const [actor, recipient] = await Promise.all([
			this.db.user.findUnique({
				where: { id: input.actorId },
				select: { name: true },
			}),
			this.db.user.findUniqueOrThrow({
				where: { id: input.userId },
				select: { name: true, email: true },
			}),
		]);
		const actorName = actor?.name ?? "Someone";
		const link = input.leadId ? await this.leadLink(input.leadId) : null;
		const now = new Date();
		const activity = input.leadId
			? await this.db.activity.create({
					data: {
						type: "NOTE",
						subject: "Internal note",
						body: `Emailed ${recipient.name}: ${input.subject}\n\n${input.body}`,
						leadId: input.leadId,
						createdById: input.actorId,
						occurredAt: now,
						meta: { channel: "note", direction: "internal", mentions: [] },
					},
					select: { id: true },
				})
			: null;
		await this.db.notification.create({
			data: {
				kind: "MESSAGE",
				userId: input.userId,
				actorId: input.actorId,
				leadId: input.leadId ?? null,
				activityId: activity?.id ?? null,
				title: `${actorName}: ${input.subject}`,
				body: input.body.slice(0, NOTIFICATIONS.bodyPreviewChars),
			},
		});
		await this.mail.send(
			recipient.email,
			input.subject,
			[
				input.body,
				"",
				...(link ? [`Open the lead: ${link}`, ""] : []),
				`Sent by ${actorName} from Navirex CRM`,
			].join("\n"),
		);
		return { sent: true, to: recipient.name };
	}

	async list(userId: string) {
		const rows = await this.db.notification.findMany({
			where: { userId },
			orderBy: { createdAt: "desc" },
			take: NOTIFICATIONS.listLimit,
			select: {
				id: true,
				kind: true,
				title: true,
				body: true,
				leadId: true,
				companyId: true,
				readAt: true,
				createdAt: true,
				actor: { select: { name: true } },
			},
		});
		return rows.map(({ actor, ...row }) => ({
			...row,
			actorName: actor?.name ?? null,
		}));
	}

	async unreadCount(userId: string) {
		return {
			count: await this.db.notification.count({
				where: { userId, readAt: null },
			}),
		};
	}

	async markRead(userId: string, id: string) {
		const result = await this.db.notification.updateMany({
			where: { id, userId, readAt: null },
			data: { readAt: new Date() },
		});
		return { updated: result.count };
	}

	async markAllRead(userId: string) {
		const result = await this.db.notification.updateMany({
			where: { userId, readAt: null },
			data: { readAt: new Date() },
		});
		return { updated: result.count };
	}

	private async leadLink(leadId: string): Promise<string> {
		const workspace = await this.db.organization.findUnique({
			where: { id: WORKSPACE_ID },
			select: { slug: true },
		});
		const params = new URLSearchParams({ record: `lead:${leadId}` });
		return `${appUrl}/${workspace?.slug ?? ""}/leads?${params}`;
	}
}
