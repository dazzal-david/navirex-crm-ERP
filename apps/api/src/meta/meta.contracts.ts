import { z } from "zod";

export const metaPageOutput = z.object({
	id: z.string(),
	name: z.string(),
	connected: z.boolean(),
	subscribedAt: z.string().nullable(),
	lastSyncedAt: z.string().nullable(),
	lastError: z.string().nullable(),
});

export const metaStatusOutput = z.object({
	configured: z.boolean(),
	linked: z.boolean(),
	webhookConfigured: z.boolean(),
	webhookUrl: z.string(),
	pages: z.array(metaPageOutput),
});

export const metaAvailablePagesOutput = z.array(metaPageOutput);
export const metaPageInput = z.object({ pageId: z.string().min(1).max(100) });
export const metaMutationOutput = z.object({ success: z.boolean() });
export const metaSyncOutput = z.object({
	pages: z.number(),
	created: z.number(),
	matched: z.number(),
	failed: z.number(),
});

export type MetaPage = z.infer<typeof metaPageOutput>;
