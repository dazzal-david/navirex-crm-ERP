"use client";

import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardAction,
	CardDescription,
	CardHeader,
	CardPanel,
	CardPanelEmpty,
	CardTitle,
} from "@crm/ui/components/card";
import type { ChartConfig } from "@crm/ui/components/chart";
import {
	ChartCard,
	DashboardGrid,
	DashboardRow,
	DashboardSection,
	KpiCard,
} from "@crm/ui/components/dashboard";
import {
	SimpleTable,
	type SimpleTableColumn,
	SimpleTableRow,
} from "@crm/ui/components/simple-table";
import { Skeleton } from "@crm/ui/components/skeleton";
import { StatCard } from "@crm/ui/components/stat-card";
import {
	StatusIndicator,
	type StatusTone,
} from "@crm/ui/components/status-indicator";
import { TableCell } from "@crm/ui/components/table";
import { formatCount } from "@crm/ui/lib/format";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useQueryState } from "nuqs";
import type { CSSProperties } from "react";
import { useOpenRecord } from "@/components/crm/record-sheet/record-stack";
import { AreaTrend, DonutStat } from "@/components/dashboard-charts";
import { LocalRelativeTime } from "@/components/local-date-time";
import { activityLabel } from "@/lib/activity-presentation";
import { LEAD_BOARD } from "@/lib/leads/board-config";
import { SEARCH_PARAM } from "@/lib/search-param-keys";
import { useTRPC } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";
import { overviewParsers } from "./overview-search-params";

const CELL = "px-3 py-2.5 align-middle";
const LEAD_COLUMNS: SimpleTableColumn[] = [
	{ id: "lead", header: "Lead" },
	{ id: "stage", header: "Status", width: "w-32" },
	{
		id: "activity",
		header: "Last activity",
		width: "w-28",
		align: "right",
	},
];
const UPDATE_COLUMNS: SimpleTableColumn[] = [
	{ id: "update", header: "Update" },
	{ id: "lead", header: "Lead", width: "w-44" },
	{ id: "when", header: "When", width: "w-24", align: "right" },
];
const TREND_CONFIG: ChartConfig = {
	created: { label: "New leads", color: "var(--chart-1)" },
};
const SOURCE_COLORS = [
	"var(--chart-1)",
	"var(--chart-2)",
	"var(--chart-3)",
	"var(--chart-4)",
	"var(--chart-5)",
] as const;
const LOADING_CARDS = ["total", "new", "attention", "unassigned"] as const;
const SUMMARY_CARD_STYLE = [
	"bg-gradient-to-br from-emerald-50 to-background dark:from-emerald-950/30",
	"bg-gradient-to-br from-sky-50 to-background dark:from-sky-950/30",
	"bg-gradient-to-br from-amber-50 to-background dark:from-amber-950/30",
	"bg-gradient-to-br from-violet-50 to-background dark:from-violet-950/30",
] as const;
const STAGE_CARD_STYLE = [
	"border-amber-200/70 bg-amber-50/60 dark:border-amber-900/60 dark:bg-amber-950/20",
	"border-sky-200/70 bg-sky-50/60 dark:border-sky-900/60 dark:bg-sky-950/20",
	"border-violet-200/70 bg-violet-50/60 dark:border-violet-900/60 dark:bg-violet-950/20",
	"border-emerald-200/70 bg-emerald-50/60 dark:border-emerald-900/60 dark:bg-emerald-950/20",
	"border-rose-200/70 bg-rose-50/60 dark:border-rose-900/60 dark:bg-rose-950/20",
	"border-green-200/70 bg-green-50/60 dark:border-green-900/60 dark:bg-green-950/20",
] as const;
const STAGE_TONE = {
	UNASSIGNED: "warning",
	ASSIGNED: "neutral",
	TALKING: "info",
	INTERESTED: "primary",
	REJECTED: "error",
	APPROVED: "success",
} satisfies Record<(typeof LEAD_BOARD.stages)[number], StatusTone>;

