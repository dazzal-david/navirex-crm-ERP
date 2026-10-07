"use client";

import Launch from "@carbon/icons-react/es/Launch";
import { Button } from "@crm/ui/components/button";
import { Checkbox } from "@crm/ui/components/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@crm/ui/components/dialog";
import { Icon } from "@crm/ui/components/icon";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { Spinner } from "@crm/ui/components/spinner";
import { StatCardButton } from "@crm/ui/components/stat-card";
import {
	useInfiniteQuery,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useOpenRecord } from "@/components/crm/record-sheet/record-stack";
import { LocalRelativeTime } from "@/components/local-date-time";
import { LEAD_BOARD } from "@/lib/leads/board-config";
import { useTRPC } from "@/lib/trpc/client";

export function UnassignedLeadsCard({
	className,
	count,
}: {
	className: string;
	count: number;
}) {
	const [open, setOpen] = useState(false);

	return (
		<Dialog onOpenChange={setOpen} open={open}>
			<DialogTrigger asChild>
				<StatCardButton
					className={className}
					description="New leads waiting for an owner. Click to assign."
					label="Unassigned"
					value={count}
				/>
			</DialogTrigger>
			<DialogContent size="lg">
				<DialogHeader>
					<DialogTitle>Unassigned leads</DialogTitle>
					<DialogDescription>
						Active leads with no owner. Pick an owner on a row, or tick several
						and assign them together.
					</DialogDescription>
				</DialogHeader>
				{open ? <UnassignedLeadsList onClose={() => setOpen(false)} /> : null}
			</DialogContent>
		</Dialog>
	);
}

function UnassignedLeadsList({ onClose }: { onClose: () => void }) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const openRecord = useOpenRecord();
	const unassigned = useInfiniteQuery(
		trpc.leads.unassigned.infiniteQueryOptions(
			{},
			{ getNextPageParam: (page) => page.nextCursor ?? undefined },
		),
	);
	const owners = useQuery(trpc.leads.owners.queryOptions());
	const [selected, setSelected] = useState<string[]>([]);
	const [bulkOwner, setBulkOwner] = useState<string | undefined>(undefined);

	const refresh = () =>
		Promise.all([
			queryClient.invalidateQueries({
				queryKey: trpc.leads.unassigned.pathKey(),
			}),
			queryClient.invalidateQueries({
				queryKey: trpc.dashboard.leadOverview.queryKey(),
			}),
			queryClient.invalidateQueries({ queryKey: trpc.leads.board.queryKey() }),
			queryClient.invalidateQueries({
				queryKey: trpc.leads.column.pathKey(),
			}),
			queryClient.invalidateQueries({ queryKey: trpc.leads.list.pathKey() }),
		]);

	const assign = useMutation(
		trpc.leads.assign.mutationOptions({
			onSuccess: async (lead) => {
				toast.success(
					`${lead.name} assigned to ${lead.owner?.name ?? "owner"}.`,
				);
				setSelected((current) => current.filter((id) => id !== lead.id));
				await refresh();
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const assignMany = useMutation(
		trpc.leads.assignMany.mutationOptions({
			onSuccess: async (result) => {
				toast.success(
					`${result.assigned} ${result.assigned === 1 ? "lead" : "leads"} assigned.`,
				);
				setSelected([]);
				setBulkOwner(undefined);
				await refresh();
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	if (unassigned.isPending) return <Spinner aria-label="Loading leads" />;
	if (unassigned.error) {
		return (
			<p className="text-destructive text-sm">{unassigned.error.message}</p>
		);
	}

	const leads = unassigned.data.pages.flatMap((page) => page.leads);
	const total = unassigned.data.pages[0]?.total ?? leads.length;
	const ownerOptions = owners.data ?? [];
	const allSelected = leads.length > 0 && selected.length === leads.length;
	const busy = assign.isPending || assignMany.isPending;

	if (leads.length === 0) {
		return (
			<p className="text-muted-foreground text-sm">
				Every active lead has an owner.
			</p>
		);
	}

	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-wrap items-center gap-2 rounded-lg border p-2">
				<Checkbox
					aria-label="Select every lead shown"
					checked={allSelected}
					onCheckedChange={(checked) =>
						setSelected(checked === true ? leads.map((lead) => lead.id) : [])
					}
				/>
				<span className="text-muted-foreground text-sm">
					{selected.length > 0
						? `${selected.length} selected`
						: `${total} unassigned`}
				</span>
				<div className="ml-auto flex flex-wrap items-center gap-2">
					<Select onValueChange={setBulkOwner} value={bulkOwner}>
						<SelectTrigger aria-label="Owner for the selected leads" size="sm">
							<SelectValue placeholder="Assign selected to…" />
						</SelectTrigger>
						<SelectContent>
							{ownerOptions.map((owner) => (
								<SelectItem key={owner.id} value={owner.id}>
									{owner.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<Button
						disabled={selected.length === 0 || !bulkOwner || busy}
						onClick={() => {
							if (bulkOwner)
								assignMany.mutate({ ids: selected, ownerId: bulkOwner });
						}}
						size="sm"
					>
						{assignMany.isPending ? <Spinner data-icon="inline-start" /> : null}
						Assign
					</Button>
				</div>
			</div>

			<ul className="flex flex-col divide-y rounded-lg border">
				{leads.map((lead) => {
					const checked = selected.includes(lead.id);
					return (
						<li className="flex flex-wrap items-center gap-3 p-3" key={lead.id}>
							<Checkbox
								aria-label={`Select ${lead.name}`}
								checked={checked}
								onCheckedChange={(next) =>
									setSelected((current) =>
										next === true
											? [...current, lead.id]
											: current.filter((id) => id !== lead.id),
									)
								}
							/>
							<div className="flex min-w-40 flex-1 flex-col">
								<span className="truncate font-medium text-sm">
									{lead.name}
								</span>
								<span className="truncate text-muted-foreground text-xs">
									{[lead.companyName, LEAD_BOARD.label[lead.stage], lead.source]
										.filter(Boolean)
										.join(" · ")}{" "}
									· <LocalRelativeTime date={lead.createdAt} />
								</span>
							</div>
							<Select
								disabled={busy}
								onValueChange={(ownerId) =>
									assign.mutate({ id: lead.id, ownerId })
								}
							>
								<SelectTrigger aria-label={`Owner for ${lead.name}`} size="sm">
									<SelectValue placeholder="Assign to…" />
								</SelectTrigger>
								<SelectContent>
									{ownerOptions.map((owner) => (
										<SelectItem key={owner.id} value={owner.id}>
											{owner.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<Button
								aria-label={`Open ${lead.name}`}
								onClick={() => {
									onClose();
									openRecord({ kind: "lead", id: lead.id });
								}}
								size="icon-sm"
								variant="ghost"
							>
								<Icon icon={Launch} />
							</Button>
						</li>
					);
				})}
			</ul>

			{unassigned.hasNextPage ? (
				<Button
					className="self-center"
					disabled={unassigned.isFetchingNextPage}
					onClick={() => void unassigned.fetchNextPage()}
					size="sm"
					variant="outline"
				>
					{unassigned.isFetchingNextPage ? (
						<Spinner data-icon="inline-start" />
					) : null}
					Load more ({leads.length} of {total} shown)
				</Button>
			) : null}
		</div>
	);
}
