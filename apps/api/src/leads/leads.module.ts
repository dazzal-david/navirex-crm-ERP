import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { TrpcModule } from "../trpc/trpc.module";
import { LeadContactsService } from "./lead-contacts.service";
import { LeadsRouter } from "./leads.router";
import { LeadsService } from "./leads.service";

@Module({
	imports: [TrpcModule, AgentModule, NotificationsModule],
	providers: [LeadsService, LeadContactsService, LeadsRouter],
	exports: [LeadsService, LeadContactsService],
})
export class LeadsModule {}
