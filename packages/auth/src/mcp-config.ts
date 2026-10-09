const MINUTE_S = 60;
const DAY_S = 24 * 60 * MINUTE_S;

export const MCP = {
	accessTokenSeconds: 60 * MINUTE_S,
	refreshTokenSeconds: 30 * DAY_S,
	allowedRedirectHosts: ["claude.ai", "claude.com"],
	authorizePath: "/oauth/authorize",
	approvePath: "/oauth/authorize/approve",
	endpointPath: "/api/mcp",
	appOriginHeader: "x-navirex-app-origin",
} as const;

export function isAllowedMcpRedirect(value: string | undefined): boolean {
	if (!value) return false;
	try {
		const url = new URL(value);
		return (
			url.protocol === "https:" &&
			MCP.allowedRedirectHosts.some(
				(host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
			)
		);
	} catch {
		return false;
	}
}
