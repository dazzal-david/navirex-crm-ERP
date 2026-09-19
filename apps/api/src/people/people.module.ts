import { Module } from "@nestjs/common";
import { CommunicationsModule } from "../communications/communications.module";
import { TrpcModule } from "../trpc/trpc.module";
import { PeopleRouter } from "./people.router";
import { PeopleService } from "./people.service";

@Module({
	imports: [TrpcModule, CommunicationsModule],
	providers: [PeopleService, PeopleRouter],
})
export class PeopleModule {}
