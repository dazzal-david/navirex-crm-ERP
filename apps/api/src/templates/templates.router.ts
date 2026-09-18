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
	type TemplateOutput,
	templateCreateInput,
	templateOutput,
	templatesOutput,
	templateUpdateInput,
} from "./templates.contracts";
import { TemplatesService } from "./templates.service";

@Router({ alias: "templates" })
@UseMiddlewares(AuthMiddleware)
export class TemplatesRouter {
	constructor(
		@Inject(TemplatesService) private readonly templates: TemplatesService,
	) {}

	@Query({ output: templatesOutput })
	list(): Promise<TemplateOutput[]> {
		return this.templates.list();
	}

	@Mutation({ input: templateCreateInput, output: templateOutput })
	create(
		@Input() input: z.infer<typeof templateCreateInput>,
		@Ctx() ctx: AuthedTrpcContext,
	) {
		return this.templates.create(input, ctx.user.id);
	}

	@Mutation({ input: templateUpdateInput, output: templateOutput })
	update(
		@Input() input: z.infer<typeof templateUpdateInput>,
		@Ctx() ctx: AuthedTrpcContext,
	) {
		return this.templates.update(input, ctx.user.id);
	}
}
