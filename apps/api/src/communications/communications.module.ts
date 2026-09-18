import { Module } from "@nestjs/common";
import { LeadsModule } from "../leads/leads.module";
import { MailboxModule } from "../mailbox/mailbox.module";
import { TrpcModule } from "../trpc/trpc.module";
import { CommunicationsController } from "./communications.controller";
import { CommunicationsRouter } from "./communications.router";
import { CommunicationsService } from "./communications.service";
import { WhatsAppWebhookController } from "./whatsapp-webhook.controller";
import { WhatsAppWebhookService } from "./whatsapp-webhook.service";

@Module({
	imports: [TrpcModule, MailboxModule, LeadsModule],
	controllers: [CommunicationsController, WhatsAppWebhookController],
	providers: [
		CommunicationsService,
		CommunicationsRouter,
		WhatsAppWebhookService,
	],
})
export class CommunicationsModule {}
