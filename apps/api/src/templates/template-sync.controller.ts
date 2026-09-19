import {
	Controller,
	ForbiddenException,
	Get,
	Headers,
	ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import type { EnvironmentVariables } from "../config/env.validation";
import { TemplatesService } from "./templates.service";

@Controller("internal/sync")
export class TemplateSyncController {
	private readonly secret: string | undefined;

	constructor(
		private readonly templates: TemplatesService,
		config: ConfigService<EnvironmentVariables, true>,
	) {
		this.secret = config.get("CRON_SECRET", { infer: true });
	}

	@Get("meta-templates")
	@AllowAnonymous()
	async sync(@Headers("authorization") authorization?: string) {
		if (!this.secret) {
			throw new ServiceUnavailableException("Template sync is not configured.");
		}
		if (!timingSafeEquals(authorization ?? "", `Bearer ${this.secret}`)) {
			throw new ForbiddenException();
		}
		return this.templates.syncMetaSystem();
	}
}

function timingSafeEquals(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let mismatch = 0;
	for (let index = 0; index < a.length; index += 1) {
		mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
	}
	return mismatch === 0;
}
