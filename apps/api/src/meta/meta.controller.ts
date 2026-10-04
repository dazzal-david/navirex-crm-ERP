import type { IncomingMessage } from "node:http";
import {
	BadRequestException,
	Controller,
	Get,
	Headers,
	HttpCode,
	Post,
	Query,
	Req,
} from "@nestjs/common";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import { readWebhookBody } from "../communications/whatsapp-webhook.controller";
import { type MetaWebhookPayload, metaWebhookPayload } from "./meta.contracts";
import { MetaService } from "./meta.service";

@Controller("api/integrations/meta/webhook")
export class MetaWebhookController {
	constructor(private readonly meta: MetaService) {}

	@Get()
	@AllowAnonymous()
	verify(
		@Query("hub.challenge") challenge?: string,
		@Query("hub.verify_token") token?: string,
	) {
		return this.meta.verify(challenge, token);
	}

	@Post()
	@AllowAnonymous()
	@HttpCode(200)
	async receive(
		@Req() request: IncomingMessage,
		@Headers("x-hub-signature-256") signature?: string,
	) {
		const raw = await readWebhookBody(request, 1_000_000);
		if (!raw) throw new BadRequestException("Webhook body is empty.");
		this.meta.verifySignature(raw, signature);
		let payload: MetaWebhookPayload;
		try {
			payload = metaWebhookPayload.parse(JSON.parse(raw));
		} catch {
			throw new BadRequestException("Webhook body is invalid.");
		}
		await this.meta.webhook(payload);
		return { received: true };
	}
}
