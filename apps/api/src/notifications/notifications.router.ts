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
	markedOutput,
	notificationIdInput,
	notificationsOutput,
	unreadNotificationsOutput,
} from "./notifications.contracts";
import { NotificationsService } from "./notifications.service";

@Router({ alias: "notifications" })
@UseMiddlewares(AuthMiddleware)
export class NotificationsRouter {
	constructor(
		@Inject(NotificationsService)
		private readonly notifications: NotificationsService,
	) {}

	@Query({ output: notificationsOutput })
	list(@Ctx() ctx: AuthedTrpcContext) {
		return this.notifications.list(ctx.user.id);
	}

	@Query({ output: unreadNotificationsOutput })
	unreadCount(@Ctx() ctx: AuthedTrpcContext) {
		return this.notifications.unreadCount(ctx.user.id);
	}

	@Mutation({ input: notificationIdInput, output: markedOutput })
	markRead(
		@Input() input: z.infer<typeof notificationIdInput>,
		@Ctx() ctx: AuthedTrpcContext,
	) {
		return this.notifications.markRead(ctx.user.id, input.id);
	}

	@Mutation({ output: markedOutput })
	markAllRead(@Ctx() ctx: AuthedTrpcContext) {
		return this.notifications.markAllRead(ctx.user.id);
	}
}
