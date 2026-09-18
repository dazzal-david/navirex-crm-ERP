import { Module } from "@nestjs/common";
import { MailboxModule } from "../mailbox/mailbox.module";
import { TrpcModule } from "../trpc/trpc.module";
import { GraphClient } from "./graph.client";
import { GraphMailService } from "./graph-mail.service";
import { MicrosoftRouter } from "./microsoft.router";
import { MicrosoftConnectionService } from "./microsoft-connection.service";
import { MicrosoftSyncService } from "./microsoft-sync.service";
import { OutlookSyncService } from "./outlook-sync.service";

@Module({
	imports: [TrpcModule, MailboxModule],
	providers: [
		GraphClient,
		GraphMailService,
		OutlookSyncService,
		MicrosoftSyncService,
		MicrosoftConnectionService,
		MicrosoftRouter,
	],
	exports: [GraphMailService, MicrosoftSyncService, MicrosoftConnectionService],
})
export class MicrosoftModule {}
