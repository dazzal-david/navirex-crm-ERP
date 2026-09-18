import { Module } from "@nestjs/common";
import { MailboxModule } from "../mailbox/mailbox.module";
import { TrpcModule } from "../trpc/trpc.module";
import { CommunicationsController } from "./communications.controller";
import { CommunicationsRouter } from "./communications.router";
import { CommunicationsService } from "./communications.service";

@Module({
	imports: [TrpcModule, MailboxModule],
	controllers: [CommunicationsController],
	providers: [CommunicationsService, CommunicationsRouter],
})
export class CommunicationsModule {}
