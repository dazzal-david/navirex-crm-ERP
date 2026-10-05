import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import { ActivityType, db } from "@crm/db";
import { CommunicationsService } from "../src/communications/communications.service";
import { WINDOW_CLOSED_MESSAGE } from "../src/communications/whatsapp-config";
import {
	whatsappMediaOf,
	whatsappMessage,
	whatsappMessageBody,
} from "../src/communications/whatsapp-webhook.contracts";

const suffix = crypto.randomUUID();
const userId = `wa-window-${suffix}`;
const HOUR_MS = 60 * 60 * 1000;
const realFetch = globalThis.fetch;

const settings = new Map([
	["WHATSAPP_ACCESS_TOKEN", "token"],
	["WHATSAPP_PHONE_NUMBER_ID", "phone-id"],
]);

const communications = new CommunicationsService(
	db,
	{} as never,
	{} as never,
	{ get: (key: string) => settings.get(key) } as never,
);

type Call = { url: string; init: RequestInit | undefined };

function stubMeta(respond: (call: Call) => Response): Call[] {
	const calls: Call[] = [];
	globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
		const call = { url: String(url), init };
		calls.push(call);
		return respond(call);
	}) as typeof fetch;
	return calls;
}

async function leadWithInbound(hoursAgo: number | null) {
	const lead = await db.lead.create({
		data: { name: `Window ${hoursAgo} ${suffix}`, phone: "+91 99999 00000" },
		select: { id: true },
	});
	if (hoursAgo !== null) {
		await db.activity.create({
			data: {
				type: ActivityType.NOTE,
				subject: "WhatsApp message",
				body: "Hello",
				leadId: lead.id,
				createdById: userId,
				occurredAt: new Date(Date.now() - hoursAgo * HOUR_MS),
				meta: { channel: "whatsapp", direction: "inbound" },
			},
		});
	}
	return lead.id;
}

beforeAll(async () => {
	await db.user.create({
		data: { id: userId, name: "Window Rep", email: `${userId}@example.test` },
	});
});

afterEach(() => {
	globalThis.fetch = realFetch;
});

afterAll(async () => {
	await db.activity.deleteMany({ where: { createdById: userId } });
	await db.messageTemplate.deleteMany({ where: { createdById: userId } });
	await db.lead.deleteMany({ where: { name: { endsWith: suffix } } });
	await db.user.delete({ where: { id: userId } });
});

describe("the WhatsApp 24-hour window", () => {
	it("is closed for a lead who never messaged", async () => {
		const leadId = await leadWithInbound(null);
		const window = await communications.whatsappWindow(leadId);

		expect(window.open).toBe(false);
		expect(window.closesAt).toBeNull();
	});

	it("opens for 24 hours after the lead's last message", async () => {
		const open = await communications.whatsappWindow(await leadWithInbound(2));
		const closed = await communications.whatsappWindow(
			await leadWithInbound(25),
		);

		expect(open.open).toBe(true);
		expect(closed.open).toBe(false);
	});

	it("refuses free text when the window is closed, without calling Meta", async () => {
		const calls = stubMeta(() => Response.json({}));
		const leadId = await leadWithInbound(30);

		await expect(
			communications.sendWhatsApp(
				{ leadId, mode: "text", body: "Hi", language: "en_US", variables: [] },
				userId,
			),
		).rejects.toThrow(WINDOW_CLOSED_MESSAGE);
		expect(calls).toHaveLength(0);
	});

	it("still sends a template when the window is closed", async () => {
		const calls = stubMeta(() =>
			Response.json({ messages: [{ id: "wamid.template" }] }),
		);
		const leadId = await leadWithInbound(null);

		const sent = await communications.sendWhatsApp(
			{
				leadId,
				mode: "template",
				templateName: "hello_world",
				language: "en_US",
				variables: [],
			},
			userId,
		);

		expect(sent.messageId).toBe("wamid.template");
		expect(calls).toHaveLength(1);
	});

	it("turns Meta's re-engagement error into the templates-only message", async () => {
		stubMeta(() =>
			Response.json(
				{ error: { code: 131047, message: "Re-engagement message" } },
				{ status: 400 },
			),
		);
		const leadId = await leadWithInbound(1);

		await expect(
			communications.sendWhatsApp(
				{ leadId, mode: "text", body: "Hi", language: "en_US", variables: [] },
				userId,
			),
		).rejects.toThrow(WINDOW_CLOSED_MESSAGE);
	});
});

