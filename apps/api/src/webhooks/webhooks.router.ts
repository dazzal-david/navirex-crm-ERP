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
import {
	webhookCreateInput,
	webhookCreateOutput,
	webhookOutput,
	webhooksOutput,
	webhookUpdateInput,
} from "./webhooks.contracts";
import { WebhooksService } from "./webhooks.service";

@Router({ alias: "webhooks" })
@UseMiddlewares(AuthMiddleware)
export class WebhooksRouter {
	constructor(
		@Inject(WebhooksService) private readonly webhooks: WebhooksService,
	) {}

	@Query({ output: webhooksOutput })
	list(@Ctx() ctx: AuthedTrpcContext) {
		return this.webhooks.list(ctx.user.id);
	}

	@Mutation({ input: webhookCreateInput, output: webhookCreateOutput })
	create(
		@Input() input: z.infer<typeof webhookCreateInput>,
		@Ctx() ctx: AuthedTrpcContext,
	) {
		return this.webhooks.create(input, ctx.user.id);
	}

	@Mutation({ input: webhookUpdateInput, output: webhookOutput })
	update(
		@Input() input: z.infer<typeof webhookUpdateInput>,
		@Ctx() ctx: AuthedTrpcContext,
	) {
		return this.webhooks.update(input, ctx.user.id);
	}
}
