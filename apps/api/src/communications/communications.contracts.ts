import { z } from "zod";

export const communicationStatusOutput = z.object({
	email: z.object({
		google: z.boolean(),
		microsoft: z.boolean(),
		sender: z.string().nullable(),
	}),
	whatsapp: z.boolean(),
});

export const emailAttachmentInput = z.object({
	name: z.string().trim().min(1).max(200),
	mimeType: z.string().trim().max(200),
	contentBase64: z.base64(),
});

export const sendEmailInput = z.object({
	leadId: z.string(),
	subject: z.string().trim().min(1).max(300),
	body: z.string().trim().min(1).max(50_000),
	attachments: z.array(emailAttachmentInput).max(10).default([]),
});

export const sendWhatsAppInput = z
	.object({
		leadId: z.string(),
		mode: z.enum(["text", "template"]),
		body: z.string().trim().max(4096).optional(),
		templateName: z.string().trim().max(512).optional(),
		language: z.string().trim().max(20).default("en_US"),
		variables: z.array(z.string().max(1024)).max(10).default([]),
	})
	.superRefine((input, context) => {
		if (input.mode === "text" && !input.body) {
			context.addIssue({
				code: "custom",
				message: "Message text is required.",
				path: ["body"],
			});
		}
		if (input.mode === "template" && !input.templateName) {
			context.addIssue({
				code: "custom",
				message: "Template name is required.",
				path: ["templateName"],
			});
		}
	});

export const sendMessageOutput = z.object({
	provider: z.string(),
	messageId: z.string().nullable(),
});

export const conversationInput = z.object({ leadId: z.string() });

export const conversationSummary = z.object({
	id: z.string(),
	name: z.string(),
	companyName: z.string().nullable(),
	email: z.string().nullable(),
	phone: z.string().nullable(),
	stage: z.string(),
	source: z.string().nullable(),
	lastActivityAt: z.date().nullable(),
	preview: z.string().nullable(),
});

export const conversationItem = z.object({
	id: z.string(),
	channel: z.enum(["email", "whatsapp", "note"]),
	direction: z.enum(["inbound", "outbound", "internal"]),
	subject: z.string().nullable(),
	body: z.string(),
	authorName: z.string().nullable(),
	occurredAt: z.date(),
	attachment: z
		.object({
			url: z.string(),
			kind: z.enum(["image", "video", "document", "audio", "sticker"]),
			mimeType: z.string().nullable(),
			filename: z.string().nullable(),
			voice: z.boolean(),
		})
		.nullable(),
	deliveryStatus: z.string().nullable(),
	deliveryError: z.string().nullable(),
	fileNames: z.array(z.string()),
});

export const whatsappWindowOutput = z.object({
	open: z.boolean(),
	lastInboundAt: z.date().nullable(),
	closesAt: z.date().nullable(),
});

export const conversationsOutput = z.array(conversationSummary);

export const conversationOutput = z.object({
	lead: conversationSummary.omit({ preview: true }),
	items: z.array(conversationItem),
	whatsappWindow: whatsappWindowOutput,
});

export const addNoteInput = z.object({
	leadId: z.string(),
	body: z.string().trim().min(1).max(50_000),
});

export const addNoteOutput = z.object({ id: z.string() });

export const pinnedTemplateInput = z.object({
	userId: z.string(),
	leadId: z.string(),
	template: z.object({
		id: z.string(),
		name: z.string(),
		channel: z.enum(["EMAIL", "WHATSAPP"]),
		subject: z.string().nullable(),
		body: z.string(),
		providerTemplateName: z.string().nullable(),
		language: z.string(),
	}),
});

export type PinnedTemplateInput = z.infer<typeof pinnedTemplateInput>;
