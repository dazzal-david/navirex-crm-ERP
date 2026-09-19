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
	boardInput,
	boardOutput,
	columnPageInput,
	columnPageOutput,
	leadAssignInput,
	leadCreateInput,
	leadDeleteOutput,
	leadDetailOutput,
	leadIdInput,
	leadIntakeInput,
	leadIntakeOutput,
	leadListInput,
	leadListOutput,
	leadMoveInput,
	leadMutateOutput,
	leadOwnersOutput,
	leadUpdateInput,
	zohoImportInput,
	zohoImportOutput,
} from "./leads.contracts";
import { LeadsService } from "./leads.service";

@Router({ alias: "leads" })
@UseMiddlewares(AuthMiddleware)
export class LeadsRouter {
	constructor(@Inject(LeadsService) private readonly leads: LeadsService) {}

	@Query({
		input: boardInput,
		output: boardOutput,
		meta: restMeta("POST", "/leads/board", ["Leads"]),
	})
	async board(
		@Input() input: z.infer<typeof boardInput>,
		@Ctx() ctx: AuthedTrpcContext,
	) {
		return this.leads.board(input, ctx.user.id);
	}

	@Query({
		input: columnPageInput,
		output: columnPageOutput,
		meta: restMeta("POST", "/leads/column", ["Leads"]),
	})
	async column(
		@Input() input: z.infer<typeof columnPageInput>,
		@Ctx() ctx: AuthedTrpcContext,
	) {
		return this.leads.column(input, ctx.user.id);
	}

	@Query({
		input: leadListInput,
		output: leadListOutput,
		meta: restMeta("POST", "/leads/list", ["Leads"]),
	})
	async list(
		@Input() input: z.infer<typeof leadListInput>,
		@Ctx() ctx: AuthedTrpcContext,
	) {
		return this.leads.list(input, ctx.user.id);
	}

	@Query({
		input: leadIdInput,
		output: leadDetailOutput,
		meta: restMeta("GET", "/leads/{id}", ["Leads"]),
	})
	async byId(@Input("id") id: string) {
		return this.leads.byId(id);
	}

	@Query({
		output: leadOwnersOutput,
		meta: restMeta("GET", "/leads/owners", ["Leads"]),
	})
	async owners() {
		return this.leads.owners();
	}

	@Mutation({
		input: leadCreateInput,
		output: leadMutateOutput,
		meta: restMeta("POST", "/leads", ["Leads"]),
	})
	async create(
		@Input() input: z.infer<typeof leadCreateInput>,
		@Ctx() ctx: AuthedTrpcContext,
	) {
		return this.leads.create(input, ctx.user.id);
	}

	@Mutation({
		input: leadIntakeInput,
		output: leadIntakeOutput,
		meta: restMeta("POST", "/leads/intake", ["Leads"]),
	})
	async intake(
		@Input() input: z.infer<typeof leadIntakeInput>,
		@Ctx() ctx: AuthedTrpcContext,
	) {
		return this.leads.intake(input, ctx.user.id);
	}

	@Mutation({
		input: zohoImportInput,
		output: zohoImportOutput,
		meta: restMeta("POST", "/leads/import/zoho", ["Leads"]),
	})
	async importZoho(
		@Input() input: z.infer<typeof zohoImportInput>,
		@Ctx() ctx: AuthedTrpcContext,
	) {
		return this.leads.importZoho(input.rows, ctx.user.id);
	}

	@Mutation({
		input: leadUpdateInput,
		output: leadMutateOutput,
		meta: restMeta("PATCH", "/leads/{id}", ["Leads"]),
	})
	async update(
		@Input() input: z.infer<typeof leadUpdateInput>,
		@Ctx() ctx: AuthedTrpcContext,
	) {
		return this.leads.update(input, ctx.user.id);
	}

	@Mutation({
		input: leadMoveInput,
		output: leadMutateOutput,
		meta: restMeta("POST", "/leads/{id}/move", ["Leads"]),
	})
	async move(
		@Input() input: z.infer<typeof leadMoveInput>,
		@Ctx() ctx: AuthedTrpcContext,
	) {
		return this.leads.move(input, ctx.user.id);
	}

	@Mutation({
		input: leadAssignInput,
		output: leadMutateOutput,
		meta: restMeta("POST", "/leads/{id}/assign", ["Leads"]),
	})
	async assign(
		@Input() input: z.infer<typeof leadAssignInput>,
		@Ctx() ctx: AuthedTrpcContext,
	) {
		return this.leads.assign(input.id, input.ownerId, ctx.user.id);
	}

	@Mutation({
		input: leadIdInput,
		output: leadDeleteOutput,
		meta: restMeta("DELETE", "/leads/{id}", ["Leads"]),
	})
	async remove(@Input("id") id: string) {
		return this.leads.remove(id);
	}
}
