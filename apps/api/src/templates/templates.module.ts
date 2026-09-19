import { Module } from "@nestjs/common";
import { TrpcModule } from "../trpc/trpc.module";
import { TemplateSyncController } from "./template-sync.controller";
import { TemplatesRouter } from "./templates.router";
import { TemplatesService } from "./templates.service";

@Module({
	imports: [TrpcModule],
	controllers: [TemplateSyncController],
	providers: [TemplatesService, TemplatesRouter],
})
export class TemplatesModule {}
