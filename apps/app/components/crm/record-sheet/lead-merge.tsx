"use client";

import Merge from "@carbon/icons-react/es/Merge";
import { Alert, AlertDescription, AlertTitle } from "@crm/ui/components/alert";
import { Button } from "@crm/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@crm/ui/components/dialog";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDeferredValue, useState } from "react";
import { toast } from "sonner";
import { LEAD_BOARD } from "@/lib/leads/board-config";
import { useTRPC } from "@/lib/trpc/client";
import { useRecordStack } from "./record-stack";

type Target = { id: string; name: string; companyName: string | null };

function useMergeLead() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const { replaceTop } = useRecordStack();
	return useMutation(
		trpc.leads.merge.mutationOptions({
			onSuccess: async (result) => {
				toast.success("Leads merged.");
				replaceTop({ kind: "lead", id: result.leadId });
				await Promise.all([
					queryClient.invalidateQueries({ queryKey: trpc.leads.pathKey() }),
					queryClient.invalidateQueries({
						queryKey: trpc.communications.pathKey(),
					}),
					queryClient.invalidateQueries({
						queryKey: trpc.dashboard.leadOverview.queryKey(),
					}),
					queryClient.invalidateQueries({
						queryKey: trpc.activities.pathKey(),
					}),
				]);
			},
			onError: (error) => toast.error(error.message),
		}),
	);
}

function confirmMerge(source: string, target: Target): boolean {
	return window.confirm(
		`Merge ${source} into ${target.name}${target.companyName ? ` (${target.companyName})` : ""}?\n\n${source} becomes a contact on that lead. Notes and messages move with them. This lead is archived. The other lead keeps its owner and status.`,
	);
}

export function SameCompanyNotice({
	leadId,
	leadName,
}: {
	leadId: string;
	leadName: string;
}) {
	const trpc = useTRPC();
	const matches = useQuery(trpc.leads.sameCompany.queryOptions({ id: leadId }));
	const merge = useMergeLead();
	const others = matches.data ?? [];
	if (others.length === 0) return null;

	return (
		<Alert>
			<Icon icon={Merge} />
			<AlertTitle>
				Same company as{" "}
				{others.length === 1 ? "another lead" : `${others.length} other leads`}
			</AlertTitle>
			<AlertDescription>
				<ul className="flex flex-col gap-2">
					{others.map((other) => (
						<li className="flex flex-wrap items-center gap-2" key={other.id}>
							<span className="min-w-0 flex-1">
								{other.name} · {LEAD_BOARD.label[other.stage]} ·{" "}
								{other.owner?.name ?? "Unassigned"}
							</span>
							<Button
								disabled={merge.isPending}
								onClick={() => {
									if (confirmMerge(leadName, other)) {
										merge.mutate({ sourceId: leadId, targetId: other.id });
									}
								}}
								size="sm"
								variant="outline"
							>
								Merge into this lead
							</Button>
						</li>
					))}
				</ul>
			</AlertDescription>
		</Alert>
	);
}

export function MergeLeadButton({
	leadId,
	leadName,
}: {
	leadId: string;
	leadName: string;
}) {
	const trpc = useTRPC();
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const search = useDeferredValue(query.trim());
	const results = useQuery({
		...trpc.leads.list.queryOptions({ q: search }),
		enabled: open && search.length >= 2,
	});
	const merge = useMergeLead();
	const candidates = (results.data?.leads ?? []).filter(
		(lead) => lead.id !== leadId,
	);

	return (
		<Dialog onOpenChange={setOpen} open={open}>
			<DialogTrigger asChild>
				<Button size="sm" variant="outline">
					<Icon data-icon="inline-start" icon={Merge} />
					Merge
				</Button>
			</DialogTrigger>
			<DialogContent size="md">
				<DialogHeader>
					<DialogTitle>Merge {leadName} into another lead</DialogTitle>
					<DialogDescription>
						Use this when two leads are the same company. {leadName} becomes a
						contact on the lead you pick, with their notes and messages.
					</DialogDescription>
				</DialogHeader>
				<Input
					aria-label="Search leads"
					autoFocus
					onChange={(event) => setQuery(event.target.value)}
					placeholder="Search by company, name, phone or email"
					value={query}
				/>
				{search.length < 2 ? (
					<p className="text-muted-foreground text-sm">
						Type at least two letters.
					</p>
				) : results.isPending ? (
					<Spinner aria-label="Searching" />
				) : candidates.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						No other lead matches.
					</p>
				) : (
					<ul className="flex flex-col divide-y rounded-lg border">
						{candidates.map((lead) => (
							<li
								className="flex flex-wrap items-center gap-2 p-3"
								key={lead.id}
							>
								<div className="flex min-w-0 flex-1 flex-col">
									<span className="truncate font-medium text-sm">
										{lead.companyName ?? lead.name}
									</span>
									<span className="truncate text-muted-foreground text-xs">
										{lead.name} · {LEAD_BOARD.label[lead.stage]} ·{" "}
										{lead.owner?.name ?? "Unassigned"}
									</span>
								</div>
								<Button
									disabled={merge.isPending}
									onClick={() => {
										if (confirmMerge(leadName, lead)) {
											merge.mutate(
												{ sourceId: leadId, targetId: lead.id },
												{ onSuccess: () => setOpen(false) },
											);
										}
									}}
									size="sm"
								>
									Merge into
								</Button>
							</li>
						))}
					</ul>
				)}
			</DialogContent>
		</Dialog>
	);
}
