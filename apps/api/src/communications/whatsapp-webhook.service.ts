import { createHmac, timingSafeEqual } from "node:crypto";
import { ActivityType, type Db, type Prisma } from "@crm/db";
import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { z } from "zod";
import type { EnvironmentVariables } from "../config/env.validation";
import { InjectDatabase } from "../database/database.constants";
import { LeadsService } from "../leads/leads.service";
import {
	type WhatsAppWebhookPayload,
	whatsappMessageBody,
	whatsappTimestamp,
} from "./whatsapp-webhook.contracts";

const jsonObjectValue = z.record(z.string(), z.json());

@Injectable()
export class WhatsAppWebhookService {
	private readonly logger = new Logger(WhatsAppWebhookService.name);
	private readonly appSecret?: string;
	private readonly phoneNumberId?: string;
	private readonly verifyToken?: string;

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly leads: LeadsService,
		config: ConfigService<EnvironmentVariables, true>,
	) {
		this.appSecret =
			config.get("WHATSAPP_APP_SECRET", { infer: true }) ||
			config.get("META_CLIENT_SECRET", { infer: true });
		this.phoneNumberId = config.get("WHATSAPP_PHONE_NUMBER_ID", {
			infer: true,
		});
		this.verifyToken = config.get("WHATSAPP_WEBHOOK_VERIFY_TOKEN", {
			infer: true,
		});
	}

	verify(
		mode: string | undefined,
		challenge: string | undefined,
		token: string | undefined,
	): string {
		if (
			mode !== "subscribe" ||
			!this.verifyToken ||
			token !== this.verifyToken ||
			!challenge
		) {
			throw new BadRequestException("WhatsApp webhook verification failed.");
		}
		return challenge;
	}

	verifySignature(raw: string, signature: string | undefined): void {
		if (!this.appSecret) {
			this.logger.warn(
				"Rejected WhatsApp webhook because the Meta app secret is not configured.",
			);
			throw new BadRequestException("WhatsApp webhook signature is missing.");
		}
		if (!signature?.startsWith("sha256=")) {
			this.logger.warn(
				"Rejected WhatsApp webhook because the signature header is missing.",
			);
			throw new BadRequestException("WhatsApp webhook signature is missing.");
		}
		const expected = createHmac("sha256", this.appSecret)
			.update(raw)
			.digest("hex");
		const received = signature.slice("sha256=".length);
		const left = Buffer.from(expected, "hex");
		const right = Buffer.from(received, "hex");
		if (left.length !== right.length || !timingSafeEqual(left, right)) {
			this.logger.warn(
				"Rejected WhatsApp webhook because its signature does not match the configured Meta app secret.",
			);
			throw new BadRequestException("WhatsApp webhook signature is invalid.");
		}
	}

	async receive(payload: WhatsAppWebhookPayload): Promise<void> {
		for (const entry of payload.entry) {
			for (const change of entry.changes) {
				const value = change.value;
				if (
					this.phoneNumberId &&
					value.metadata?.phone_number_id &&
					value.metadata.phone_number_id !== this.phoneNumberId
				)
					continue;

				const names = new Map(
					(value.contacts ?? []).flatMap((contact) =>
						contact.wa_id
							? [
									[
										normalizePhone(contact.wa_id),
										contact.profile?.name,
									] as const,
								]
							: [],
					),
				);

				for (const message of value.messages ?? []) {
					if (!message.from) continue;
					await this.storeMessage(
						message.id,
						message.from,
						names.get(normalizePhone(message.from)),
						message.type,
						whatsappMessageBody(message),
						whatsappTimestamp(message.timestamp),
					);
				}

				for (const status of value.statuses ?? []) {
					await this.storeStatus(
						status.id,
						status.status,
						whatsappTimestamp(status.timestamp),
						status.errors?.[0]?.message ?? status.errors?.[0]?.title,
					);
				}
			}
		}
	}

	private async storeMessage(
		messageId: string,
		from: string,
		fromName: string | undefined,
		messageType: string,
		body: string,
		occurredAt: Date,
	): Promise<void> {
		const phone = normalizePhone(from);
		if (!phone) return;
		const candidates = await this.db.lead.findMany({
			where: { archivedAt: null, phone: { not: null } },
			select: { id: true, ownerId: true, phone: true },
		});
		let lead = candidates.find(
			(candidate) => normalizePhone(candidate.phone ?? "") === phone,
		);
		if (!lead) {
			const result = await this.leads.intake({
				name: fromName?.trim() || `WhatsApp ${phone.slice(-4)}`,
				phone: `+${phone}`,
				kind: "OTHER",
				stage: "UNASSIGNED",
				source: "WhatsApp",
				externalId: phone,
				notes: body,
			});
			const createdLead = await this.db.lead.findUnique({
				where: { id: result.id },
				select: { id: true, ownerId: true, phone: true },
			});
			if (!createdLead) return;
			lead = createdLead;
		}

		const authorId =
			lead.ownerId ??
			(
				await this.db.user.findFirst({
					select: { id: true },
					orderBy: [{ createdAt: "asc" }, { id: "asc" }],
				})
			)?.id;
		if (!authorId) {
			this.logger.warn(
				`WhatsApp message ${messageId} arrived before a user exists.`,
			);
			return;
		}

		await this.db.$transaction([
			this.db.activity.upsert({
				where: { id: `whatsapp:${messageId}` },
				create: {
					id: `whatsapp:${messageId}`,
					type: ActivityType.NOTE,
					subject: "WhatsApp message",
					body,
					leadId: lead.id,
					createdById: authorId,
					occurredAt,
					meta: {
						channel: "whatsapp",
						direction: "inbound",
						from: phone,
						fromName: fromName ?? null,
						messageId,
						messageType,
						provider: "meta",
					},
				},
				update: {},
			}),
			this.db.lead.updateMany({
				where: {
					id: lead.id,
					OR: [
						{ lastActivityAt: null },
						{ lastActivityAt: { lt: occurredAt } },
					],
				},
				data: { lastActivityAt: occurredAt },
			}),
		]);
	}

	private async storeStatus(
		messageId: string,
		status: string,
		occurredAt: Date,
		error: string | undefined,
	): Promise<void> {
		const activity = await this.db.activity.findFirst({
			where: { meta: { path: ["messageId"], equals: messageId } },
			select: { id: true, meta: true },
		});
		if (!activity) return;
		const meta = jsonObject(activity.meta);
		await this.db.activity.update({
			where: { id: activity.id },
			data: {
				meta: {
					...meta,
					deliveryError: error ?? null,
					deliveryStatus: status,
					deliveryUpdatedAt: occurredAt.toISOString(),
				},
			},
		});
	}
}

function normalizePhone(value: string): string {
	return value.replace(/\D/g, "");
}

function jsonObject(value: Prisma.JsonValue | null): Prisma.JsonObject {
	const parsed = jsonObjectValue.safeParse(value);
	return parsed.success ? parsed.data : {};
}
