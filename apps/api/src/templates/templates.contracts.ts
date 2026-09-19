import { z } from "zod";

export const templateChannel = z.enum(["EMAIL", "WHATSAPP", "NOTE"]);

export const templateOutput = z.object({
	id: z.string(),
	name: z.string(),
	channel: templateChannel,
	subject: z.string().nullable(),
	body: z.string(),
	providerTemplateName: z.string().nullable(),
	providerTemplateId: z.string().nullable(),
	providerStatus: z.string().nullable(),
	providerCategory: z.string().nullable(),
	providerSyncedAt: z.date().nullable(),
	language: z.string(),
	active: z.boolean(),
	createdAt: z.date(),
	updatedAt: z.date(),
});

export const templatesOutput = z.array(templateOutput);

export const metaTemplateSyncStatusOutput = z.object({
	configured: z.boolean(),
	accessTokenConfigured: z.boolean(),
	businessAccountId: z.string().nullable(),
	lastAttemptAt: z.date().nullable(),
	lastSyncedAt: z.date().nullable(),
	lastError: z.string().nullable(),
	refreshIntervalMinutes: z.number().int(),
});

export const metaBusinessAccountInput = z.object({
	businessAccountId: z.string().trim().regex(/^\d+$/).max(64),
});

export const metaTemplateSyncOutput = z.object({
	fetched: z.number().int(),
	approved: z.number().int(),
	created: z.number().int(),
	updated: z.number().int(),
	deactivated: z.number().int(),
	syncedAt: z.date(),
});

export const templateCreateInput = z.object({
	name: z.string().trim().min(1).max(120),
	channel: templateChannel,
	subject: z.string().trim().max(300).optional(),
	body: z.string().trim().min(1).max(50_000),
	providerTemplateName: z.string().trim().max(512).optional(),
	language: z.string().trim().min(2).max(20).default("en_US"),
});

export const templateUpdateInput = templateCreateInput.partial().extend({
	id: z.string(),
	active: z.boolean().optional(),
});

export const templateIdInput = z.object({ id: z.string() });

export type TemplateCreateInput = z.infer<typeof templateCreateInput>;
export type TemplateUpdateInput = z.infer<typeof templateUpdateInput>;
export type TemplateOutput = z.infer<typeof templateOutput>;
export type MetaTemplateSyncOutput = z.infer<typeof metaTemplateSyncOutput>;
