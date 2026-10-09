import { Module } from "@nestjs/common";
import { MicrosoftModule } from "../microsoft/microsoft.module";
import { TrpcModule } from "../trpc/trpc.module";
import { NotificationsRouter } from "./notifications.router";
import { NotificationsService } from "./notifications.service";

@Module({
	imports: [TrpcModule, MicrosoftModule],
	providers: [NotificationsService, NotificationsRouter],
	exports: [NotificationsService],
})
export class NotificationsModule {}
