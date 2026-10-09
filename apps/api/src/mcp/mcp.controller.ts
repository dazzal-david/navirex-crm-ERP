import { appUrl, auth, workspaceRoleOf } from "@crm/auth";
import { MCP } from "@crm/auth/mcp-config";
import type { Db } from "@crm/db";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
	Controller,
	Delete,
	Get,
	Logger,
	Post,
	Req,
	Res,
} from "@nestjs/common";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import { fromNodeHeaders } from "better-auth/node";
import type { Request, Response } from "express";
import { z } from "zod";
import { CommunicationsService } from "../communications/communications.service";
import { DashboardService } from "../dashboard/dashboard.service";
import { InjectDatabase } from "../database/database.constants";
import { LeadContactsService } from "../leads/lead-contacts.service";
import { LeadsService } from "../leads/leads.service";
import { TemplatesService } from "../templates/templates.service";
import { buildMcpServer } from "./mcp-tools";

const tokenOwner = z
	.object({ userId: z.string().min(1) })
	.nullable()
	.catch(null);

function resourceMetadataUrl(req: Request): string {
	const forwarded = req.header(MCP.appOriginHeader);
	const origin =
		forwarded && URL.canParse(forwarded) ? new URL(forwarded).origin : appUrl;
	return `${origin}/.well-known/oauth-protected-resource${MCP.endpointPath}`;
}

function rpcError(res: Response, status: number, message: string) {
	res
		.status(status)
		.json({ jsonrpc: "2.0", error: { code: -32000, message }, id: null });
}

@Controller("api/mcp")
export class McpController {
	private readonly logger = new Logger(McpController.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly leads: LeadsService,
		private readonly contacts: LeadContactsService,
		private readonly communications: CommunicationsService,
		private readonly dashboard: DashboardService,
		private readonly templates: TemplatesService,
	) {}

	@Post()
	@AllowAnonymous()
	async handle(@Req() req: Request, @Res() res: Response) {
		const token = tokenOwner.parse(
			await auth.api.getMcpSession({ headers: fromNodeHeaders(req.headers) }),
		);
		if (!token) {
			res.setHeader(
				"WWW-Authenticate",
				`Bearer resource_metadata="${resourceMetadataUrl(req)}"`,
			);
			res.setHeader("Access-Control-Expose-Headers", "WWW-Authenticate");
			rpcError(res, 401, "Sign in to Navirex CRM to use this connector.");
			return;
		}

		if (!(await workspaceRoleOf(token.userId, this.db))) {
			rpcError(res, 403, "This account is no longer a member of the CRM.");
			return;
		}

		const server = buildMcpServer(token.userId, {
			leads: this.leads,
			contacts: this.contacts,
			communications: this.communications,
			dashboard: this.dashboard,
			templates: this.templates,
		});
		const transport = new StreamableHTTPServerTransport({
			sessionIdGenerator: undefined,
			enableJsonResponse: true,
		});
		res.on("close", () => {
			void transport.close();
			void server.close();
		});

		try {
			await server.connect(transport);
			await transport.handleRequest(req, res, req.body);
		} catch (error) {
			this.logger.error({
				message: "MCP request failed",
				error: error instanceof Error ? error.message : String(error),
			});
			if (!res.headersSent) rpcError(res, 500, "The CRM could not answer.");
		}
	}

	@Get()
	@AllowAnonymous()
	stream(@Res() res: Response) {
		res.setHeader("Allow", "POST");
		rpcError(res, 405, "This server answers over POST only.");
	}

	@Delete()
	@AllowAnonymous()
	end(@Res() res: Response) {
		res.setHeader("Allow", "POST");
		rpcError(res, 405, "This server keeps no sessions.");
	}
}
