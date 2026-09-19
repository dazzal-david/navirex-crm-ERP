"use client";

import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import { PersonAvatar } from "@crm/ui/components/person-avatar";
import { Spinner } from "@crm/ui/components/spinner";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@crm/ui/components/table";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useDeferredValue } from "react";
import { useOpenRecord } from "@/components/crm/record-sheet/record-stack";
import { LocalRelativeTime } from "@/components/local-date-time";
import { LEAD_BOARD } from "@/lib/leads/board-config";
import { useTRPC } from "@/lib/trpc/client";
import { useLeadFilters } from "./lead-filters";

const STAGE_STYLE = {
	UNASSIGNED:
		"border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
	ASSIGNED:
		"border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300",
	TALKING:
		"border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300",
	INTERESTED:
		"border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300",
	REJECTED:
		"border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300",
	APPROVED:
		"border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300",
} as const;

export function LeadList() {
	const trpc = useTRPC();
	const openRecord = useOpenRecord();
	const { filters: urlFilters } = useLeadFilters();
	const deferredQuery = useDeferredValue(urlFilters.q);
	const filters = { ...urlFilters };
	if (deferredQuery) filters.q = deferredQuery;
	else delete filters.q;

	const query = useInfiniteQuery(
		trpc.leads.list.infiniteQueryOptions(filters, {
			getNextPageParam: (page) => page.nextCursor,
		}),
	);
	const leads = query.data?.pages.flatMap((page) => page.leads) ?? [];
	const total = query.data?.pages[0]?.total ?? 0;

	if (query.isPending) {
		return (
			<div className="flex min-h-72 items-center justify-center rounded-2xl border bg-card">
				<Spinner />
			</div>
		);
	}

	if (query.isError) {
		return (
			<p className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5 text-destructive text-sm">
				The lead list did not load. {query.error.message}
			</p>
		);
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border bg-card shadow-sm">
			<div className="flex shrink-0 items-center justify-between border-b bg-muted/30 px-5 py-3">
				<p className="font-medium text-sm">All leads</p>
				<p className="text-muted-foreground text-xs tabular-nums">
					{total} records
				</p>
			</div>
			<Table containerClassName="min-h-0 flex-1 overflow-auto overscroll-none">
				<TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur-sm">
					<TableRow>
						<TableHead className="w-[24%] px-5">Lead</TableHead>
						<TableHead>Company</TableHead>
						<TableHead>Status</TableHead>
						<TableHead>Contact</TableHead>
						<TableHead>Owner</TableHead>
						<TableHead className="pr-5 text-right">Last activity</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{leads.map((lead) => (
						<TableRow
							className="cursor-pointer"
							key={lead.id}
							onClick={() => openRecord({ kind: "lead", id: lead.id })}
						>
							<TableCell className="px-5 py-3.5">
								<div className="flex min-w-0 items-center gap-3">
									<PersonAvatar name={lead.name} size="sm" />
									<div className="min-w-0">
										<p className="truncate font-medium text-sm">{lead.name}</p>
										<p className="truncate text-muted-foreground text-xs">
											{lead.source ?? LEAD_BOARD.kind[lead.kind]}
										</p>
									</div>
								</div>
							</TableCell>
							<TableCell>{lead.companyName ?? "—"}</TableCell>
							<TableCell>
								<Badge className={STAGE_STYLE[lead.stage]} variant="outline">
									{LEAD_BOARD.label[lead.stage]}
								</Badge>
							</TableCell>
							<TableCell>
								<div className="max-w-52">
									<p className="truncate">{lead.phone ?? "—"}</p>
									{lead.email ? (
										<p className="truncate text-muted-foreground text-xs">
											{lead.email}
										</p>
									) : null}
								</div>
							</TableCell>
							<TableCell>
								{lead.owner ? (
									<div className="flex items-center gap-2">
										<PersonAvatar
											name={lead.owner.name}
											size="sm"
											src={lead.owner.image}
										/>
										<span className="truncate">{lead.owner.name}</span>
									</div>
								) : (
									<span className="text-muted-foreground">Unassigned</span>
								)}
							</TableCell>
							<TableCell className="pr-5 text-right text-muted-foreground">
								{lead.lastActivityAt ? (
									<LocalRelativeTime date={lead.lastActivityAt} />
								) : (
									"Never"
								)}
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
			{leads.length === 0 ? (
				<p className="p-12 text-center text-muted-foreground text-sm">
					No leads match these filters.
				</p>
			) : null}
			{query.hasNextPage ? (
				<div className="flex justify-center border-t p-3">
					<Button
						disabled={query.isFetchingNextPage}
						onClick={() => void query.fetchNextPage()}
						size="sm"
						variant="outline"
					>
						{query.isFetchingNextPage ? (
							<Spinner data-icon="inline-start" />
						) : null}
						Load more
					</Button>
				</div>
			) : null}
		</div>
	);
}
