"use client";

import Archive from "@carbon/icons-react/es/Archive";
import Enterprise from "@carbon/icons-react/es/Enterprise";
import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import { EmptyCellValue } from "@crm/ui/components/empty-cell";
import { Icon } from "@crm/ui/components/icon";
import { PersonAvatar } from "@crm/ui/components/person-avatar";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
	InlineSelectField,
	InlineTextCell,
} from "@/components/crm/inline-field";
import { Timeline } from "@/components/crm/timeline/timeline";
import {
	DetailSheetBody,
	DetailSheetProperties,
	DetailSheetProperty,
	DetailSheetSection,
	DetailSheetStat,
	DetailSheetStats,
	type DetailSheetTab,
} from "@/components/detail-sheet";
import { LocalRelativeTime } from "@/components/local-date-time";
import { LEAD_BOARD } from "@/lib/leads/board-config";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { LeadCommunicationActions } from "./lead-communications";
import { LeadNotes } from "./lead-notes";
import { RecordSheetFrame } from "./record-parts";
import {
	useOpenRecord,
	useRecordSheetView,
	useRecordStack,
} from "./record-stack";

type Lead = RouterOutputs["leads"]["byId"];

const UNSET = "__none__";

const STAGE_OPTIONS = LEAD_BOARD.stages.map((stage) => ({
	value: stage,
	label: LEAD_BOARD.label[stage],
}));

const KIND_OPTIONS = LEAD_BOARD.kinds.map((kind) => ({
	value: kind,
	label: LEAD_BOARD.kind[kind],
}));

const ENTITY_OPTIONS = [
	{ value: UNSET, label: "Not set" },
	{ value: "INDIA", label: "Navirex India" },
	{ value: "GERMANY", label: "Navirex Germany" },
];

