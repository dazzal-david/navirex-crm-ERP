import { z } from "zod";

export const inboundLeadPayload = z
	.object({
		name: z.string().trim().min(1).max(200),
		email: z.email().max(320).optional(),
		phone: z.string().trim().max(50).optional(),
		companyName: z.string().trim().max(200).optional(),
		message: z.string().trim().max(50_000).optional(),
		source: z.string().trim().max(120).optional(),
		externalId: z.string().trim().max(200).optional(),
		channel: z.enum(["email", "whatsapp", "webhook"]).default("webhook"),
	})
	.refine((lead) => Boolean(lead.email || lead.phone), {
		message: "An email address or phone number is required.",
	});

export const webhookOutput = z.object({
	id: z.string(),
	name: z.string(),
	source: z.string(),
	enabled: z.boolean(),
	lastReceivedAt: z.date().nullable(),
	lastError: z.string().nullable(),
	createdAt: z.date(),
});

export const webhooksOutput = z.array(webhookOutput);

export const webhookCreateInput = z.object({
	name: z.string().trim().min(1).max(120),
	source: z.string().trim().min(1).max(120),
});

export const webhookCreateOutput = webhookOutput.extend({
	secret: z.string(),
	path: z.string(),
});

export const webhookUpdateInput = z.object({
	id: z.string(),
	enabled: z.boolean(),
});

export type InboundLeadPayload = z.infer<typeof inboundLeadPayload>;
