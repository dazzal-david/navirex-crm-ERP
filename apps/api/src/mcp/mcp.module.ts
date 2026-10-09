import { Module } from "@nestjs/common";
import { CommunicationsModule } from "../communications/communications.module";
import { DashboardModule } from "../dashboard/dashboard.module";
import { LeadsModule } from "../leads/leads.module";
import { TemplatesModule } from "../templates/templates.module";
import { McpController } from "./mcp.controller";

@Module({
	imports: [
		LeadsModule,
		CommunicationsModule,
		DashboardModule,
		TemplatesModule,
	],
	controllers: [McpController],
})
export class McpModule {}