function useLeadMutations(leadId: string) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const cache = useCrmCache();

	const refresh = () => {
		void queryClient.invalidateQueries({
			queryKey: trpc.leads.byId.queryKey({ id: leadId }),
		});
		void queryClient.invalidateQueries({
			queryKey: trpc.leads.board.queryKey(),
		});
		void queryClient.invalidateQueries({
			queryKey: trpc.leads.column.pathKey(),
		});
		void queryClient.invalidateQueries({
			queryKey: trpc.leads.list.pathKey(),
		});
		void queryClient.invalidateQueries({
			queryKey: trpc.dashboard.leadOverview.queryKey(),
		});
	};

	const update = useMutation(
		trpc.leads.update.mutationOptions({
			onSuccess: refresh,
			onError: (error) => toast.error(error.message),
		}),
	);

	const assign = useMutation(
		trpc.leads.assign.mutationOptions({
			onSuccess: refresh,
			onError: (error) => toast.error(error.message),
		}),
	);

	const convert = useMutation(
		trpc.leads.convert.mutationOptions({
			onSuccess: (result) => {
				refresh();
				void cache.company(result.companyId);
				void cache.contact(result.contactId);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	return { update, assign, convert, refresh };
}

export function LeadSheet({ leadId }: { leadId: string }) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const { closeAll } = useRecordStack();
	const openRecord = useOpenRecord();
	const { tab, setTab } = useRecordSheetView("overview");

	const query = useQuery(trpc.leads.byId.queryOptions({ id: leadId }));
	const owners = useQuery(trpc.leads.owners.queryOptions());
	const epcs = useQuery({
		...trpc.leads.epcOptions.queryOptions(),
		enabled: query.data?.kind === "CUSTOMER",
	});
	const lead = query.data;

	const { update, assign, convert } = useLeadMutations(leadId);

	const archive = useMutation(
		trpc.leads.remove.mutationOptions({
			onSuccess: () => {
				toast.success("The lead was archived.");
				void Promise.all([
					queryClient.invalidateQueries({
						queryKey: trpc.leads.board.queryKey(),
					}),
					queryClient.invalidateQueries({
						queryKey: trpc.leads.column.pathKey(),
					}),
					queryClient.invalidateQueries({
						queryKey: trpc.leads.list.pathKey(),
					}),
					queryClient.invalidateQueries({
						queryKey: trpc.dashboard.leadOverview.queryKey(),
					}),
				]);
				closeAll();
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const ownerOptions = [
		{ value: UNSET, label: "Unassigned" },
		...(owners.data ?? []).map((owner) => ({
			value: owner.id,
			label: owner.designation
				? `${owner.name} · ${owner.designation}`
				: owner.name,
		})),
	];

	const tabs: DetailSheetTab[] = lead
		? [
				{
					value: "overview",
					label: "Overview",
					content: (
						<LeadOverview
							lead={lead}
							onAssign={(ownerId) => assign.mutate({ id: lead.id, ownerId })}
							onUpdate={(patch) => update.mutate({ id: lead.id, ...patch })}
							ownerOptions={ownerOptions}
							epcOptions={[
								{ value: UNSET, label: "Not set" },
								...(epcs.data ?? []).map((epc) => ({
									value: epc.id,
									label: epc.name,
								})),
							]}
							onServingEpc={(servingEpcId) =>
								update.mutate({ id: lead.id, servingEpcId })
							}
							saving={update.isPending || assign.isPending}
						/>
					),
				},
				{
					value: "activity",
					label: "Activity",
					content: <Timeline anchor={{ leadId: lead.id }} />,
				},
			]
		: [];

	return (
		<RecordSheetFrame
			actions={
				lead ? (
					<div className="flex flex-wrap gap-2">
						<LeadCommunicationActions
							leadId={lead.id}
							email={lead.email}
							phone={lead.phone}
						/>
						{lead.convertedAt && lead.companyId ? (
							<Button
								onClick={() =>
									openRecord({ kind: "company", id: lead.companyId as string })
								}
								size="sm"
								variant="outline"
							>
								<Icon data-icon="inline-start" icon={Enterprise} />
								Open account
							</Button>
						) : (
							<Button
								disabled={convert.isPending}
								onClick={() =>
									convert.mutate(
										{ id: lead.id },
										{
											onSuccess: (result) => {
												toast.success("Converted to an account.");
												openRecord({ kind: "company", id: result.companyId });
											},
										},
									)
								}
								size="sm"
							>
								{convert.isPending ? (
									<Spinner data-icon="inline-start" />
								) : (
									<Icon data-icon="inline-start" icon={Enterprise} />
								)}
								Convert
							</Button>
						)}
						<Button
							disabled={archive.isPending}
							onClick={() => archive.mutate({ id: lead.id })}
							size="sm"
							variant="outline"
						>
							{archive.isPending ? (
								<Spinner data-icon="inline-start" />
							) : (
								<Icon data-icon="inline-start" icon={Archive} />
							)}
							Archive
						</Button>
					</div>
				) : null
			}
			error={query.error?.message ?? null}
			loading={query.isPending}
			media={
				lead ? <PersonAvatar name={lead.name} size="lg" src={null} /> : null
			}
			stats={
				lead ? (
					<DetailSheetStats>
						<DetailSheetStat label="Status">
							<Badge variant="secondary">{LEAD_BOARD.label[lead.stage]}</Badge>
						</DetailSheetStat>
						<DetailSheetStat label="Owner">
							{lead.owner?.name ?? <EmptyCellValue />}
						</DetailSheetStat>
						<DetailSheetStat label="Last activity">
							{lead.lastActivityAt ? (
								<LocalRelativeTime date={lead.lastActivityAt} />
							) : (
								"No activity"
							)}
						</DetailSheetStat>
						<DetailSheetStat label="Source">
							{lead.source ?? <EmptyCellValue />}
						</DetailSheetStat>
					</DetailSheetStats>
				) : null
			}
			onTabChange={setTab}
			tab={tab}
			tabs={tabs}
			title={lead?.name ?? "Lead"}
			description={lead?.companyName ?? undefined}
		/>
	);
}

function LeadOverview({
	lead,
	ownerOptions,
	epcOptions,
	onUpdate,
	onAssign,
	onServingEpc,
	saving,
}: {
	lead: Lead;
	ownerOptions: { value: string; label: string }[];
	epcOptions: { value: string; label: string }[];
	onServingEpc: (servingEpcId: string | null) => void;
	onUpdate: (patch: Record<string, string | undefined>) => void;
	onAssign: (ownerId: string | null) => void;
	saving: boolean;
}) {
	return (
		<DetailSheetBody>
			<DetailSheetSection className="py-5" title="Pipeline">
				<div className="rounded-2xl border bg-muted/20 p-4">
					<DetailSheetProperties>
						<InlineSelectField
							label="Status"
							onSave={(next) => onUpdate({ stage: next })}
							options={STAGE_OPTIONS}
							saving={saving}
							value={lead.stage}
						/>

						<InlineSelectField
							label="Owner"
							onSave={(next) => onAssign(next === UNSET ? null : next)}
							options={ownerOptions}
							saving={saving}
							value={lead.owner?.id ?? UNSET}
						/>

						<InlineSelectField
							label="Lead category"
							onSave={(next) => onUpdate({ kind: next })}
							options={KIND_OPTIONS}
							saving={saving}
							value={lead.kind}
						/>

						<InlineSelectField
							label="Navirex entity"
							onSave={(next) =>
								onUpdate({ entity: next === UNSET ? undefined : next })
							}
							options={ENTITY_OPTIONS}
							saving={saving}
							value={lead.entity ?? UNSET}
						/>
						<InlineTextCell
							label="Next action"
							onSave={(next) => onUpdate({ nextAction: next })}
							placeholder="What happens next?"
							saving={saving}
							value={lead.nextAction}
						/>
						<DetailSheetProperty label="In this status since">
							<LocalRelativeTime date={lead.stageChangedAt} />
						</DetailSheetProperty>
						<DetailSheetProperty label="Created">
							<LocalRelativeTime date={lead.createdAt} />
						</DetailSheetProperty>
						{lead.convertedAt ? (
							<DetailSheetProperty label="Converted">
								<LocalRelativeTime date={lead.convertedAt} />
							</DetailSheetProperty>
						) : null}
					</DetailSheetProperties>
				</div>
			</DetailSheetSection>

			<DetailSheetSection className="py-5" title="Contact details">
				<div className="rounded-2xl border bg-card p-4 shadow-xs">
					<DetailSheetProperties>
						<InlineTextCell
							label="Name"
							onSave={(next) => {
								if (next) onUpdate({ name: next });
							}}
							placeholder="Add a name"
							saving={saving}
							value={lead.name}
						/>

						{(LEAD_BOARD.designationKinds as readonly string[]).includes(
							lead.kind,
						) ? (
							<InlineTextCell
								label="Designation / role"
								onSave={(next) => onUpdate({ designation: next })}
								placeholder="Add a designation"
								saving={saving}
								value={lead.designation}
							/>
						) : null}

						<InlineTextCell
							label="Company"
							onSave={(next) => onUpdate({ companyName: next })}
							placeholder="Add a company"
							saving={saving}
							value={lead.companyName}
						/>

						{lead.kind === "CUSTOMER" ? (
							<>
								<InlineSelectField
									label="Serving EPC"
									onSave={(next) => onServingEpc(next === UNSET ? null : next)}
									options={epcOptions}
									saving={saving}
									value={lead.servingEpc?.id ?? UNSET}
								/>
								{lead.servingEpc ? null : (
									<InlineTextCell
										label="Serving EPC (other)"
										onSave={(next) => onUpdate({ servingEpcName: next })}
										placeholder="Type an EPC not in the list"
										saving={saving}
										value={lead.servingEpcName}
									/>
								)}
							</>
						) : null}

						<InlineTextCell
							label="Email"
							onSave={(next) => onUpdate({ email: next })}
							placeholder="Add an email"
							saving={saving}
							value={lead.email}
						/>

						<InlineTextCell
							label="Secondary email"
							onSave={(next) => onUpdate({ secondaryEmail: next })}
							placeholder="Add an email"
							saving={saving}
							value={lead.secondaryEmail}
						/>

						<InlineTextCell
							label="Mobile number"
							onSave={(next) => onUpdate({ phone: next })}
							placeholder="Add a phone number"
							saving={saving}
							value={lead.phone}
						/>

						<InlineTextCell
							label="Secondary phone"
							onSave={(next) => onUpdate({ secondaryPhone: next })}
							placeholder="Add a phone number"
							saving={saving}
							value={lead.secondaryPhone}
						/>

						<InlineTextCell
							label="Website"
							onSave={(next) => onUpdate({ website: next })}
							placeholder="Add a website"
							saving={saving}
							value={lead.website}
						/>

						<InlineTextCell
							label="Lead source"
							onSave={(next) => onUpdate({ source: next })}
							placeholder="Add a source"
							saving={saving}
							value={lead.source}
						/>
					</DetailSheetProperties>
				</div>
			</DetailSheetSection>

			<DetailSheetSection className="py-5" title="Address">
				<div className="rounded-2xl border bg-card p-4 shadow-xs">
					<DetailSheetProperties>
						<InlineTextCell
							label="Country"
							onSave={(next) => onUpdate({ country: next })}
							placeholder="Add a country"
							saving={saving}
							value={lead.country}
						/>

						<InlineTextCell
							label="State"
							onSave={(next) => onUpdate({ state: next })}
							placeholder="Add a state"
							saving={saving}
							value={lead.state}
						/>

						<InlineTextCell
							label="Address"
							onSave={(next) => onUpdate({ address: next })}
							placeholder="Add an address"
							saving={saving}
							value={lead.address}
						/>
					</DetailSheetProperties>
				</div>
			</DetailSheetSection>

			<DetailSheetSection className="py-5" title="Notes">
				<LeadNotes leadId={lead.id} />
			</DetailSheetSection>
		</DetailSheetBody>
	);
}
