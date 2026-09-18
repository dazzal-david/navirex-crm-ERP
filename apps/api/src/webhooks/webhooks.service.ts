import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { canManageConnections, workspaceRoleOf } from "@crm/auth";
import { ActivityType, type Db } from "@crm/db";
import {
	ForbiddenException,
	Injectable,
	NotFoundException,
	UnauthorizedException,
} from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import { LeadsService } from "../leads/leads.service";
import type { InboundLeadPayload } from "./webhooks.contracts";

@Injectable()
export class WebhooksService {
	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly leads: LeadsService,
	) {}

	async list(userId: string) {
		await this.assertCanManage(userId);
		return this.db.inboundWebhook.findMany({
			select: {
				id: true,
				name: true,
				source: true,
				enabled: true,
				lastReceivedAt: true,
				lastError: true,
				createdAt: true,
			},
			orderBy: { createdAt: "desc" },
		});
	}

	async create(input: { name: string; source: string }, userId: string) {
		await this.assertCanManage(userId);
		const secret = randomBytes(32).toString("base64url");
		const webhook = await this.db.inboundWebhook.create({
			data: {
				name: input.name,
				source: input.source,
				secretHash: hash(secret),
				createdById: userId,
			},
			select: {
				id: true,
				name: true,
				source: true,
				enabled: true,
				lastReceivedAt: true,
				lastError: true,
				createdAt: true,
			},
		});
		return {
			...webhook,
			secret,
			path: `/api/integrations/lead-webhooks/${webhook.id}`,
		};
	}

	async update(input: { id: string; enabled: boolean }, userId: string) {
		await this.assertCanManage(userId);
		const existing = await this.db.inboundWebhook.findUnique({
			where: { id: input.id },
			select: { id: true },
		});
		if (!existing)
			throw new NotFoundException("That webhook no longer exists.");
		return this.db.inboundWebhook.update({
			where: { id: input.id },
			data: { enabled: input.enabled },
			select: {
				id: true,
				name: true,
				source: true,
				enabled: true,
				lastReceivedAt: true,
				lastError: true,
				createdAt: true,
			},
		});
	}

	async receive(
		id: string,
		secret: string | undefined,
		payload: InboundLeadPayload,
	) {
		const webhook = await this.db.inboundWebhook.findUnique({
			where: { id },
			select: {
				id: true,
				secretHash: true,
				enabled: true,
				source: true,
				createdById: true,
			},
		});
		if (!webhook?.enabled) {
			throw new NotFoundException("That webhook is not available.");
		}
		if (!secret || !safeEqual(hash(secret), webhook.secretHash)) {
			throw new UnauthorizedException("The webhook secret is invalid.");
		}

		try {
			const result = await this.leads.intake(
				{
					name: payload.name,
					companyName: payload.companyName,
					email: payload.email,
					phone: payload.phone,
					kind: "OTHER",
					stage: "UNASSIGNED",
					source: payload.source ?? webhook.source,
					externalId: payload.externalId,
					notes: payload.message,
				},
				webhook.createdById,
			);
			if (payload.message) {
				await this.db.activity.create({
					data: {
						type:
							payload.channel === "email"
								? ActivityType.EMAIL
								: ActivityType.NOTE,
						subject: "Inbound message",
						body: payload.message,
						leadId: result.id,
						createdById: webhook.createdById,
						occurredAt: new Date(),
						meta: {
							channel: payload.channel,
							direction: "inbound",
							webhookId: id,
						},
					},
				});
			}
			await this.db.inboundWebhook.update({
				where: { id },
				data: { lastReceivedAt: new Date(), lastError: null },
			});
			return result;
		} catch (error) {
			await this.db.inboundWebhook.update({
				where: { id },
				data: {
					lastError: error instanceof Error ? error.message : "Webhook failed",
				},
			});
			throw error;
		}
	}

	private async assertCanManage(userId: string) {
		if (!canManageConnections(await workspaceRoleOf(userId, this.db))) {
			throw new ForbiddenException(
				"Only a Founder or Superadmin can manage webhooks.",
			);
		}
	}
}

function hash(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

function safeEqual(left: string, right: string): boolean {
	const leftBuffer = Buffer.from(left);
	const rightBuffer = Buffer.from(right);
	return (
		leftBuffer.length === rightBuffer.length &&
		timingSafeEqual(leftBuffer, rightBuffer)
	);
}
