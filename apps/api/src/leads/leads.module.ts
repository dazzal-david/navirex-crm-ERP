import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module";
import { TrpcModule } from "../trpc/trpc.module";
import { LeadsRouter } from "./leads.router";
import { LeadsService } from "./leads.service";

@Module({
	imports: [TrpcModule, AgentModule],
	providers: [LeadsService, LeadsRouter],
	exports: [LeadsService],
})
export class LeadsModule {}
