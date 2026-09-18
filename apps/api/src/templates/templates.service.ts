import { canManageTemplates, workspaceRoleOf } from "@crm/auth";
import type { Db } from "@crm/db";
import {
	ForbiddenException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import type {
	TemplateCreateInput,
	TemplateOutput,
	TemplateUpdateInput,
} from "./templates.contracts";

@Injectable()
export class TemplatesService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	list(): Promise<TemplateOutput[]> {
		return this.db.messageTemplate.findMany({
			orderBy: [{ active: "desc" }, { updatedAt: "desc" }],
		});
	}

	async create(input: TemplateCreateInput, userId: string) {
		await this.assertCanManage(userId);
		return this.db.messageTemplate.create({
			data: {
				...input,
				subject: blank(input.subject),
				providerTemplateName: blank(input.providerTemplateName),
				createdById: userId,
			},
		});
	}

	async update(input: TemplateUpdateInput, userId: string) {
		await this.assertCanManage(userId);
		const current = await this.db.messageTemplate.findUnique({
			where: { id: input.id },
			select: { id: true },
		});
		if (!current)
			throw new NotFoundException("That template no longer exists.");
		const { id, ...data } = input;
		return this.db.messageTemplate.update({
			where: { id },
			data: {
				...data,
				...(data.subject === undefined ? {} : { subject: blank(data.subject) }),
				...(data.providerTemplateName === undefined
					? {}
					: { providerTemplateName: blank(data.providerTemplateName) }),
			},
		});
	}

	private async assertCanManage(userId: string) {
		if (!canManageTemplates(await workspaceRoleOf(userId, this.db))) {
			throw new ForbiddenException(
				"Only a Founder, Superadmin, or Manager can manage templates.",
			);
		}
	}
}

function blank(value: string | undefined): string | null {
	const normalized = value?.trim();
	return normalized ? normalized : null;
}
