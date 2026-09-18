import { Inject } from "@nestjs/common";
import {
	Ctx,
	Input,
	Mutation,
	Query,
	Router,
	UseMiddlewares,
} from "nestjs-trpc";
import type { z } from "zod";
import type { AuthedTrpcContext } from "../trpc/context.types";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { restMeta } from "../trpc/openapi";
import {
	metaAvailablePagesOutput,
	metaMutationOutput,
	metaPageInput,
	metaStatusOutput,
	metaSyncOutput,
} from "./meta.contracts";
import { MetaService } from "./meta.service";

@Router({ alias: "meta" })
@UseMiddlewares(AuthMiddleware)
export class MetaRouter {
	constructor(@Inject(MetaService) private readonly meta: MetaService) {}

	@Query({
		output: metaStatusOutput,
		meta: restMeta("GET", "/meta/status", ["Meta"]),
	})
	status(@Ctx() ctx: AuthedTrpcContext) {
		return this.meta.status(ctx.user.id);
	}

	@Query({
		output: metaAvailablePagesOutput,
		meta: restMeta("GET", "/meta/pages", ["Meta"]),
	})
	pages(@Ctx() ctx: AuthedTrpcContext) {
		return this.meta.availablePages(ctx.user.id);
	}

	@Mutation({
		input: metaPageInput,
		output: metaMutationOutput,
		meta: restMeta("POST", "/meta/pages/{pageId}", ["Meta"]),
	})
	connect(
		@Input() input: z.infer<typeof metaPageInput>,
		@Ctx() ctx: AuthedTrpcContext,
	) {
		return this.meta.connectPage(ctx.user.id, input.pageId);
	}

	@Mutation({
		input: metaPageInput,
		output: metaMutationOutput,
		meta: restMeta("DELETE", "/meta/pages/{pageId}", ["Meta"]),
	})
	disconnect(@Input() input: z.infer<typeof metaPageInput>) {
		return this.meta.disconnectPage(input.pageId);
	}

	@Mutation({
		output: metaSyncOutput,
		meta: restMeta("POST", "/meta/sync", ["Meta"]),
	})
	sync(@Ctx() ctx: AuthedTrpcContext) {
		return this.meta.sync(ctx.user.id);
	}
}
