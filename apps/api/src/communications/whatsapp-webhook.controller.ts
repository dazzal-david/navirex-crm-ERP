import type { IncomingMessage } from "node:http";
import {
	BadRequestException,
	Controller,
	Get,
	Headers,
	HttpCode,
	Logger,
	Post,
	Query,
	Req,
} from "@nestjs/common";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import { whatsappWebhookPayload } from "./whatsapp-webhook.contracts";
import { WhatsAppWebhookService } from "./whatsapp-webhook.service";

@Controller("api/integrations/whatsapp/webhook")
export class WhatsAppWebhookController {
	private readonly logger = new Logger(WhatsAppWebhookController.name);

	constructor(private readonly whatsapp: WhatsAppWebhookService) {}

	@Get()
	@AllowAnonymous()
	verify(
		@Query("hub.mode") mode?: string,
		@Query("hub.challenge") challenge?: string,
		@Query("hub.verify_token") token?: string,
	) {
		return this.whatsapp.verify(mode, challenge, token);
	}

	@Post()
	@AllowAnonymous()
	@HttpCode(200)
	async receive(
		@Req() request: IncomingMessage,
		@Headers("x-hub-signature-256") signature?: string,
	) {
		const raw = await read(request, 1_000_000);
		if (!raw) throw new BadRequestException("Webhook body is empty.");
		this.whatsapp.verifySignature(raw, signature);
		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch {
			throw new BadRequestException("WhatsApp webhook body is invalid JSON.");
		}
		const payload = whatsappWebhookPayload.safeParse(parsed);
		if (!payload.success) {
			this.logger.warn(
				`Rejected WhatsApp webhook payload at ${payload.error.issues[0]?.path.join(".") || "root"}.`,
			);
			throw new BadRequestException("WhatsApp webhook body is invalid.");
		}
		await this.whatsapp.receive(payload.data);
		return { received: true };
	}
}

async function read(
	request: IncomingMessage,
	limit: number,
): Promise<string | null> {
	let body = "";
	for await (const chunk of request) {
		body += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
		if (Buffer.byteLength(body) > limit) return null;
	}
	return body || null;
}
