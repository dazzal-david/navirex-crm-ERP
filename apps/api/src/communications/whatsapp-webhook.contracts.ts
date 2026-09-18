import { z } from "zod";

const whatsappContact = z.object({
	profile: z.object({ name: z.string().optional() }).optional(),
	wa_id: z.string().optional(),
});

export const whatsappMessage = z
	.object({
		from: z.string().optional(),
		id: z.string().min(1),
		timestamp: z.string().optional(),
		type: z.string().min(1),
		text: z.object({ body: z.string() }).optional(),
		button: z.object({ text: z.string().optional() }).optional(),
		interactive: z
			.object({
				button_reply: z
					.object({ id: z.string().optional(), title: z.string().optional() })
					.optional(),
				list_reply: z
					.object({
						id: z.string().optional(),
						title: z.string().optional(),
						description: z.string().optional(),
					})
					.optional(),
			})
			.optional(),
		image: z.object({ caption: z.string().optional() }).optional(),
		video: z.object({ caption: z.string().optional() }).optional(),
		document: z
			.object({
				caption: z.string().optional(),
				filename: z.string().optional(),
			})
			.optional(),
		location: z
			.object({
				address: z.string().optional(),
				latitude: z.number().optional(),
				longitude: z.number().optional(),
				name: z.string().optional(),
			})
			.optional(),
		reaction: z.object({ emoji: z.string().optional() }).optional(),
	})
	.passthrough();

const whatsappStatus = z
	.object({
		id: z.string().min(1),
		recipient_id: z.string().optional(),
		status: z.enum(["sent", "delivered", "read", "failed", "deleted"]),
		timestamp: z.string().optional(),
		errors: z
			.array(
				z.object({
					code: z.number().optional(),
					title: z.string().optional(),
					message: z.string().optional(),
				}),
			)
			.optional(),
	})
	.passthrough();

const whatsappValue = z
	.object({
		contacts: z.array(whatsappContact).optional(),
		messages: z.array(whatsappMessage).optional(),
		metadata: z
			.object({
				display_phone_number: z.string().optional(),
				phone_number_id: z.string().optional(),
			})
			.optional(),
		statuses: z.array(whatsappStatus).optional(),
	})
	.passthrough();

export const whatsappWebhookPayload = z.object({
	object: z.literal("whatsapp_business_account"),
	entry: z
		.array(
			z.object({
				id: z.string().optional(),
				changes: z.array(
					z.object({
						field: z.literal("messages"),
						value: whatsappValue,
					}),
				),
			}),
		)
		.default([]),
});

export type WhatsAppMessage = z.infer<typeof whatsappMessage>;
export type WhatsAppWebhookPayload = z.infer<typeof whatsappWebhookPayload>;

export function whatsappMessageBody(message: WhatsAppMessage): string {
	if (message.text?.body) return message.text.body;
	if (message.button?.text) return message.button.text;
	if (message.interactive?.button_reply?.title)
		return message.interactive.button_reply.title;
	if (message.interactive?.list_reply?.title)
		return [
			message.interactive.list_reply.title,
			message.interactive.list_reply.description,
		]
			.filter(Boolean)
			.join(" — ");
	if (message.image) return message.image.caption || "[Image]";
	if (message.video) return message.video.caption || "[Video]";
	if (message.document)
		return (
			message.document.caption ||
			(message.document.filename
				? `[Document: ${message.document.filename}]`
				: "[Document]")
		);
	if (message.location) {
		const label = message.location.name || message.location.address;
		if (label) return `[Location: ${label}]`;
		if (
			message.location.latitude !== undefined &&
			message.location.longitude !== undefined
		)
			return `[Location: ${message.location.latitude}, ${message.location.longitude}]`;
	}
	if (message.reaction?.emoji) return `[Reaction: ${message.reaction.emoji}]`;
	const labels = new Map([
		["audio", "Audio message"],
		["contacts", "Contact card"],
		["sticker", "Sticker"],
	]);
	return `[${labels.get(message.type) ?? `WhatsApp ${message.type} message`}]`;
}

export function whatsappTimestamp(value: string | undefined): Date {
	const seconds = Number(value);
	return Number.isFinite(seconds) && seconds > 0
		? new Date(seconds * 1000)
		: new Date();
}