export function DashboardSummary() {
	const trpc = useTRPC();
	const openRecord = useOpenRecord();
	const workspaceUrl = useWorkspaceUrl();
	const [scope] = useQueryState(
		SEARCH_PARAM.overview.scope,
		overviewParsers[SEARCH_PARAM.overview.scope],
	);
	const summaryQuery = useQuery({
		...trpc.dashboard.leadOverview.queryOptions({ scope }),
		placeholderData: (previous) => previous,
	});
	const summary = summaryQuery.data;

	if (!summary) return <DashboardLoading />;

	const sourceSlices = summary.sources.map((source, index) => ({
		key: `source-${index}`,
		label: source.source,
		value: source.count,
		color: SOURCE_COLORS[index % SOURCE_COLORS.length] ?? SOURCE_COLORS[0],
	}));
	const hasTrend = summary.trend.some((point) => point.created > 0);
	const weekDelta = changeDelta(
		summary.totals.newThisWeek,
		summary.totals.newPreviousWeek,
	);

	return (
		<div className="flex flex-col gap-8">
			<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
				<StatCard
					className={`rounded-2xl border shadow-sm ${SUMMARY_CARD_STYLE[0]}`}
					label="Total leads"
					value={summary.totals.all}
					description={`${formatCount(summary.totals.active, "lead")} still active`}
				/>
				<StatCard
					className={`rounded-2xl border shadow-sm ${SUMMARY_CARD_STYLE[1]}`}
					label="New this week"
					value={summary.totals.newThisWeek}
					delta={weekDelta}
					description={`${summary.totals.newPreviousWeek} in the previous seven days`}
				/>
				<StatCard
					className={`rounded-2xl border shadow-sm ${SUMMARY_CARD_STYLE[2]}`}
					label="Needs attention"
					value={summary.totals.needsAttention}
					description="Active leads without activity for seven days"
				/>
				<StatCard
					className={`rounded-2xl border shadow-sm ${SUMMARY_CARD_STYLE[3]}`}
					label="Unassigned"
					value={summary.totals.unassigned}
					description="New leads waiting for an owner"
				/>
			</div>

			<DashboardSection
				title="Lead status"
				description="Every lead stage across the current dashboard scope"
				action={
					<Button asChild variant="outline" size="sm">
						<Link href={workspaceUrl("/leads")}>Open board</Link>
					</Button>
				}
			>
				<DashboardGrid columns={3}>
					{summary.stages.map((stage, index) => (
						<KpiCard
							className={`rounded-2xl shadow-sm ${STAGE_CARD_STYLE[index] ?? ""}`}
							key={stage.stage}
							title={LEAD_BOARD.label[stage.stage]}
						>
							<div className="flex items-end justify-between gap-4">
								<span className="font-medium text-3xl tracking-tight tabular-nums">
									{stage.count}
								</span>
								<StatusIndicator
									tone={STAGE_TONE[stage.stage]}
									size="sm"
									label={percentage(stage.count, summary.totals.all)}
								/>
							</div>
							<Progress value={stage.count} total={summary.totals.all} />
						</KpiCard>
					))}
				</DashboardGrid>
			</DashboardSection>

			<DashboardRow split="hero">
				<ChartCard
					className="overflow-hidden rounded-2xl bg-card shadow-sm"
					title="Lead intake"
					description="New leads received during the last fourteen days"
					footer={`${formatCount(summary.totals.newThisWeek, "lead")} received this week`}
				>
					{hasTrend ? (
						<AreaTrend
							data={summary.trend}
							config={TREND_CONFIG}
							xKey="label"
							height={220}
							variant="gradient"
							bloom="low"
							formatValue={(value) => formatCount(Number(value), "lead")}
						/>
					) : (
						<EmptyChart label="No leads arrived during this period" />
					)}
				</ChartCard>

				<ChartCard
					className="overflow-hidden rounded-2xl bg-gradient-to-br from-card to-sky-50/60 shadow-sm dark:to-sky-950/20"
					title="Lead sources"
					description="Where current leads entered the CRM"
				>
					{sourceSlices.length > 0 ? (
						<div className="flex flex-col gap-3 px-5 md:px-6">
							<DonutStat
								data={sourceSlices}
								height={160}
								centerValue={summary.totals.all}
								centerLabel="leads"
							/>
							<ul className="flex flex-col">
								{sourceSlices.map((source) => (
									<li
										key={source.key}
										className="flex items-center gap-2 border-t py-2 text-xs first:border-t-0"
									>
										<span
											aria-hidden
											className="size-1.5 shrink-0"
											style={{ backgroundColor: source.color }}
										/>
										<span className="min-w-0 flex-1 truncate">
											{source.label}
										</span>
										<span className="tabular-nums text-muted-foreground">
											{source.value}
										</span>
									</li>
								))}
							</ul>
						</div>
					) : (
						<EmptyChart label="No source data yet" />
					)}
				</ChartCard>
			</DashboardRow>

			<div className="grid gap-6 @4xl/page-content:grid-cols-2">
				<Card className="min-w-0 rounded-2xl border bg-card p-5 shadow-sm">
					<CardHeader>
						<CardTitle>Needs attention</CardTitle>
						<CardDescription>
							Old active leads and{" "}
							{formatCount(summary.overdueTasks.length, "overdue task")}
						</CardDescription>
						<CardAction>
							<Button asChild variant="contrast" size="sm">
								<Link href={workspaceUrl("/leads")}>Review leads</Link>
							</Button>
						</CardAction>
					</CardHeader>
					<CardPanel>
						{summary.priorityLeads.length === 0 ? (
							<CardPanelEmpty>No active leads need attention.</CardPanelEmpty>
						) : (
							<SimpleTable
								variant="panel"
								surface="page"
								columns={LEAD_COLUMNS}
							>
								{summary.priorityLeads.map((lead) => (
									<SimpleTableRow
										key={lead.id}
										clickable
										onClick={() => openRecord({ kind: "lead", id: lead.id })}
									>
										<TableCell className={CELL}>
											<span className="flex min-w-0 flex-col">
												<span className="truncate font-medium">
													{lead.name}
												</span>
												<span className="truncate text-muted-foreground">
													{lead.companyName ?? lead.owner?.name ?? "No company"}
												</span>
											</span>
										</TableCell>
										<TableCell className={CELL}>
											<StatusIndicator
												tone={STAGE_TONE[lead.stage]}
												size="sm"
												label={LEAD_BOARD.label[lead.stage]}
											/>
										</TableCell>
										<TableCell
											className={`${CELL} text-right text-muted-foreground`}
										>
											{lead.lastActivityAt ? (
												<LocalRelativeTime date={lead.lastActivityAt} />
											) : (
												"Never"
											)}
										</TableCell>
									</SimpleTableRow>
								))}
							</SimpleTable>
						)}
					</CardPanel>
				</Card>

				<Card className="min-w-0 rounded-2xl border bg-card p-5 shadow-sm">
					<CardHeader>
						<CardTitle>Important updates</CardTitle>
						<CardDescription>
							Recent notes, tasks, and status changes
						</CardDescription>
					</CardHeader>
					<CardPanel>
						{summary.recentUpdates.length === 0 ? (
							<CardPanelEmpty>No lead updates yet.</CardPanelEmpty>
						) : (
							<SimpleTable
								variant="panel"
								surface="page"
								columns={UPDATE_COLUMNS}
							>
								{summary.recentUpdates.map((update) => (
									<SimpleTableRow
										key={update.id}
										clickable
										onClick={() =>
											openRecord({ kind: "lead", id: update.lead.id })
										}
									>
										<TableCell className={CELL}>
											<span className="flex min-w-0 flex-col">
												<span className="truncate">
													{update.subject ??
														update.body ??
														activityLabel(update.type)}
												</span>
												<span className="truncate text-muted-foreground">
													{update.createdBy.name}
												</span>
											</span>
										</TableCell>
										<TableCell className={CELL}>
											<span className="truncate">{update.lead.name}</span>
										</TableCell>
										<TableCell
											className={`${CELL} text-right text-muted-foreground`}
										>
											<LocalRelativeTime date={update.createdAt} />
										</TableCell>
									</SimpleTableRow>
								))}
							</SimpleTable>
						)}
					</CardPanel>
				</Card>
			</div>

			<DashboardSection
				title="Navirex coverage"
				description="Lead distribution across operating entities"
			>
				<div className="grid overflow-hidden rounded-2xl border bg-gradient-to-r from-emerald-50/70 via-background to-amber-50/70 shadow-sm sm:grid-cols-3 sm:[&>*+*]:border-l dark:from-emerald-950/20 dark:to-amber-950/20">
					{summary.entities.map((entity) => (
						<StatCard
							key={entity.entity ?? "unassigned"}
							label={
								entity.entity
									? LEAD_BOARD.entityName[entity.entity]
									: "Entity not selected"
							}
							value={entity.count}
							description={percentage(entity.count, summary.totals.all)}
						/>
					))}
				</div>
			</DashboardSection>
		</div>
	);
}

