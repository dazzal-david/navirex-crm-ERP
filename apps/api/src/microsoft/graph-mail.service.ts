import {
	BadGatewayException,
	BadRequestException,
	Injectable,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { EnvironmentVariables } from "../config/env.validation";

type GraphMailConfig = {
	tenantId: string;
	clientId: string;
	clientSecret: string;
	sender: string;
};

type CachedToken = {
	value: string;
	expiresAt: number;
};

@Injectable()
export class GraphMailService {
	private readonly config: GraphMailConfig | null;
	private token: CachedToken | null = null;
	private tokenRequest: Promise<string> | null = null;

	constructor(config: ConfigService<EnvironmentVariables, true>) {
		const tenantId = config.get("MAIL_GRAPH_TENANT_ID", { infer: true });
		const clientId = config.get("MAIL_GRAPH_CLIENT_ID", { infer: true });
		const clientSecret = config.get("MAIL_GRAPH_CLIENT_SECRET", {
			infer: true,
		});
		const sender = config.get("MAIL_GRAPH_SENDER", { infer: true });

		this.config =
			tenantId && clientId && clientSecret && sender
				? { tenantId, clientId, clientSecret, sender: sender.toLowerCase() }
				: null;
	}

	get configured(): boolean {
		return this.config !== null;
	}

	get sender(): string | null {
		return this.config?.sender ?? null;
	}

	async send(to: string, subject: string, body: string): Promise<void> {
		const config = this.requiredConfig();
		const accessToken = await this.accessToken();
		const response = await fetch(
			`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(config.sender)}/sendMail`,
			{
				method: "POST",
				headers: {
					authorization: `Bearer ${accessToken}`,
					"content-type": "application/json",
				},
				body: JSON.stringify({
					message: {
						subject,
						body: { contentType: "Text", content: body },
						toRecipients: [{ emailAddress: { address: to } }],
					},
					saveToSentItems: true,
				}),
				signal: AbortSignal.timeout(20_000),
			},
		);

		if (!response.ok) {
			throw new BadGatewayException(
				await this.responseError(
					response,
					"Microsoft could not send the email",
				),
			);
		}
	}

	private requiredConfig(): GraphMailConfig {
		if (!this.config) {
			throw new BadRequestException(
				"Shared Microsoft email is not configured.",
			);
		}
		return this.config;
	}

	private async accessToken(): Promise<string> {
		const now = Date.now();
		if (this.token && this.token.expiresAt > now + 60_000) {
			return this.token.value;
		}
		if (this.tokenRequest) return this.tokenRequest;

		this.tokenRequest = this.requestToken().finally(() => {
			this.tokenRequest = null;
		});
		return this.tokenRequest;
	}

	private async requestToken(): Promise<string> {
		const config = this.requiredConfig();
		const form = new URLSearchParams({
			client_id: config.clientId,
			client_secret: config.clientSecret,
			grant_type: "client_credentials",
			scope: "https://graph.microsoft.com/.default",
		});
		const response = await fetch(
			`https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/token`,
			{
				method: "POST",
				headers: { "content-type": "application/x-www-form-urlencoded" },
				body: form,
				signal: AbortSignal.timeout(20_000),
			},
		);

		if (!response.ok) {
			throw new BadGatewayException(
				await this.responseError(response, "Microsoft authentication failed"),
			);
		}

		const result = (await response.json()) as {
			access_token?: string;
			expires_in?: number;
		};
		if (!result.access_token) {
			throw new BadGatewayException(
				"Microsoft authentication returned no access token.",
			);
		}

		this.token = {
			value: result.access_token,
			expiresAt: Date.now() + (result.expires_in ?? 3600) * 1000,
		};
		return result.access_token;
	}

	private async responseError(
		response: Response,
		fallback: string,
	): Promise<string> {
		try {
			const result = (await response.json()) as {
				error?: string | { message?: string };
				error_description?: string;
			};
			if (typeof result.error === "object" && result.error?.message) {
				return result.error.message;
			}
			return result.error_description ?? fallback;
		} catch {
			return `${fallback} (HTTP ${response.status}).`;
		}
	}
}
