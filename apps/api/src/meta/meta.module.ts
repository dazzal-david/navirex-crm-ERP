import { Module } from "@nestjs/common";
import { LeadsModule } from "../leads/leads.module";
import { TrpcModule } from "../trpc/trpc.module";
import { MetaWebhookController } from "./meta.controller";
import { MetaRouter } from "./meta.router";
import { MetaService } from "./meta.service";

@Module({
	imports: [TrpcModule, LeadsModule],
	controllers: [MetaWebhookController],
	providers: [MetaService, MetaRouter],
})
export class MetaModule {}
