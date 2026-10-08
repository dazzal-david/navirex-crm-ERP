import { ActivityType, type Db, type Prisma } from "@crm/db";
import { SETTINGS_ID } from "@crm/db/settings";
import { samePhone } from "@crm/validation/phone";
import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { z } from "zod";
import type { EnvironmentVariables } from "../config/env.validation";
import { InjectDatabase } from "../database/database.constants";
import { LeadsService } from "../leads/leads.service";
import { metaSignatureMatches } from "../meta/meta-signature";
import { WHATSAPP } from "./whatsapp-config";
import {
	type WhatsAppMediaRef,
	type WhatsAppWebhookPayload,
	whatsappMediaOf,
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
		if (!metaSignatureMatches(this.appSecret, raw, signature)) {
			this.logger.warn(
				"Rejected WhatsApp webhook because its signature does not match the configured Meta app secret.",
			);
			throw new BadRequestException("WhatsApp webhook signature is invalid.");
		}
	}

	async receive(payload: WhatsAppWebhookPayload): Promise<void> {
		for (const entry of payload.entry) {
			for (const change of entry.changes) {
				if (!isMessageField(change.field)) continue;
				const value = change.value;
				if (
					this.phoneNumberId &&
					value.metadata?.phone_number_id &&
					value.metadata.phone_number_id !== this.phoneNumberId
				)
					continue;
				if (entry.id) {
					await this.db.appSetting.upsert({
						where: { id: SETTINGS_ID },
						create: { id: SETTINGS_ID, whatsappBusinessAccountId: entry.id },
						update: { whatsappBusinessAccountId: entry.id },
					});
				}

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
					await this.storeMessage({
						messageId: message.id,
						direction: "inbound",
						phone: message.from,
						name: names.get(normalizePhone(message.from)),
						messageType: message.type,
						body: whatsappMessageBody(message),
						occurredAt: whatsappTimestamp(message.timestamp),
						media: whatsappMediaOf(message),
					});
				}

				for (const message of value.message_echoes ?? []) {
					if (!message.to) continue;
					await this.storeMessage({
						messageId: message.id,
						direction: "outbound",
						phone: message.to,
						name: names.get(normalizePhone(message.to)),
						messageType: message.type,
						body: whatsappMessageBody(message),
						occurredAt: whatsappTimestamp(message.timestamp),
						media: whatsappMediaOf(message),
					});
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

	private async storeMessage({
		messageId,
		direction,
		phone: from,
		name: fromName,
		messageType,
		body,
		occurredAt,
		media,
	}: {
		messageId: string;
		direction: "inbound" | "outbound";
		phone: string;
		name: string | undefined;
		messageType: string;
		body: string;
		occurredAt: Date;
		media: WhatsAppMediaRef | null;
	}): Promise<void> {
		const phone = normalizePhone(from);
		if (!phone) return;
		const candidates = await this.db.lead.findMany({
			where: { archivedAt: null, phone: { not: null } },
			select: { id: true, ownerId: true, phone: true },
		});
		const people = await this.db.leadContact.findMany({
			where: { phone: { not: null }, lead: { archivedAt: null } },
			select: {
				id: true,
				name: true,
				phone: true,
				lead: { select: { id: true, ownerId: true, phone: true } },
			},
		});
		const exactPerson = people.find(
			(person) => normalizePhone(person.phone ?? "") === phone,
		);
		const exactLead = candidates.find(
			(candidate) => normalizePhone(candidate.phone ?? "") === phone,
		);
		const person =
			exactLead || exactPerson
				? exactPerson
				: people.find((candidate) => samePhone(candidate.phone, phone));
		let lead =
			exactLead ??
			person?.lead ??
			candidates.find((candidate) => samePhone(candidate.phone, phone));
		const contactId =
			lead && person && lead.id === person.lead.id ? person.id : null;
		const contactName = contactId ? (person?.name ?? null) : null;
		if (!lead) {
			const result = await this.leads.intake({
				name: fromName?.trim() || `WhatsApp ${phone.slice(-4)}`,
				phone: `+${phone}`,
				kind: "OTHER",
				stage: "NOT_CONTACTED",
				source: "WhatsApp",
				externalId: phone,
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
						direction,
						contactId,
						toName: direction === "outbound" ? contactName : null,
						...(direction === "inbound"
							? { from: phone, fromName: fromName ?? null }
							: { to: phone, mode: "phone" }),
						messageId,
						messageType,
						provider: "meta",
						...media,
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

function isMessageField(field: string): boolean {
	return (WHATSAPP.webhookFields as readonly string[]).includes(field);
}

function normalizePhone(value: string): string {
	return value.replace(/\D/g, "");
}

function jsonObject(value: Prisma.JsonValue | null): Prisma.JsonObject {
	const parsed = jsonObjectValue.safeParse(value);
	return parsed.success ? parsed.data : {};
}
