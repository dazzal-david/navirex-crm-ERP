"use client";

import Archive from "@carbon/icons-react/es/Archive";
import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import { PersonAvatar } from "@crm/ui/components/person-avatar";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
	InlineSelectField,
	InlineTextArea,
	InlineTextCell,
} from "@/components/crm/inline-field";
import { Timeline } from "@/components/crm/timeline/timeline";
import {
	DetailSheetBody,
	DetailSheetProperties,
	DetailSheetProperty,
	DetailSheetSection,
	type DetailSheetTab,
} from "@/components/detail-sheet";
import { LocalRelativeTime } from "@/components/local-date-time";
import { LEAD_BOARD } from "@/lib/leads/board-config";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { LeadCommunicationActions } from "./lead-communications";
import { RecordSheetFrame } from "./record-parts";
import { useRecordSheetView, useRecordStack } from "./record-stack";

type Lead = RouterOutputs["leads"]["byId"];

const UNSET = "__none__";

const STAGE_OPTIONS = LEAD_BOARD.stages.map((stage) => ({
	value: stage,
	label: LEAD_BOARD.label[stage],
}));

const KIND_OPTIONS = (["EPC", "CUSTOMER", "OTHER"] as const).map((kind) => ({
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

	return { update, assign, refresh };
}

export function LeadSheet({ leadId }: { leadId: string }) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const { closeAll } = useRecordStack();
	const { tab, setTab } = useRecordSheetView("overview");

	const query = useQuery(trpc.leads.byId.queryOptions({ id: leadId }));
	const owners = useQuery(trpc.leads.owners.queryOptions());
	const lead = query.data;

	const { update, assign } = useLeadMutations(leadId);

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
	onUpdate,
	onAssign,
	saving,
}: {
	lead: Lead;
	ownerOptions: { value: string; label: string }[];
	onUpdate: (patch: Record<string, string | undefined>) => void;
	onAssign: (ownerId: string | null) => void;
	saving: boolean;
}) {
	return (
		<DetailSheetBody>
			<DetailSheetSection title="Details">
				<DetailSheetProperties>
					<InlineSelectField
						label="Stage"
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
						label="Type"
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
						label="Company"
						onSave={(next) => onUpdate({ companyName: next })}
						placeholder="Add a company"
						saving={saving}
						value={lead.companyName}
					/>

					<InlineTextCell
						label="Email"
						onSave={(next) => onUpdate({ email: next })}
						placeholder="Add an email"
						saving={saving}
						value={lead.email}
					/>

					<InlineTextCell
						label="Phone"
						onSave={(next) => onUpdate({ phone: next })}
						placeholder="Add a phone number"
						saving={saving}
						value={lead.phone}
					/>

					<InlineTextCell
						label="Country"
						onSave={(next) => onUpdate({ country: next })}
						placeholder="Add a country"
						saving={saving}
						value={lead.country}
					/>

					<InlineTextCell
						label="Source"
						onSave={(next) => onUpdate({ source: next })}
						placeholder="Add a source"
						saving={saving}
						value={lead.source}
					/>

					<DetailSheetProperty label="In this stage since">
						<LocalRelativeTime date={lead.stageChangedAt} />
					</DetailSheetProperty>

					<DetailSheetProperty label="Created">
						<LocalRelativeTime date={lead.createdAt} />
					</DetailSheetProperty>
				</DetailSheetProperties>
			</DetailSheetSection>

			<DetailSheetSection title="Notes">
				<InlineTextArea
					label="Notes"
					onSave={(next) => onUpdate({ notes: next })}
					placeholder="What matters about this lead?"
					saving={saving}
					value={lead.notes}
				/>
			</DetailSheetSection>
		</DetailSheetBody>
	);
}
