import { Module } from "@nestjs/common";
import { MicrosoftModule } from "../microsoft/microsoft.module";
import { TrpcModule } from "../trpc/trpc.module";
import { InvitationsController } from "./invitations.controller";
import { InvitationsRouter } from "./invitations.router";
import { InvitationsService } from "./invitations.service";

@Module({
	imports: [TrpcModule, MicrosoftModule],
	controllers: [InvitationsController],
	providers: [InvitationsService, InvitationsRouter],
})
export class InvitationsModule {}
