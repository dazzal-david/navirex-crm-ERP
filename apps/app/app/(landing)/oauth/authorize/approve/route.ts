import { auth } from "@crm/auth";
import { NextResponse } from "next/server";
import { authorizeQuery, checkMcpAuthorize } from "@/lib/mcp-authorize";

function refuse(message: string, status: number): Response {
	return new Response(message, {
		status,
		headers: { "content-type": "text/plain; charset=utf-8" },
	});
}

export async function POST(request: Request): Promise<Response> {
	const origin = new URL(request.url).origin;
	if (request.headers.get("origin") !== origin) {
		return refuse("Approve the connection from the Navirex CRM page.", 403);
	}

	const values = Object.fromEntries(new URLSearchParams(await request.text()));
	const check = await checkMcpAuthorize(values);
	if (!check.ok) return refuse(check.reason, 400);

	const session = await auth.api.getSession({ headers: request.headers });
	if (!session) {
		const next = `/oauth/authorize?${authorizeQuery(check.request).toString()}`;
		return NextResponse.redirect(
			new URL(`/sign-in?next=${encodeURIComponent(next)}`, origin),
			303,
		);
	}

	const query = authorizeQuery(check.request);
	const response = await auth.api.mcpOAuthAuthorize({
		query: Object.fromEntries(query),
		headers: request.headers,
		request: new Request(new URL(`/api/auth/mcp/authorize?${query}`, origin), {
			headers: request.headers,
		}),
		asResponse: true,
	});
	const location = response.headers.get("location");
	if (!location || !location.startsWith(check.request.redirect_uri)) {
		return refuse("The CRM could not finish connecting Claude.", 500);
	}
	return NextResponse.redirect(location, 303);
}
