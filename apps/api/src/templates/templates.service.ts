import { canManageTemplates, workspaceRoleOf } from "@crm/auth";
import type { Db, Prisma } from "@crm/db";
import { SETTINGS_ID } from "@crm/db/settings";
import { WORKSPACE_ID } from "@crm/db/workspace";
import {
	BadGatewayException,
	ForbiddenException,
	Injectable,
	Logger,
	NotFoundException,
	ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { EnvironmentVariables } from "../config/env.validation";
import { InjectDatabase } from "../database/database.constants";
import { META } from "../meta/meta-config";
import type {
	MetaTemplateSyncOutput,
	TemplateCreateInput,
	TemplateOutput,
	TemplateUpdateInput,
} from "./templates.contracts";

const REFRESH_INTERVAL_MS = 15 * 60_000;
const REFRESH_INTERVAL_MINUTES = REFRESH_INTERVAL_MS / 60_000;

type MetaTemplate = {
	id: string;
	name: string;
	language: string;
	status: string;
	category?: string;
	components?: Array<{ type: string; text?: string }>;
};

type MetaTemplatePage = {
	data?: MetaTemplate[];
	paging?: { next?: string };
	error?: { message?: string };
};

@Injectable()
export class TemplatesService {
	private readonly logger = new Logger(TemplatesService.name);
	private readonly accessToken: string | undefined;
	private readonly environmentBusinessAccountId: string | undefined;
	private syncPromise: Promise<MetaTemplateSyncOutput> | null = null;

	constructor(
		@InjectDatabase() private readonly db: Db,
		config: ConfigService<EnvironmentVariables, true>,
	) {
		this.accessToken = config.get("WHATSAPP_ACCESS_TOKEN", { infer: true });
		this.environmentBusinessAccountId = config.get(
			"WHATSAPP_BUSINESS_ACCOUNT_ID",
			{ infer: true },
		);
	}

	async list(): Promise<TemplateOutput[]> {
		if (await this.metaSyncIsDue()) {
			try {
				await this.syncMetaSystem();
			} catch (error) {
				this.logger.warn({
					message: "Meta template refresh failed while listing templates",
					error:
						error instanceof Error ? error.message : "Unknown Meta sync error.",
				});
			}
		}

		return this.db.messageTemplate.findMany({
			orderBy: [{ active: "desc" }, { updatedAt: "desc" }],
		});
	}

	async metaSyncStatus() {
		const settings = await this.db.appSetting.findUnique({
			where: { id: SETTINGS_ID },
			select: {
				whatsappBusinessAccountId: true,
				whatsappTemplatesLastAttemptAt: true,
				whatsappTemplatesLastSyncedAt: true,
				whatsappTemplatesLastError: true,
			},
		});

		const businessAccountId =
			this.environmentBusinessAccountId ??
			settings?.whatsappBusinessAccountId ??
			null;
		return {
			configured: Boolean(this.accessToken && businessAccountId),
			accessTokenConfigured: Boolean(this.accessToken),
			businessAccountId,
			lastAttemptAt: settings?.whatsappTemplatesLastAttemptAt ?? null,
			lastSyncedAt: settings?.whatsappTemplatesLastSyncedAt ?? null,
			lastError: settings?.whatsappTemplatesLastError ?? null,
			refreshIntervalMinutes: REFRESH_INTERVAL_MINUTES,
		};
	}

	async syncMeta(userId: string): Promise<MetaTemplateSyncOutput> {
		await this.assertCanManage(userId);
		return this.syncMetaSystem();
	}

	async configureMeta(businessAccountId: string, userId: string) {
		await this.assertCanManage(userId);
		await this.db.appSetting.upsert({
			where: { id: SETTINGS_ID },
			create: { id: SETTINGS_ID, whatsappBusinessAccountId: businessAccountId },
			update: { whatsappBusinessAccountId: businessAccountId },
		});
		return this.metaSyncStatus();
	}

	syncMetaSystem(): Promise<MetaTemplateSyncOutput> {
		if (this.syncPromise) return this.syncPromise;

		const sync = this.runMetaSync();
		this.syncPromise = sync;
		void sync.then(
			() => this.clearSyncPromise(sync),
			() => this.clearSyncPromise(sync),
		);
		return sync;
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
		const update: Prisma.MessageTemplateUncheckedUpdateInput = { ...data };
		if (data.subject !== undefined) update.subject = blank(data.subject);
		if (data.providerTemplateName !== undefined) {
			update.providerTemplateName = blank(data.providerTemplateName);
		}
		return this.db.messageTemplate.update({ where: { id }, data: update });
	}

	private async metaSyncIsDue(): Promise<boolean> {
		const settings = await this.db.appSetting.findUnique({
			where: { id: SETTINGS_ID },
			select: {
				whatsappBusinessAccountId: true,
				whatsappTemplatesLastAttemptAt: true,
			},
		});
		const businessAccountId =
			this.environmentBusinessAccountId ?? settings?.whatsappBusinessAccountId;
		if (!this.accessToken || !businessAccountId) return false;
		const attemptedAt = settings?.whatsappTemplatesLastAttemptAt;
		return (
			!attemptedAt || Date.now() - attemptedAt.getTime() >= REFRESH_INTERVAL_MS
		);
	}

	private async runMetaSync(): Promise<MetaTemplateSyncOutput> {
		const settings = await this.db.appSetting.findUnique({
			where: { id: SETTINGS_ID },
			select: { whatsappBusinessAccountId: true },
		});
		const businessAccountId =
			this.environmentBusinessAccountId ?? settings?.whatsappBusinessAccountId;
		if (!this.accessToken || !businessAccountId) {
			throw new ServiceUnavailableException(
				"Meta template sync needs a WhatsApp access token and business account ID.",
			);
		}

		const attemptedAt = new Date();
		await this.db.appSetting.upsert({
			where: { id: SETTINGS_ID },
			create: { id: SETTINGS_ID, whatsappTemplatesLastAttemptAt: attemptedAt },
			update: { whatsappTemplatesLastAttemptAt: attemptedAt },
		});

		try {
			const templates = await this.fetchMetaTemplates(
				businessAccountId,
				this.accessToken,
			);
			const approved = templates.filter(
				(template) => template.status.toUpperCase() === "APPROVED",
			);
			const creatorId = await this.syncCreatorId();
			const syncedAt = new Date();
			let created = 0;
			let updated = 0;

			for (const template of approved) {
				const existing = await this.db.messageTemplate.findFirst({
					where: {
						channel: "WHATSAPP",
						OR: [
							{ providerTemplateId: template.id },
							{
								providerTemplateName: template.name,
								language: template.language,
							},
						],
					},
					select: { id: true },
				});
				const data = {
					body: templateBody(template),
					providerTemplateName: template.name,
					providerTemplateId: template.id,
					providerStatus: template.status,
					providerCategory: template.category ?? null,
					providerSyncedAt: syncedAt,
					language: template.language,
					active: true,
				};

				if (existing) {
					await this.db.messageTemplate.update({
						where: { id: existing.id },
						data,
					});
					updated += 1;
				} else {
					await this.db.messageTemplate.create({
						data: {
							...data,
							name: `Meta · ${template.name} · ${template.language}`,
							channel: "WHATSAPP",
							createdById: creatorId,
						},
					});
					created += 1;
				}
			}

			const approvedIds = approved.map((template) => template.id);
			const stale = await this.db.messageTemplate.updateMany({
				where: {
					providerTemplateId: { not: null, notIn: approvedIds },
					active: true,
				},
				data: {
					active: false,
					providerStatus: "UNAVAILABLE",
					providerSyncedAt: syncedAt,
				},
			});

			await this.db.appSetting.update({
				where: { id: SETTINGS_ID },
				data: {
					whatsappTemplatesLastSyncedAt: syncedAt,
					whatsappTemplatesLastError: null,
				},
			});

			return {
				fetched: templates.length,
				approved: approved.length,
				created,
				updated,
				deactivated: stale.count,
				syncedAt,
			};
		} catch (error) {
			const message = (
				error instanceof Error ? error.message : "Unknown Meta sync error."
			).slice(0, 1_000);
			await this.db.appSetting.update({
				where: { id: SETTINGS_ID },
				data: { whatsappTemplatesLastError: message },
			});
			throw error;
		}
	}

	private async fetchMetaTemplates(
		businessAccountId: string,
		accessToken: string,
	): Promise<MetaTemplate[]> {
		const initial = new URL(
			`${META.graphBase}/${encodeURIComponent(businessAccountId)}/message_templates`,
		);
		initial.searchParams.set(
			"fields",
			"id,name,language,status,category,components",
		);
		initial.searchParams.set("limit", "100");

		const templates: MetaTemplate[] = [];
		let next: string | undefined = initial.toString();
		while (next) {
			const url = new URL(next);
			if (url.hostname !== "graph.facebook.com") {
				throw new BadGatewayException(
					"Meta returned an invalid pagination URL.",
				);
			}
			const response = await fetch(url, {
				headers: { authorization: `Bearer ${accessToken}` },
				signal: AbortSignal.timeout(20_000),
			});
			const page = (await response.json()) as MetaTemplatePage;
			if (!response.ok) {
				throw new BadGatewayException(
					page.error?.message ?? "Meta template request failed.",
				);
			}
			templates.push(...(page.data ?? []));
			next = page.paging?.next;
		}
		return templates;
	}

	private async syncCreatorId(): Promise<string> {
		const member = await this.db.member.findFirst({
			where: { organizationId: WORKSPACE_ID },
			orderBy: { createdAt: "asc" },
			select: { userId: true },
		});
		if (!member) {
			throw new ServiceUnavailableException(
				"Meta template sync needs an existing workspace member.",
			);
		}
		return member.userId;
	}

	private async assertCanManage(userId: string) {
		if (!canManageTemplates(await workspaceRoleOf(userId, this.db))) {
			throw new ForbiddenException(
				"Only a Founder, Superadmin, or Manager can manage templates.",
			);
		}
	}

	private clearSyncPromise(sync: Promise<MetaTemplateSyncOutput>) {
		if (this.syncPromise === sync) this.syncPromise = null;
	}
}

function templateBody(template: MetaTemplate): string {
	return (
		template.components?.find((component) => component.type === "BODY")?.text ??
		`Meta template: ${template.name}`
	);
}

function blank(value: string | undefined): string | null {
	const normalized = value?.trim();
	return normalized ? normalized : null;
}
