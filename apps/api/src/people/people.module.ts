import { Module } from "@nestjs/common";
import { TrpcModule } from "../trpc/trpc.module";
import { PeopleRouter } from "./people.router";
import { PeopleService } from "./people.service";

@Module({ imports: [TrpcModule], providers: [PeopleService, PeopleRouter] })
export class PeopleModule {}
