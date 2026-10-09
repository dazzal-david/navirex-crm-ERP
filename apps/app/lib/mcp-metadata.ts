import { MCP } from "@crm/auth/mcp-config";

const SCOPES = ["openid", "profile", "email", "offline_access"];

const CORS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, OPTIONS",
	"Access-Control-Allow-Headers":
		"Content-Type, Authorization, MCP-Protocol-Version",
	"Cache-Control": "no-store",
};

export function authorizationServerMetadata(request: Request): Response {
	const origin = new URL(request.url).origin;
	return Response.json(
		{
			issuer: origin,
			authorization_endpoint: `${origin}${MCP.authorizePath}`,
			token_endpoint: `${origin}/api/auth/mcp/token`,
			registration_endpoint: `${origin}/api/auth/mcp/register`,
			scopes_supported: SCOPES,
			response_types_supported: ["code"],
			response_modes_supported: ["query"],
			grant_types_supported: ["authorization_code", "refresh_token"],
			code_challenge_methods_supported: ["S256"],
			token_endpoint_auth_methods_supported: [
				"none",
				"client_secret_basic",
				"client_secret_post",
			],
		},
		{ headers: CORS },
	);
}

export function protectedResourceMetadata(request: Request): Response {
	const origin = new URL(request.url).origin;
	return Response.json(
		{
			resource: `${origin}${MCP.endpointPath}`,
			authorization_servers: [origin],
			scopes_supported: SCOPES,
			bearer_methods_supported: ["header"],
			resource_name: "Navirex CRM",
		},
		{ headers: CORS },
	);
}

export function preflight(): Response {
	return new Response(null, { status: 204, headers: CORS });
}
