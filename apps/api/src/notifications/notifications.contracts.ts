import { z } from "zod";

export const notificationItem = z.object({
	id: z.string(),
	kind: z.enum(["MENTION", "MESSAGE"]),
	title: z.string(),
	body: z.string(),
	actorName: z.string().nullable(),
	leadId: z.string().nullable(),
	companyId: z.string().nullable(),
	readAt: z.date().nullable(),
	createdAt: z.date(),
});

export const notificationsOutput = z.array(notificationItem);

export const unreadNotificationsOutput = z.object({ count: z.number().int() });

export const notificationIdInput = z.object({ id: z.string() });

export const markedOutput = z.object({ updated: z.number().int() });

export const mentionIds = z.array(z.string()).max(20).default([]);
