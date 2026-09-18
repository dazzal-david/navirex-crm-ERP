import {
	GMAIL_SEND_SCOPE,
	GOOGLE_PROVIDER_ID,
	MICROSOFT_PROVIDER_ID,
	OUTLOOK_SEND_SCOPE,
	parseScopes,
} from "@crm/auth";
import { ActivityType, type Db, type Prisma } from "@crm/db";
import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { z } from "zod";
import type { EnvironmentVariables } from "../config/env.validation";
import { InjectDatabase } from "../database/database.constants";
import { MailboxTokenService } from "../mailbox/mailbox-token.service";
import { GraphMailService } from "../microsoft/graph-mail.service";

const communicationMetaValue = z.object({
	channel: z.string().optional(),
	direction: z.string().optional(),
	fromName: z.string().nullable().optional(),
});

type WhatsAppTemplate = {
	name: string | undefined;
	language: { code: string };
	components?: {
		type: "body";
		parameters: { type: "text"; text: string }[];
	}[];
};

@Injectable()
export class CommunicationsService {
	private readonly whatsappToken?: string;
	private readonly whatsappPhoneId?: string;

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly tokens: MailboxTokenService,
		private readonly graphMail: GraphMailService,
		config: ConfigService<EnvironmentVariables, true>,
	) {
		this.whatsappToken = config.get("WHATSAPP_ACCESS_TOKEN", { infer: true });
		this.whatsappPhoneId = config.get("WHATSAPP_PHONE_NUMBER_ID", {
			infer: true,
		});
	}

	async status(userId: string) {
		const accounts = await this.db.account.findMany({
			where: {
				userId,
				providerId: { in: [GOOGLE_PROVIDER_ID, MICROSOFT_PROVIDER_ID] },
			},
			select: { providerId: true, scope: true },
		});
		const granted = (provider: string, scope: string) =>
			accounts.some(
				(account) =>
					account.providerId === provider &&
					parseScopes(account.scope).has(scope),
			);
		return {
			email: {
				google: granted(GOOGLE_PROVIDER_ID, GMAIL_SEND_SCOPE),
				microsoft:
					this.graphMail.configured ||
					granted(MICROSOFT_PROVIDER_ID, OUTLOOK_SEND_SCOPE),
				sender: this.graphMail.sender,
			},
			whatsapp: Boolean(this.whatsappToken && this.whatsappPhoneId),
		};
	}

	async conversations() {
		const leads = await this.db.lead.findMany({
			where: { archivedAt: null },
			select: {
				id: true,
				name: true,
				companyName: true,
				email: true,
				phone: true,
				stage: true,
				source: true,
				lastActivityAt: true,
				activities: {
					select: { body: true, subject: true },
					orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
					take: 1,
				},
			},
			orderBy: [{ lastActivityAt: "desc" }, { createdAt: "desc" }],
			take: 250,
		});

		return leads.map(({ activities, ...lead }) => ({
			...lead,
			preview: activities[0]?.body ?? activities[0]?.subject ?? null,
		}));
	}

	async conversation(leadId: string) {
		const lead = await this.db.lead.findUnique({
			where: { id: leadId },
			select: {
				id: true,
				name: true,
				companyName: true,
				email: true,
				phone: true,
				stage: true,
				source: true,
				lastActivityAt: true,
				contactId: true,
			},
		});
		if (!lead) throw new NotFoundException("That lead no longer exists.");

		const [activities, emailMessages] = await Promise.all([
			this.db.activity.findMany({
				where: { leadId },
				select: {
					id: true,
					type: true,
					subject: true,
					body: true,
					meta: true,
					occurredAt: true,
					createdAt: true,
					createdBy: { select: { name: true } },
				},
			}),
			lead.contactId
				? this.db.emailMessage.findMany({
						where: { thread: { contactId: lead.contactId } },
						select: {
							id: true,
							direction: true,
							fromName: true,
							fromEmail: true,
							subject: true,
							body: true,
							snippet: true,
							sentAt: true,
						},
					})
				: Promise.resolve([]),
		]);

		const items = [
			...activities.map((activity) => {
				const meta = communicationMeta(activity.meta);
				return {
					id: activity.id,
					channel:
						meta.channel === "whatsapp"
							? ("whatsapp" as const)
							: activity.type === ActivityType.EMAIL
								? ("email" as const)
								: ("note" as const),
					direction:
						meta.direction === "inbound"
							? ("inbound" as const)
							: meta.channel
								? ("outbound" as const)
								: ("internal" as const),
					subject: activity.subject,
					body: activity.body ?? activity.subject ?? "Activity",
					authorName:
						meta.direction === "inbound"
							? (meta.fromName ?? "WhatsApp contact")
							: activity.createdBy.name,
					occurredAt: activity.occurredAt ?? activity.createdAt,
				};
			}),
			...emailMessages.map((message) => ({
				id: message.id,
				channel: "email" as const,
				direction:
					message.direction === "INBOUND"
						? ("inbound" as const)
						: ("outbound" as const),
				subject: message.subject,
				body: message.body ?? message.snippet ?? "Email message",
				authorName: message.fromName ?? message.fromEmail,
				occurredAt: message.sentAt,
			})),
		].sort(
			(left, right) => left.occurredAt.getTime() - right.occurredAt.getTime(),
		);

		const { contactId: _contactId, ...leadOutput } = lead;
		return { lead: leadOutput, items };
	}

	async addNote(input: { leadId: string; body: string }, userId: string) {
		const lead = await this.db.lead.findUnique({
			where: { id: input.leadId },
			select: { id: true },
		});
		if (!lead) throw new NotFoundException("That lead no longer exists.");
		const activity = await this.db.activity.create({
			data: {
				type: ActivityType.NOTE,
				subject: "Internal note",
				body: input.body,
				leadId: lead.id,
				createdById: userId,
				occurredAt: new Date(),
				meta: { channel: "note", direction: "internal" },
			},
			select: { id: true },
		});
		await this.db.lead.update({
			where: { id: lead.id },
			data: { lastActivityAt: new Date() },
		});
		return activity;
	}

	async sendPinnedTemplate(
		input: {
			leadId: string;
			template: {
				channel: "EMAIL" | "WHATSAPP";
				subject: string | null;
				body: string;
				providerTemplateName: string | null;
				language: string;
			};
		},
		userId: string,
	) {
		if (input.template.channel === "EMAIL") {
			return this.sendEmail(
				{
					leadId: input.leadId,
					subject: input.template.subject ?? "A message from Navirex",
					body: input.template.body,
				},
				userId,
			);
		}
		if (!input.template.providerTemplateName) {
			throw new BadRequestException(
				"The approved WhatsApp template needs its Meta template name.",
			);
		}
		return this.sendWhatsApp(
			{
				leadId: input.leadId,
				mode: "template",
				templateName: input.template.providerTemplateName,
				language: input.template.language,
				variables: [],
			},
			userId,
		);
	}

	async sendEmail(
		input: { leadId: string; subject: string; body: string },
		userId: string,
	) {
		const lead = await this.db.lead.findUnique({
			where: { id: input.leadId },
			select: { id: true, email: true },
		});
		if (!lead) throw new NotFoundException("That lead no longer exists.");
		if (!lead.email)
			throw new BadRequestException("Add an email address first.");

		const status = await this.status(userId);
		let provider: string;
		let messageId: string | null;
		if (this.graphMail.configured) {
			provider = "microsoft";
			messageId = await this.sendMicrosoft(
				userId,
				lead.email,
				input.subject,
				input.body,
			);
		} else if (status.email.google) {
			provider = "google";
			messageId = await this.sendGoogle(
				userId,
				lead.email,
				input.subject,
				input.body,
			);
		} else if (status.email.microsoft) {
			provider = "microsoft";
			messageId = await this.sendMicrosoft(
				userId,
				lead.email,
				input.subject,
				input.body,
			);
		} else {
			throw new BadRequestException(
				"Reconnect Google or Microsoft with email sending access.",
			);
		}

		await this.log(
			lead.id,
			userId,
			ActivityType.EMAIL,
			input.subject,
			input.body,
			{
				channel: "email",
				provider,
				messageId,
				from: this.graphMail.sender,
				to: lead.email,
			},
		);
		return { provider, messageId };
	}

	async sendWhatsApp(
		input: {
			leadId: string;
			mode: "text" | "template";
			body?: string;
			templateName?: string;
			language: string;
			variables: string[];
		},
		userId: string,
	) {
		if (!this.whatsappToken || !this.whatsappPhoneId) {
			throw new BadRequestException("WhatsApp Cloud API is not configured.");
		}
		const lead = await this.db.lead.findUnique({
			where: { id: input.leadId },
			select: { id: true, phone: true },
		});
		if (!lead) throw new NotFoundException("That lead no longer exists.");
		const phone = normalizePhone(lead.phone);
		if (!phone)
			throw new BadRequestException(
				"Add a valid international phone number first.",
			);

		const template: WhatsAppTemplate = {
			name: input.templateName,
			language: { code: input.language },
		};
		if (input.variables.length > 0) {
			template.components = [
				{
					type: "body",
					parameters: input.variables.map((text) => ({
						type: "text",
						text,
					})),
				},
			];
		}

		const payload =
			input.mode === "text"
				? {
						messaging_product: "whatsapp",
						to: phone,
						type: "text",
						text: { body: input.body, preview_url: true },
					}
				: {
						messaging_product: "whatsapp",
						to: phone,
						type: "template",
						template,
					};

		const response = await fetch(
			`https://graph.facebook.com/v26.0/${encodeURIComponent(this.whatsappPhoneId)}/messages`,
			{
				method: "POST",
				headers: {
					authorization: `Bearer ${this.whatsappToken}`,
					"content-type": "application/json",
				},
				body: JSON.stringify(payload),
				signal: AbortSignal.timeout(20_000),
			},
		);
		const result = (await response.json()) as {
			messages?: { id?: string }[];
			error?: { message?: string };
		};
		if (!response.ok) {
			throw new BadRequestException(
				result.error?.message ?? `WhatsApp returned HTTP ${response.status}.`,
			);
		}
		const messageId = result.messages?.[0]?.id ?? null;
		const body =
			input.mode === "text"
				? (input.body ?? "")
				: `Template: ${input.templateName}`;
		await this.log(
			lead.id,
			userId,
			ActivityType.NOTE,
			"WhatsApp message",
			body,
			{
				channel: "whatsapp",
				provider: "meta",
				messageId,
				to: phone,
				mode: input.mode,
			},
		);
		return { provider: "whatsapp", messageId };
	}

	private async sendGoogle(
		userId: string,
		to: string,
		subject: string,
		body: string,
	) {
		const token = await this.tokens.accessTokenFor(userId, "gmail");
		if (token.outcome !== "ok") throw new BadRequestException(token.reason);
		const mime = [
			`To: ${to}`,
			`Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`,
			"MIME-Version: 1.0",
			"Content-Type: text/plain; charset=UTF-8",
			"Content-Transfer-Encoding: 8bit",
			"",
			body,
		].join("\r\n");
		const raw = Buffer.from(mime).toString("base64url");
		const response = await fetch(
			"https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
			{
				method: "POST",
				headers: {
					authorization: `Bearer ${token.accessToken}`,
					"content-type": "application/json",
				},
				body: JSON.stringify({ raw }),
				signal: AbortSignal.timeout(20_000),
			},
		);
		const result = (await response.json()) as {
			id?: string;
			error?: { message?: string };
		};
		if (!response.ok)
			throw new BadRequestException(
				result.error?.message ?? `Gmail returned HTTP ${response.status}.`,
			);
		return result.id ?? null;
	}

	private async sendMicrosoft(
		userId: string,
		to: string,
		subject: string,
		body: string,
	) {
		if (this.graphMail.configured) {
			await this.graphMail.send(to, subject, body);
			return null;
		}
		const token = await this.tokens.accessTokenFor(userId, "outlook");
		if (token.outcome !== "ok") throw new BadRequestException(token.reason);
		const response = await fetch(
			"https://graph.microsoft.com/v1.0/me/sendMail",
			{
				method: "POST",
				headers: {
					authorization: `Bearer ${token.accessToken}`,
					"content-type": "application/json",
				},
				body: JSON.stringify({
					message: {
						subject,
						body: { contentType: "Text", content: body },
						toRecipients: [{ emailAddress: { address: to } }],
					},
					saveToSentItems: true,
				}),
				signal: AbortSignal.timeout(20_000),
			},
		);
		if (!response.ok) {
			const result = (await response.json()) as {
				error?: { message?: string };
			};
			throw new BadRequestException(
				result.error?.message ?? `Microsoft returned HTTP ${response.status}.`,
			);
		}
		return null;
	}

	private async log(
		leadId: string,
		userId: string,
		type: ActivityType,
		subject: string,
		body: string,
		meta: Record<string, string | null>,
	) {
		const now = new Date();
		await this.db.$transaction([
			this.db.activity.create({
				data: {
					type,
					subject,
					body,
					leadId,
					createdById: userId,
					occurredAt: now,
					meta,
				},
			}),
			this.db.lead.update({
				where: { id: leadId },
				data: { lastActivityAt: now },
			}),
		]);
	}
}

function communicationMeta(value: Prisma.JsonValue | null) {
	const parsed = communicationMetaValue.safeParse(value);
	return parsed.success ? parsed.data : {};
}

function normalizePhone(value: string | null): string | null {
	const digits = value?.replace(/\D/g, "") ?? "";
	return digits.length >= 8 && digits.length <= 15 ? digits : null;
}
