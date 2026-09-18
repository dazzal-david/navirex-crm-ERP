import { timingSafeEqual } from "node:crypto";
import {
	Body,
	Controller,
	Headers,
	HttpCode,
	Post,
	UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import type { EnvironmentVariables } from "../config/env.validation";
import { pinnedTemplateInput } from "./communications.contracts";
import { CommunicationsService } from "./communications.service";

@Controller("internal/communications")
export class CommunicationsController {
	private readonly secret?: string;

	constructor(
		private readonly communications: CommunicationsService,
		config: ConfigService<EnvironmentVariables, true>,
	) {
		this.secret = config.get("AGENT_BRIDGE_SECRET", { infer: true });
	}

	@Post("agent")
	@AllowAnonymous()
	@HttpCode(200)
	send(
		@Headers("authorization") authorization: string | undefined,
		@Body() body: unknown,
	) {
		if (!authorised(authorization, this.secret)) {
			throw new UnauthorizedException("Agent authentication failed.");
		}
		const input = pinnedTemplateInput.parse(body);
		return this.communications.sendPinnedTemplate(input, input.userId);
	}
}

function authorised(
	header: string | undefined,
	secret: string | undefined,
): boolean {
	if (!secret || !header?.startsWith("Bearer ")) return false;
	const actual = Buffer.from(header.slice("Bearer ".length));
	const expected = Buffer.from(secret);
	return actual.length === expected.length && timingSafeEqual(actual, expected);
}
