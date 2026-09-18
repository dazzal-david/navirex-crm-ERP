import {
	Body,
	Controller,
	Headers,
	HttpCode,
	Param,
	Post,
} from "@nestjs/common";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import { inboundLeadPayload } from "./webhooks.contracts";
import { WebhooksService } from "./webhooks.service";

@Controller("api/integrations/lead-webhooks")
export class WebhooksController {
	constructor(private readonly webhooks: WebhooksService) {}

	@Post(":id")
	@AllowAnonymous()
	@HttpCode(200)
	receive(
		@Param("id") id: string,
		@Headers("x-webhook-secret") secret: string | undefined,
		@Body() body: unknown,
	) {
		return this.webhooks.receive(id, secret, inboundLeadPayload.parse(body));
	}
}
