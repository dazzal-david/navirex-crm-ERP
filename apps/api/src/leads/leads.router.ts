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
import { NotificationsService } from "../notifications/notifications.service";
import type { AuthedTrpcContext } from "../trpc/context.types";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { restMeta } from "../trpc/openapi";
import { LeadContactsService } from "./lead-contacts.service";
import {
	boardInput,
	boardOutput,
	columnPageInput,
	columnPageOutput,
	leadAssignInput,
	leadAssignManyInput,
	leadAssignManyOutput,
	leadContact,
	leadContactCreateInput,
	leadContactIdInput,
	leadContactsOutput,
	leadContactUpdateInput,
	leadConvertInput,
	leadConvertOutput,
	leadCreateInput,
	leadDeleteOutput,
	leadDetailOutput,
	leadEpcOptionsOutput,
	leadIdInput,
	leadIdOnlyOutput,
	leadIntakeInput,
	leadIntakeOutput,
	leadListInput,
	leadListOutput,
	leadMergeInput,
	leadMoveInput,
	leadMutateOutput,
	leadOwnersOutput,
	leadUpdateInput,
	sameCompanyOutput,
	unassignedLeadsInput,
	unassignedLeadsOutput,
	zohoImportInput,
	zohoImportOutput,
} from "./leads.contracts";
import { LeadsService } from "./leads.service";

@Router({ alias: "leads" })
@UseMiddlewares(AuthMiddleware)
export class LeadsRouter {
	constructor(
		@Inject(LeadsService) private readonly leads: LeadsService,
		@Inject(LeadContactsService)
		private readonly contacts: LeadContactsService,
		@Inject(NotificationsService)
		private readonly notifications: NotificationsService,
	) {}

	@Query({ input: leadIdInput, output: leadContactsOutput })
	async contactsOf(@Input() input: z.infer<typeof leadIdInput>) {
		return this.contacts.list(input.id);
	}

	@Mutation({ input: leadContactCreateInput, output: leadContact })
	async addContact(
		@Input() input: z.infer<typeof leadContactCreateInput>,
		@Ctx() ctx: AuthedTrpcContext,
	) {
		return this.contacts.add(input, ctx.user.id);
	}

	@Mutation({ input: leadContactUpdateInput, output: leadContact })
	async updateContact(@Input() input: z.infer<typeof leadContactUpdateInput>) {
		return this.contacts.update(input);
	}

	@Mutation({ input: leadContactIdInput, output: leadContactIdInput })
	async removeContact(
		@Input() input: z.infer<typeof leadContactIdInput>,
		@Ctx() ctx: AuthedTrpcContext,
	) {
		return this.contacts.remove(input.id, ctx.user.id);
	}

	@Mutation({ input: leadContactIdInput, output: leadIdOnlyOutput })
	async makePrimaryContact(
		@Input() input: z.infer<typeof leadContactIdInput>,
		@Ctx() ctx: AuthedTrpcContext,
	) {
		return this.contacts.makePrimary(input.id, ctx.user.id);
	}

	@Query({ input: leadIdInput, output: sameCompanyOutput })
	async sameCompany(@Input() input: z.infer<typeof leadIdInput>) {
		return this.contacts.sameCompany(input.id);
	}

	@Mutation({ input: leadMergeInput, output: leadIdOnlyOutput })
	async merge(
		@Input() input: z.infer<typeof leadMergeInput>,
		@Ctx() ctx: AuthedTrpcContext,
	) {
		return this.contacts.merge(input.sourceId, input.targetId, ctx.user.id);
	}

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

	@Query({
		output: leadEpcOptionsOutput,
		meta: restMeta("GET", "/leads/epc-options", ["Leads"]),
	})
	async epcOptions() {
		return this.leads.epcOptions();
	}

	@Query({ input: unassignedLeadsInput, output: unassignedLeadsOutput })
	async unassigned(@Input() input: z.infer<typeof unassignedLeadsInput>) {
		return this.leads.unassigned(input.cursor);
	}

	@Mutation({ input: leadAssignManyInput, output: leadAssignManyOutput })
	async assignMany(
		@Input() input: z.infer<typeof leadAssignManyInput>,
		@Ctx() ctx: AuthedTrpcContext,
	) {
		return this.leads.assignMany(input.ids, input.ownerId, ctx.user.id);
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
		input: leadConvertInput,
		output: leadConvertOutput,
		meta: restMeta("POST", "/leads/{id}/convert", ["Leads"]),
	})
	async convert(
		@Input() input: z.infer<typeof leadConvertInput>,
		@Ctx() ctx: AuthedTrpcContext,
	) {
		const result = await this.leads.convert(input.id, ctx.user.id);
		const text = input.note?.trim();
		if (text) {
			const note = await this.leads.noteOnConversion(
				input.id,
				result.companyId,
				text,
				input.mentions,
				ctx.user.id,
			);
			await this.notifications.notifyMentions({
				actorId: ctx.user.id,
				mentionIds: input.mentions,
				leadId: input.id,
				companyId: result.companyId,
				activityId: note.id,
				text,
			});
		}
		return result;
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
