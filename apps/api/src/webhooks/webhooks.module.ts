import { Module } from "@nestjs/common";
import { LeadsModule } from "../leads/leads.module";
import { TrpcModule } from "../trpc/trpc.module";
import { WebhooksController } from "./webhooks.controller";
import { WebhooksRouter } from "./webhooks.router";
import { WebhooksService } from "./webhooks.service";

@Module({
	imports: [TrpcModule, LeadsModule],
	controllers: [WebhooksController],
	providers: [WebhooksService, WebhooksRouter],
})
export class WebhooksModule {}