describe("WhatsApp templates with a header and buttons", () => {
	it("fills every blank from Meta's examples unless the rep typed a value", async () => {
		const name = `promo_${suffix.slice(0, 8)}`;
		await db.messageTemplate.create({
			data: {
				name: `Meta · ${name}`,
				channel: "WHATSAPP",
				body: "Hello {{1}}, your code is {{2}}",
				providerTemplateName: name,
				providerTemplateId: `tpl-${suffix}`,
				language: "en_US",
				createdById: userId,
			},
		});
		const calls = stubMeta((call) =>
			call.url.includes(`tpl-${suffix}`)
				? Response.json({
						components: [
							{
								type: "HEADER",
								format: "IMAGE",
								example: { header_handle: ["https://example.test/fresh.jpg"] },
							},
							{
								type: "BODY",
								text: "Hello {{1}}, your code is {{2}}",
								example: { body_text: [["Asha", "SUN50"]] },
							},
							{
								type: "BUTTONS",
								buttons: [
									{ type: "QUICK_REPLY", text: "Call me" },
									{
										type: "URL",
										text: "Open offer",
										url: "https://navirex.in/offer/{{1}}",
										example: ["https://navirex.in/offer/abc123"],
									},
								],
							},
						],
					})
				: Response.json({ messages: [{ id: "wamid.promo" }] }),
		);
		const leadId = await leadWithInbound(null);

		await communications.sendWhatsApp(
			{
				leadId,
				mode: "template",
				templateName: name,
				language: "en_US",
				variables: [],
				fields: { "body:1": "Ravi" },
			},
			userId,
		);

		const sent = JSON.parse(String(calls.at(-1)?.init?.body));
		expect(sent.template.components).toEqual([
			{
				type: "header",
				parameters: [
					{ type: "image", image: { link: "https://example.test/fresh.jpg" } },
				],
			},
			{
				type: "body",
				parameters: [
					{ type: "text", text: "Ravi" },
					{ type: "text", text: "SUN50" },
				],
			},
			{
				type: "button",
				sub_type: "url",
				index: "1",
				parameters: [{ type: "text", text: "abc123" }],
			},
		]);
	});
});

describe("WhatsApp files", () => {
	it("uploads a file to Meta, then sends it by id and logs it", async () => {
		const calls = stubMeta((call) =>
			call.url.endsWith("/media")
				? Response.json({ id: "media-1" })
				: Response.json({ messages: [{ id: "wamid.image" }] }),
		);
		const leadId = await leadWithInbound(1);

		await communications.sendWhatsAppMedia(
			{
				leadId,
				bytes: Buffer.from("png-bytes"),
				mimeType: "image/png",
				filename: "site.png",
				caption: "Roof photo",
			},
			userId,
		);

		const sent = JSON.parse(String(calls[1]?.init?.body));
		const conversation = await communications.conversation(leadId);
		const logged = conversation.items.find((item) => item.attachment);

		expect(sent).toMatchObject({
			type: "image",
			image: { id: "media-1", caption: "Roof photo" },
		});
		expect(logged?.body).toBe("Roof photo");
		expect(logged?.attachment).toMatchObject({ kind: "image", voice: false });
	});

	it("refuses a file type WhatsApp cannot carry", async () => {
		stubMeta(() => Response.json({}));
		const leadId = await leadWithInbound(1);

		await expect(
			communications.sendWhatsAppMedia(
				{
					leadId,
					bytes: Buffer.from("zip"),
					mimeType: "application/zip",
					filename: "files.zip",
				},
				userId,
			),
		).rejects.toThrow("WhatsApp cannot send this file type");
	});

	it("reads the media id and voice flag from an inbound message", () => {
		const message = whatsappMessage.parse({
			from: "919999999999",
			id: "wamid.voice",
			type: "audio",
			audio: {
				id: "media-9",
				mime_type: "audio/ogg; codecs=opus",
				voice: true,
			},
		});

		expect(whatsappMediaOf(message)).toEqual({
			mediaId: "media-9",
			mediaKind: "audio",
			mimeType: "audio/ogg; codecs=opus",
			filename: null,
			voice: true,
		});
		expect(whatsappMessageBody(message)).toBe("[Voice message]");
	});
});
