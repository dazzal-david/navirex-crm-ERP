import { isAllowedMcpRedirect } from "@crm/auth/mcp-config";
import { db } from "@crm/db";
import { z } from "zod";

export const MCP_AUTHORIZE_PARAMS = [
	"client_id",
	"redirect_uri",
	"response_type",
	"state",
	"scope",
	"code_challenge",
	"code_challenge_method",
	"resource",
	"prompt",
	"nonce",
] as const;

const authorizeRequest = z.object({
	client_id: z.string().min(1),
	redirect_uri: z.string().min(1),
	response_type: z.literal("code"),
	code_challenge: z.string().min(1),
	code_challenge_method: z.string().min(1),
	state: z.string().optional(),
	scope: z.string().optional(),
	resource: z.string().optional(),
	prompt: z.string().optional(),
	nonce: z.string().optional(),
});

export type McpAuthorizeRequest = z.infer<typeof authorizeRequest>;

export type McpAuthorizeCheck =
	| { ok: true; request: McpAuthorizeRequest; clientName: string }
	| { ok: false; reason: string };

export function authorizeQuery(request: McpAuthorizeRequest): URLSearchParams {
	const query = new URLSearchParams();
	for (const key of MCP_AUTHORIZE_PARAMS) {
		const value = request[key];
		if (value) query.set(key, value);
	}
	return query;
}

export async function checkMcpAuthorize(
	values: Record<string, string | string[] | undefined>,
): Promise<McpAuthorizeCheck> {
	const flat = Object.fromEntries(
		Object.entries(values).map(([key, value]) => [
			key,
			Array.isArray(value) ? value[0] : value,
		]),
	);
	const parsed = authorizeRequest.safeParse(flat);
	if (!parsed.success) {
		return { ok: false, reason: "The connection request is incomplete." };
	}
	const request = parsed.data;
	if (!isAllowedMcpRedirect(request.redirect_uri)) {
		return {
			ok: false,
			reason: "Only Claude (claude.ai) can connect to this CRM.",
		};
	}
	const client = await db.oauthApplication.findUnique({
		where: { clientId: request.client_id },
		select: { name: true, redirectUrls: true, disabled: true },
	});
	if (
		!client ||
		client.disabled ||
		!client.redirectUrls.split(",").includes(request.redirect_uri)
	) {
		return { ok: false, reason: "This connection request is not recognised." };
	}
	return { ok: true, request, clientName: client.name };
}
