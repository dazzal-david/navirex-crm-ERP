import { randomUUID } from "node:crypto";
import {
	GMAIL_SEND_SCOPE,
	GOOGLE_PROVIDER_ID,
	MICROSOFT_PROVIDER_ID,
	OUTLOOK_SEND_SCOPE,
	parseScopes,
} from "@crm/auth";
import { ActivityType, type Db, type Prisma } from "@crm/db";
import { samePhone } from "@crm/validation/phone";
import {
	buildTemplateComponents,
	templateHeaderMedia,
	type WhatsAppHeaderMediaSource,
	type WhatsAppSendComponent,
	type WhatsAppTemplateComponent,
	whatsappTemplateComponents,
} from "@crm/validation/whatsapp-template";
import {
	BadRequestException,
	GoneException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { z } from "zod";
import type { EnvironmentVariables } from "../config/env.validation";
import { InjectDatabase } from "../database/database.constants";
import { MailboxTokenService } from "../mailbox/mailbox-token.service";
import {
	GraphMailService,
	graphMessage,
	type MailAttachment,
} from "../microsoft/graph-mail.service";
import { EMAIL } from "./email-config";
import {
	WHATSAPP,
	type WhatsAppMediaKind,
	WINDOW_CLOSED_MESSAGE,
} from "./whatsapp-config";

const communicationMetaValue = z.object({
	channel: z.string().optional(),
	direction: z.string().optional(),
	from: z.string().optional(),
	toName: z.string().nullable().optional(),
	fromName: z.string().nullable().optional(),
	mediaId: z.string().optional(),
	mediaKind: z
		.enum(["image", "video", "document", "audio", "sticker"])
		.optional(),
	mimeType: z.string().nullable().optional(),
	filename: z.string().nullable().optional(),
	voice: z.boolean().optional(),
	deliveryStatus: z.string().optional(),
	deliveryError: z.string().nullable().optional(),
	attachmentNames: z.string().nullable().optional(),
});

const graphSendResult = z.object({
	messages: z.array(z.object({ id: z.string().optional() })).optional(),
	id: z.string().optional(),
	url: z.string().optional(),
	mime_type: z.string().optional(),
	error: z
		.object({ message: z.string().optional(), code: z.number().optional() })
		.optional(),
});

const freshTemplate = z.object({
	components: whatsappTemplateComponents.optional(),
});

type WhatsAppMediaPayload = { id: string; caption?: string; filename?: string };

type WhatsAppSendPayload = { messaging_product: "whatsapp"; to: string } & (
	| { type: "text"; text: { body: string | undefined; preview_url: boolean } }
	| { type: "template"; template: WhatsAppTemplate }
	| ({ type: WhatsAppMediaKind } & Partial<
			Record<WhatsAppMediaKind, WhatsAppMediaPayload>
	  >)
);

type WhatsAppMediaUpload = {
	leadId: string;
	contactId?: string;
	bytes: Buffer;
	mimeType: string;
	filename: string;
	caption?: string;
};

type WhatsAppTemplate = {
	name: string | undefined;
	language: { code: string };
	components?: WhatsAppSendComponent[];
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

	async conversations(userId: string) {
		const [leads, unread] = await Promise.all([
			this.conversationLeads(),
			this.unreadByLead(userId),
		]);
		return leads.map(({ activities, ...lead }) => ({
			...lead,
			preview: activities[0]?.body ?? activities[0]?.subject ?? null,
			unread: unread.get(lead.id) ?? 0,
		}));
	}

	async unread(userId: string) {
		const unread = await this.unreadByLead(userId);
		return { conversations: unread.size };
	}

	async markRead(leadId: string, userId: string) {
		const readAt = new Date();
		await this.db.leadConversationRead.upsert({
			where: { userId_leadId: { userId, leadId } },
			create: { userId, leadId, readAt },
			update: { readAt },
		});
		return { readAt };
	}

	async notes(leadId: string) {
		const notes = await this.db.activity.findMany({
			where: { leadId, type: ActivityType.NOTE },
			orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
			take: WHATSAPP.noteLimit,
			select: {
				id: true,
				body: true,
				subject: true,
				meta: true,
				occurredAt: true,
				createdAt: true,
				createdBy: { select: { name: true } },
			},
		});
		return notes
			.filter((note) => communicationMeta(note.meta).channel !== "whatsapp")
			.map((note) => ({
				id: note.id,
				body: note.body ?? note.subject ?? "",
				authorName: note.createdBy.name,
				occurredAt: note.occurredAt ?? note.createdAt,
			}));
	}

	private async unreadByLead(userId: string) {
		const rows = await this.db.$queryRaw<{ leadId: string; unread: bigint }[]>`
			SELECT a."leadId", count(*) AS unread
			FROM "activity" a
			JOIN "lead" l ON l."id" = a."leadId" AND l."archivedAt" IS NULL
			JOIN "user" u ON u."id" = ${userId}
			LEFT JOIN "leadConversationRead" r
				ON r."leadId" = a."leadId" AND r."userId" = ${userId}
			WHERE a."meta"->>'channel' = 'whatsapp'
				AND a."meta"->>'direction' = 'inbound'
				AND COALESCE(a."occurredAt", a."createdAt") > COALESCE(r."readAt", u."createdAt")
			GROUP BY a."leadId"
		`;
		return new Map(rows.map((row) => [row.leadId, Number(row.unread)]));
	}

	private conversationLeads() {
		return this.db.lead.findMany({
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
					where: { type: { in: CONVERSATION_TYPES } },
					select: { body: true, subject: true },
					orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
					take: 1,
				},
			},
			orderBy: [{ lastActivityAt: "desc" }, { createdAt: "desc" }],
			take: WHATSAPP.conversationLimit,
		});
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
				where: { leadId, type: { in: CONVERSATION_TYPES } },
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
					attachment:
						meta.mediaId && meta.mediaKind
							? {
									url: `/api/communications/media/${encodeURIComponent(activity.id)}`,
									kind: meta.mediaKind,
									mimeType: meta.mimeType ?? null,
									filename: meta.filename ?? null,
									voice: meta.voice ?? false,
								}
							: null,
					deliveryStatus: meta.deliveryStatus ?? null,
					deliveryError: meta.deliveryError ?? null,
					recipientName: meta.toName ?? null,
					fileNames: meta.attachmentNames
						? meta.attachmentNames.split("\n")
						: [],
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
				attachment: null,
				deliveryStatus: null,
				deliveryError: null,
				recipientName: null,
				fileNames: [],
			})),
		].sort(
			(left, right) => left.occurredAt.getTime() - right.occurredAt.getTime(),
		);

		const { contactId: _contactId, ...leadOutput } = lead;
		return {
			lead: leadOutput,
			items,
			whatsappWindow: await this.whatsappWindow(leadId),
			recipients: await this.recipients(leadId),
		};
	}

	async whatsappWindow(leadId: string, contactId?: string) {
		const recipient = await this.recipient(leadId, contactId);
		const inbound = await this.db.activity.findMany({
			where: {
				leadId,
				AND: [
					{ meta: { path: ["channel"], equals: "whatsapp" } },
					{ meta: { path: ["direction"], equals: "inbound" } },
				],
			},
			orderBy: { occurredAt: { sort: "desc", nulls: "last" } },
			take: WHATSAPP.windowScanLimit,
			select: { occurredAt: true, createdAt: true, meta: true },
		});
		const last = inbound.find((activity) => {
			const from = communicationMeta(activity.meta).from;
			return from
				? samePhone(from, recipient.phone)
				: recipient.contactId === null;
		});
		const lastInboundAt = last ? (last.occurredAt ?? last.createdAt) : null;
		const closesAt = lastInboundAt
			? new Date(lastInboundAt.getTime() + WHATSAPP.serviceWindowMs)
			: null;
		return {
			open: closesAt !== null && closesAt.getTime() > Date.now(),
			lastInboundAt,
			closesAt,
		};
	}

	async recipients(leadId: string) {
		const lead = await this.db.lead.findUnique({
			where: { id: leadId },
			select: {
				name: true,
				designation: true,
				phone: true,
				email: true,
				contacts: {
					orderBy: [{ createdAt: "asc" }, { id: "asc" }],
					select: {
						id: true,
						name: true,
						designation: true,
						phone: true,
						email: true,
					},
				},
			},
		});
		if (!lead) throw new NotFoundException("That lead no longer exists.");
		return [
			{
				id: null,
				name: lead.name,
				designation: lead.designation,
				phone: lead.phone,
				email: lead.email,
				primary: true,
			},
			...lead.contacts.map((contact) => ({ ...contact, primary: false })),
		];
	}

	private async recipient(leadId: string, contactId?: string) {
		if (contactId) {
			const contact = await this.db.leadContact.findFirst({
				where: { id: contactId, leadId },
				select: { id: true, name: true, phone: true, email: true },
			});
			if (!contact)
				throw new NotFoundException("That contact no longer exists.");
			return { leadId, contactId: contact.id, ...contact };
		}
		const lead = await this.db.lead.findUnique({
			where: { id: leadId },
			select: { id: true, name: true, phone: true, email: true },
		});
		if (!lead) throw new NotFoundException("That lead no longer exists.");
		return {
			leadId: lead.id,
			contactId: null,
			id: lead.id,
			name: lead.name,
			phone: lead.phone,
			email: lead.email,
		};
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
		input: {
			leadId: string;
			contactId?: string;
			subject: string;
			body: string;
			attachments?: { name: string; mimeType: string; contentBase64: string }[];
		},
		userId: string,
	) {
		const attachments = emailAttachments(input.attachments ?? []);
		const recipient = await this.recipient(input.leadId, input.contactId);
		const lead = { id: recipient.leadId, email: recipient.email };
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
				attachments,
			);
		} else if (status.email.google) {
			provider = "google";
			messageId = await this.sendGoogle(
				userId,
				lead.email,
				input.subject,
				input.body,
				attachments,
			);
		} else if (status.email.microsoft) {
			provider = "microsoft";
			messageId = await this.sendMicrosoft(
				userId,
				lead.email,
				input.subject,
				input.body,
				attachments,
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
				toName: recipient.name,
				contactId: recipient.contactId,
				attachmentNames:
					attachments.length > 0
						? attachments.map((attachment) => attachment.name).join("\n")
						: null,
			},
		);
		return { provider, messageId };
	}

	async sendNotificationEmail(
		userId: string,
		recipients: string[],
		subject: string,
		body: string,
	): Promise<void> {
		const uniqueRecipients = [
			...new Set(recipients.map((email) => email.toLowerCase())),
		];
		if (uniqueRecipients.length === 0) return;

		const status = await this.status(userId);
		if (this.graphMail.configured || status.email.microsoft) {
			await Promise.all(
				uniqueRecipients.map((to) =>
					this.sendMicrosoft(userId, to, subject, body),
				),
			);
			return;
		}
		if (status.email.google) {
			await Promise.all(
				uniqueRecipients.map((to) =>
					this.sendGoogle(userId, to, subject, body),
				),
			);
			return;
		}

		throw new BadRequestException(
			"Connect Google or Microsoft email before enabling reimbursement notifications.",
		);
	}

	async sendWhatsApp(
		input: {
			leadId: string;
			contactId?: string;
			mode: "text" | "template";
			body?: string;
			templateName?: string;
			language: string;
			variables: string[];
			fields?: Record<string, string>;
			headerMediaId?: string;
		},
		userId: string,
	) {
		const lead = await this.whatsappLead(input.leadId, input.contactId);
		if (input.mode === "text")
			await this.requireOpenWindow(lead.id, lead.contactId);

		const template: WhatsAppTemplate = {
			name: input.templateName,
			language: { code: input.language },
		};
		if (input.mode === "template" && input.templateName) {
			const components = await this.templateComponents(
				input.templateName,
				input.language,
				{
					...Object.fromEntries(
						input.variables.map((value, index) => [`body:${index + 1}`, value]),
					),
					...input.fields,
				},
				input.headerMediaId,
			);
			if (components.length > 0) template.components = components;
		}

		const messageId = await this.postWhatsApp(
			input.mode === "text"
				? {
						messaging_product: "whatsapp",
						to: lead.phone,
						type: "text",
						text: { body: input.body, preview_url: true },
					}
				: {
						messaging_product: "whatsapp",
						to: lead.phone,
						type: "template",
						template,
					},
		);
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
				to: lead.phone,
				toName: lead.name,
				contactId: lead.contactId,
				mode: input.mode,
			},
		);
		return { provider: "whatsapp", messageId };
	}

	async uploadWhatsAppMedia(
		input: {
			bytes: Buffer;
			mimeType: string;
			filename: string;
		},
		maxBytes: number = WHATSAPP.uploadMaxBytes,
	) {
		if (!this.whatsappToken || !this.whatsappPhoneId) {
			throw new BadRequestException("WhatsApp Cloud API is not configured.");
		}
		const mimeType = baseMimeType(input.mimeType);
		const kind = mediaKindOf(mimeType);
		if (!kind) {
			throw new BadRequestException(
				"WhatsApp cannot send this file type. Send an image (JPG, PNG), video (MP4), audio, PDF or Office document.",
			);
		}
		if (input.bytes.byteLength === 0) {
			throw new BadRequestException("The file is empty.");
		}
		if (input.bytes.byteLength > maxBytes) {
			throw new BadRequestException(
				`The file is too large. The limit is ${maxBytes / (1024 * 1024)} MB.`,
			);
		}

		const form = new FormData();
		form.append("messaging_product", "whatsapp");
		form.append("type", mimeType);
		form.append(
			"file",
			new Blob([new Uint8Array(input.bytes)], { type: mimeType }),
			input.filename,
		);
		const upload = await this.graph(
			`${WHATSAPP.graphBase}/${encodeURIComponent(this.whatsappPhoneId ?? "")}/media`,
			{ method: "POST", body: form },
		);
		if (!upload.id) {
			throw new BadRequestException("WhatsApp did not accept the file.");
		}
		return { id: upload.id, kind, mimeType };
	}

	async sendWhatsAppMedia(input: WhatsAppMediaUpload, userId: string) {
		const lead = await this.whatsappLead(input.leadId, input.contactId);
		await this.requireOpenWindow(lead.id, lead.contactId);
		const upload = await this.uploadWhatsAppMedia(input);
		const { kind, mimeType } = upload;

		const caption = input.caption?.trim() || undefined;
		const media: WhatsAppMediaPayload = { id: upload.id };
		if (caption && kind !== "audio") media.caption = caption;
		if (kind === "document") media.filename = input.filename;

		const messageId = await this.postWhatsApp({
			messaging_product: "whatsapp",
			to: lead.phone,
			type: kind,
			[kind]: media,
		});

		await this.log(
			lead.id,
			userId,
			ActivityType.NOTE,
			"WhatsApp message",
			caption ?? mediaLabel(kind, input.filename),
			{
				channel: "whatsapp",
				provider: "meta",
				messageId,
				to: lead.phone,
				toName: lead.name,
				contactId: lead.contactId,
				mode: "media",
				mediaId: upload.id,
				mediaKind: kind,
				mimeType,
				filename: input.filename,
			},
		);
		return { provider: "whatsapp", messageId };
	}

	async whatsappMedia(activityId: string) {
		if (!this.whatsappToken) {
			throw new BadRequestException("WhatsApp Cloud API is not configured.");
		}
		const activity = await this.db.activity.findUnique({
			where: { id: activityId },
			select: { meta: true },
		});
		const meta = communicationMeta(activity?.meta ?? null);
		if (!activity || meta.channel !== "whatsapp" || !meta.mediaId) {
			throw new NotFoundException("That WhatsApp file does not exist.");
		}

		const expired = new GoneException(
			"This file has expired. WhatsApp keeps files for 30 days.",
		);
		const lookup = await fetch(
			`${WHATSAPP.graphBase}/${encodeURIComponent(meta.mediaId)}`,
			{
				headers: { authorization: `Bearer ${this.whatsappToken}` },
				signal: AbortSignal.timeout(WHATSAPP.timeoutMs),
			},
		);
		const found = graphSendResult.safeParse(
			await lookup.json().catch(() => null),
		);
		if (!lookup.ok || !found.success || !found.data.url) throw expired;

		const file = await fetch(found.data.url, {
			headers: { authorization: `Bearer ${this.whatsappToken}` },
			signal: AbortSignal.timeout(WHATSAPP.timeoutMs),
		});
		if (!file.ok || !file.body) throw expired;

		return {
			body: file.body,
			mimeType:
				found.data.mime_type ?? meta.mimeType ?? "application/octet-stream",
			filename: meta.filename ?? `whatsapp-${meta.mediaKind ?? "file"}`,
			size: file.headers.get("content-length"),
		};
	}

	private async templateComponents(
		name: string,
		language: string,
		values: Record<string, string>,
		headerMediaId: string | undefined,
	): Promise<WhatsAppSendComponent[]> {
		const stored = await this.db.messageTemplate.findFirst({
			where: { channel: "WHATSAPP", providerTemplateName: name, language },
			orderBy: { updatedAt: "desc" },
			select: { providerTemplateId: true, components: true },
		});
		const storedComponents = whatsappTemplateComponents.safeParse(
			stored?.components ?? null,
		);
		const components =
			(await this.freshComponents(stored?.providerTemplateId ?? null)) ??
			(storedComponents.success ? storedComponents.data : []);

		const media = templateHeaderMedia(components);
		const headerMedia: WhatsAppHeaderMediaSource | null = headerMediaId
			? { id: headerMediaId }
			: media?.sampleUrl
				? { id: await this.uploadTemplateSample(media.sampleUrl, media.kind) }
				: null;

		try {
			return buildTemplateComponents(components, values, headerMedia);
		} catch (error) {
			throw new BadRequestException(
				error instanceof Error ? error.message : String(error),
			);
		}
	}

	private async uploadTemplateSample(
		sampleUrl: string,
		kind: keyof typeof WHATSAPP.templateHeaderTypes,
	): Promise<string> {
		const failure = new BadRequestException(
			`Could not load this template's approved header ${kind} from Meta. Use "Replace ${kind}" to attach one.`,
		);
		let response: Response;
		try {
			response = await fetch(sampleUrl, {
				signal: AbortSignal.timeout(WHATSAPP.timeoutMs),
			});
		} catch {
			throw failure;
		}
		if (!response.ok) throw failure;
		const bytes = Buffer.from(await response.arrayBuffer());
		const declared = baseMimeType(response.headers.get("content-type") ?? "");
		const mimeType = mediaKindOf(declared)
			? declared
			: WHATSAPP.templateHeaderTypes[kind];
		const upload = await this.uploadWhatsAppMedia(
			{
				bytes,
				mimeType,
				filename: `template-header.${mimeType.split("/")[1] ?? "bin"}`,
			},
			WHATSAPP.templateHeaderMaxBytes,
		);
		return upload.id;
	}

	private async freshComponents(
		templateId: string | null,
	): Promise<WhatsAppTemplateComponent[] | null> {
		if (!templateId || !this.whatsappToken) return null;
		try {
			const response = await fetch(
				`${WHATSAPP.graphBase}/${encodeURIComponent(templateId)}?fields=components`,
				{
					headers: { authorization: `Bearer ${this.whatsappToken}` },
					signal: AbortSignal.timeout(WHATSAPP.timeoutMs),
				},
			);
			const parsed = freshTemplate.safeParse(
				await response.json().catch(() => null),
			);
			if (!response.ok || !parsed.success) return null;
			return parsed.data.components ?? null;
		} catch {
			return null;
		}
	}

	private async whatsappLead(leadId: string, contactId?: string) {
		if (!this.whatsappToken || !this.whatsappPhoneId) {
			throw new BadRequestException("WhatsApp Cloud API is not configured.");
		}
		const recipient = await this.recipient(leadId, contactId);
		const phone = normalizePhone(recipient.phone);
		if (!phone)
			throw new BadRequestException(
				"Add a valid international phone number first.",
			);
		return {
			id: recipient.leadId,
			phone,
			name: recipient.name,
			contactId: recipient.contactId,
		};
	}

	private async requireOpenWindow(leadId: string, contactId: string | null) {
		const window = await this.whatsappWindow(leadId, contactId ?? undefined);
		if (!window.open) throw new BadRequestException(WINDOW_CLOSED_MESSAGE);
	}

	private async postWhatsApp(
		payload: WhatsAppSendPayload,
	): Promise<string | null> {
		const result = await this.graph(
			`${WHATSAPP.graphBase}/${encodeURIComponent(this.whatsappPhoneId ?? "")}/messages`,
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(payload),
			},
		);
		return result.messages?.[0]?.id ?? null;
	}

	private async graph(url: string, init: RequestInit) {
		const response = await fetch(url, {
			...init,
			headers: {
				...init.headers,
				authorization: `Bearer ${this.whatsappToken}`,
			},
			signal: AbortSignal.timeout(WHATSAPP.timeoutMs),
		});
		const parsed = graphSendResult.safeParse(
			await response.json().catch(() => null),
		);
		const result = parsed.success ? parsed.data : {};
		if (!response.ok) {
			const code = result.error?.code;
			if (
				code !== undefined &&
				(WHATSAPP.windowClosedCodes as readonly number[]).includes(code)
			) {
				throw new BadRequestException(WINDOW_CLOSED_MESSAGE);
			}
			throw new BadRequestException(
				result.error?.message ?? `WhatsApp returned HTTP ${response.status}.`,
			);
		}
		return result;
	}

	private async sendGoogle(
		userId: string,
		to: string,
		subject: string,
		body: string,
		attachments: MailAttachment[] = [],
	) {
		const token = await this.tokens.accessTokenFor(userId, "gmail");
		if (token.outcome !== "ok") throw new BadRequestException(token.reason);
		const mime = gmailMime(to, subject, body, attachments);
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
		attachments: MailAttachment[] = [],
	) {
		if (this.graphMail.configured) {
			await this.graphMail.send(to, subject, body, attachments);
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
					message: graphMessage(to, subject, body, attachments),
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
		meta: Record<string, string | boolean | null>,
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

const CONVERSATION_TYPES: ActivityType[] = [
	ActivityType.NOTE,
	ActivityType.EMAIL,
	ActivityType.CALL,
	ActivityType.MEETING,
];

function communicationMeta(value: Prisma.JsonValue | null) {
	const parsed = communicationMetaValue.safeParse(value);
	return parsed.success ? parsed.data : {};
}

function normalizePhone(value: string | null): string | null {
	const digits = value?.replace(/\D/g, "") ?? "";
	return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

function baseMimeType(value: string): string {
	return value.split(";")[0]?.trim().toLowerCase() ?? "";
}

function mediaKindOf(mimeType: string): WhatsAppMediaKind | null {
	for (const [kind, types] of Object.entries(WHATSAPP.mediaKinds)) {
		if ((types as readonly string[]).includes(mimeType)) {
			return kind as WhatsAppMediaKind;
		}
	}
	return null;
}

function mediaLabel(kind: WhatsAppMediaKind, filename: string): string {
	if (kind === "document") return `[Document: ${filename}]`;
	if (kind === "audio") return "[Voice message]";
	return kind === "image" ? "[Image]" : "[Video]";
}

function emailAttachments(
	input: { name: string; mimeType: string; contentBase64: string }[],
): MailAttachment[] {
	if (input.length > EMAIL.attachmentMaxCount) {
		throw new BadRequestException(
			`Attach at most ${EMAIL.attachmentMaxCount} files.`,
		);
	}
	const attachments = input.map((attachment) => ({
		name: attachment.name.replace(/[\r\n"]/g, " "),
		mimeType: baseMimeType(attachment.mimeType) || "application/octet-stream",
		content: Buffer.from(attachment.contentBase64, "base64"),
	}));
	const total = attachments.reduce(
		(sum, attachment) => sum + attachment.content.byteLength,
		0,
	);
	if (total > EMAIL.attachmentMaxBytes) {
		throw new BadRequestException(
			`The attachments are too large. The limit is ${EMAIL.attachmentMaxBytes / (1024 * 1024)} MB in total.`,
		);
	}
	return attachments;
}

function encodedWord(value: string): string {
	return `=?UTF-8?B?${Buffer.from(value).toString("base64")}?=`;
}

function gmailMime(
	to: string,
	subject: string,
	body: string,
	attachments: MailAttachment[],
): string {
	const headers = [
		`To: ${to}`,
		`Subject: ${encodedWord(subject)}`,
		"MIME-Version: 1.0",
	];
	if (attachments.length === 0) {
		return [
			...headers,
			"Content-Type: text/plain; charset=UTF-8",
			"Content-Transfer-Encoding: 8bit",
			"",
			body,
		].join("\r\n");
	}
	const boundary = `navirex-${randomUUID()}`;
	const parts = attachments.flatMap((attachment) => [
		`--${boundary}`,
		`Content-Type: ${attachment.mimeType}; name="${encodedWord(attachment.name)}"`,
		`Content-Disposition: attachment; filename="${encodedWord(attachment.name)}"`,
		"Content-Transfer-Encoding: base64",
		"",
		attachment.content.toString("base64").replace(/.{76}/g, "$&\r\n"),
	]);
	return [
		...headers,
		`Content-Type: multipart/mixed; boundary="${boundary}"`,
		"",
		`--${boundary}`,
		"Content-Type: text/plain; charset=UTF-8",
		"Content-Transfer-Encoding: 8bit",
		"",
		body,
		...parts,
		`--${boundary}--`,
		"",
	].join("\r\n");
}
