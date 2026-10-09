import { Module } from "@nestjs/common";
import { LeadsModule } from "../leads/leads.module";
import { MailboxModule } from "../mailbox/mailbox.module";
import { MicrosoftModule } from "../microsoft/microsoft.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { TrpcModule } from "../trpc/trpc.module";
import { CommunicationsController } from "./communications.controller";
import { CommunicationsRouter } from "./communications.router";
import { CommunicationsService } from "./communications.service";
import { WhatsAppMediaController } from "./whatsapp-media.controller";
import { WhatsAppWebhookController } from "./whatsapp-webhook.controller";
import { WhatsAppWebhookService } from "./whatsapp-webhook.service";

@Module({
	imports: [
		TrpcModule,
		MailboxModule,
		LeadsModule,
		MicrosoftModule,
		NotificationsModule,
	],
	controllers: [
		CommunicationsController,
		WhatsAppMediaController,
		WhatsAppWebhookController,
	],
	providers: [
		CommunicationsService,
		CommunicationsRouter,
		WhatsAppWebhookService,
	],
	exports: [CommunicationsService],
})
export class CommunicationsModule {}
