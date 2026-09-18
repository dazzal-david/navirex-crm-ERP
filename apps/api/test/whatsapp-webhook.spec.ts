import { describe, expect, it } from "bun:test";
import { createHmac } from "node:crypto";
import { Readable } from "node:stream";
import {
	whatsappMessageBody,
	whatsappTimestamp,
	whatsappWebhookPayload,
} from "../src/communications/whatsapp-webhook.contracts";
import { readWebhookBody } from "../src/communications/whatsapp-webhook.controller";
import { WhatsAppWebhookService } from "../src/communications/whatsapp-webhook.service";

const VERIFY_TOKEN = "verify-token-long-enough";
const APP_SECRET = "meta-app-secret";

function service() {
	const values = new Map([
		["WHATSAPP_APP_SECRET", APP_SECRET],
		["WHATSAPP_WEBHOOK_VERIFY_TOKEN", VERIFY_TOKEN],
	]);
	return new WhatsAppWebhookService(
		{} as never,
		{} as never,
		{
			get: (key: string) => values.get(key),
		} as never,
	);
}

describe("WhatsApp webhook verification", () => {
	it("reads Vercel's parsed JSON body after the request stream is consumed", async () => {
		const request = Readable.from([]) as Readable & { body?: unknown };
		request.body = { object: "whatsapp_business_account", entry: [] };

		expect(await readWebhookBody(request as never, 1_000_000)).toBe(
			'{"object":"whatsapp_business_account","entry":[]}',
		);
	});

	it("returns Meta's challenge only for the configured token", () => {
		expect(service().verify("subscribe", "challenge-123", VERIFY_TOKEN)).toBe(
			"challenge-123",
		);
		expect(() =>
			service().verify("subscribe", "challenge-123", "wrong"),
		).toThrow("WhatsApp webhook verification failed.");
	});

	it("accepts a body signed by the Meta app secret", () => {
		const raw = '{"object":"whatsapp_business_account","entry":[]}';
		const signature = `sha256=${createHmac("sha256", APP_SECRET).update(raw).digest("hex")}`;
		expect(() => service().verifySignature(raw, signature)).not.toThrow();
		expect(() => service().verifySignature(`${raw} `, signature)).toThrow(
			"WhatsApp webhook signature is invalid.",
		);
	});
});

describe("WhatsApp webhook payloads", () => {
	it("reads inbound text and contact identity", () => {
		const payload = whatsappWebhookPayload.parse({
			object: "whatsapp_business_account",
			entry: [
				{
					id: "waba-1",
					changes: [
						{
							field: "messages",
							value: {
								contacts: [
									{ profile: { name: "Asha" }, wa_id: "919999999999" },
								],
								messages: [
									{
										from: "919999999999",
										id: "wamid.1",
										timestamp: "1700000000",
										type: "text",
										text: { body: "Tell me about Navitrace" },
									},
								],
							},
						},
					],
				},
			],
		});
		const value = payload.entry[0]?.changes[0]?.value;
		const message = value?.messages?.[0];
		expect(value?.contacts?.[0]?.profile?.name).toBe("Asha");
		expect(message).toBeDefined();
		if (!message) throw new Error("Expected a parsed message.");
		expect(whatsappMessageBody(message)).toBe("Tell me about Navitrace");
		expect(whatsappTimestamp(message.timestamp).toISOString()).toBe(
			"2023-11-14T22:13:20.000Z",
		);
	});

	it("keeps non-text messages readable in the conversation", () => {
		expect(
			whatsappMessageBody({
				id: "wamid.image",
				type: "image",
				image: { caption: "Site photo" },
			}),
		).toBe("Site photo");
		expect(whatsappMessageBody({ id: "wamid.audio", type: "audio" })).toBe(
			"[Audio message]",
		);
	});
});
