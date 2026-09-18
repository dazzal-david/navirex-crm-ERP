import { Module } from "@nestjs/common";
import { TrpcModule } from "../trpc/trpc.module";
import { TemplatesRouter } from "./templates.router";
import { TemplatesService } from "./templates.service";

@Module({
	imports: [TrpcModule],
	providers: [TemplatesService, TemplatesRouter],
})
export class TemplatesModule {}