function Progress({ value, total }: { value: number; total: number }) {
	const width = total === 0 ? 0 : Math.round((value / total) * 100);
	return (
		<div className="h-1.5 overflow-hidden bg-muted">
			<div
				className="h-full bg-primary"
				style={
					{
						"--progress": `${width}%`,
						width: "var(--progress)",
					} as CSSProperties
				}
			/>
		</div>
	);
}

function EmptyChart({ label }: { label: string }) {
	return (
		<div className="flex h-56 items-center justify-center px-6 text-center text-muted-foreground text-sm">
			{label}
		</div>
	);
}

function DashboardLoading() {
	return (
		<div className="flex flex-col gap-6" aria-busy="true">
			<div className="grid gap-px border bg-border sm:grid-cols-2 xl:grid-cols-4">
				{LOADING_CARDS.map((card) => (
					<div key={card} className="flex flex-col gap-3 bg-background p-6">
						<Skeleton className="h-4 w-24" />
						<Skeleton className="h-8 w-14" />
						<Skeleton className="h-3 w-36" />
					</div>
				))}
			</div>
			<Skeleton className="h-64 w-full rounded-lg" />
			<Skeleton className="h-72 w-full rounded-lg" />
		</div>
	);
}

function changeDelta(current: number, previous: number) {
	if (previous === 0) return undefined;
	const value = Math.round(((current - previous) / previous) * 100);
	return {
		value: `${value >= 0 ? "+" : ""}${value}%`,
		direction: value > 0 ? "up" : value < 0 ? "down" : "neutral",
		label: "vs. prior week",
	} as const;
}

function percentage(value: number, total: number): string {
	return total === 0
		? "0% of leads"
		: `${Math.round((value / total) * 100)}% of leads`;
}
