"use client";

import Grid from "@carbon/icons-react/es/Grid";
import List from "@carbon/icons-react/es/List";
import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import { Card, CardContent } from "@crm/ui/components/card";
import { Icon } from "@crm/ui/components/icon";
import { PersonAvatar } from "@crm/ui/components/person-avatar";
import { Skeleton } from "@crm/ui/components/skeleton";
import { Spinner } from "@crm/ui/components/spinner";
import { cn } from "@crm/ui/lib/utils";
import {
	type InfiniteData,
	type QueryKey,
	useInfiniteQuery,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { useDeferredValue, useRef, useState } from "react";
import { toast } from "sonner";
import { useOpenRecord } from "@/components/crm/record-sheet/record-stack";
import { LEAD_BOARD } from "@/lib/leads/board-config";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { LeadFilters, useLeadFilters } from "./lead-filters";
import { LeadList } from "./lead-list";
import type { LeadFilters as LeadFilterInput } from "./leads-search-params";

type LeadStage = (typeof LEAD_BOARD.stages)[number];
type BoardData = RouterOutputs["leads"]["board"];
type BoardColumn = BoardData["columns"][number];
type LeadCard = BoardColumn["leads"][number];
type ColumnPage = RouterOutputs["leads"]["column"];
type ColumnPages = InfiniteData<ColumnPage, number | null>;

type DropTarget = {
	stage: LeadStage;
	beforeId: string | null;
	afterId: string | null;
};

type ColumnSnapshot = {
	queryKey: QueryKey;
	data: ColumnPages | undefined;
};

export function LeadBoard() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const { filters: urlFilters } = useLeadFilters();
	const deferredQuery = useDeferredValue(urlFilters.q);
	const filters = { ...urlFilters };
	if (deferredQuery) filters.q = deferredQuery;
	else delete filters.q;
	const options = trpc.leads.board.queryOptions(filters);
	const board = useQuery(options);
	const [dragging, setDragging] = useState<LeadCard | null>(null);
	const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
	const [view, setView] = useState<"board" | "list">("board");

	const columnQueryKey = (stage: LeadStage) =>
		trpc.leads.column.infiniteQueryOptions(
			{ ...filters, stage },
			{ getNextPageParam },
		).queryKey;

	const move = useMutation(
		trpc.leads.move.mutationOptions({
			onMutate: async (input) => {
				await Promise.all([
					queryClient.cancelQueries({ queryKey: options.queryKey }),
					queryClient.cancelQueries({
						queryKey: trpc.leads.column.pathKey(),
					}),
				]);

				const previousBoard = queryClient.getQueryData<BoardData>(
					options.queryKey,
				);
				const previousColumns = LEAD_BOARD.stages.map((stage) => {
					const queryKey = columnQueryKey(stage);
					return {
						queryKey,
						data: queryClient.getQueryData<ColumnPages>(queryKey),
					};
				});
				const moved = findLead(input.id, previousBoard, previousColumns);

				if (!moved) return { previousBoard, previousColumns };

				const visible = isVisibleAfterMove(filters, input.stage);
				const card: LeadCard = {
					...moved,
					stage: input.stage,
					owner: input.stage === "UNASSIGNED" ? null : moved.owner,
				};

				queryClient.setQueryData<BoardData>(options.queryKey, (old) =>
					old
						? moveBoardCard(
								old,
								card,
								moved.stage,
								input.stage,
								input.afterId ?? null,
								visible,
							)
						: old,
				);

				for (const stage of LEAD_BOARD.stages) {
					const queryKey = columnQueryKey(stage);
					queryClient.setQueryData<ColumnPages>(queryKey, (old) => {
						if (!old) return old;

						const without = removeCard(old, input.id);
						return stage === input.stage && visible
							? insertCard(without, card, input.afterId ?? null)
							: without;
					});
				}

				return { previousBoard, previousColumns };
			},
			onError: (error, _input, context) => {
				if (context?.previousBoard) {
					queryClient.setQueryData(options.queryKey, context.previousBoard);
				}

				for (const snapshot of context?.previousColumns ?? []) {
					queryClient.setQueryData(snapshot.queryKey, snapshot.data);
				}

				toast.error(error.message);
			},
			onSettled: () =>
				Promise.all([
					queryClient.invalidateQueries({ queryKey: options.queryKey }),
					queryClient.invalidateQueries({
						queryKey: trpc.leads.list.pathKey(),
					}),
					queryClient.invalidateQueries({
						queryKey: trpc.leads.column.pathKey(),
					}),
					queryClient.invalidateQueries({
						queryKey: trpc.dashboard.leadOverview.queryKey(),
					}),
				]).then(() => undefined),
		}),
	);

	function drop(target: DropTarget) {
		setDropTarget(null);

		const card = dragging;
		setDragging(null);

		if (!card) return;
		if (target.beforeId === card.id || target.afterId === card.id) return;

		move.mutate({
			id: card.id,
			stage: target.stage,
			beforeId: target.beforeId,
			afterId: target.afterId,
		});
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-4">
			<div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-3 shadow-sm">
				<LeadFilters loading={board.isFetching} />
				<div className="flex rounded-lg border bg-muted/40 p-1">
					<Button
						aria-label="Board view"
						onClick={() => setView("board")}
						size="sm"
						variant={view === "board" ? "default" : "ghost"}
					>
						<Icon icon={Grid} data-icon="inline-start" />
						Board
					</Button>
					<Button
						aria-label="List view"
						onClick={() => setView("list")}
						size="sm"
						variant={view === "list" ? "default" : "ghost"}
					>
						<Icon icon={List} data-icon="inline-start" />
						List
					</Button>
				</div>
			</div>

			{view === "list" ? (
				<LeadList />
			) : board.isPending ? (
				<div className="flex gap-4 overflow-x-auto">
					{LEAD_BOARD.stages.map((stage) => (
						<Skeleton className="h-64 w-72 shrink-0 rounded-lg" key={stage} />
					))}
				</div>
			) : board.isError ? (
				<p className="text-destructive text-sm">
					The board did not load. {board.error.message}
				</p>
			) : (
				<div className="flex min-h-0 flex-1 gap-4 overflow-x-auto pb-2">
					{board.data.columns.map((column) => (
						<LeadColumn
							column={column}
							dragging={dragging}
							drop={drop}
							dropTarget={dropTarget}
							filters={filters}
							key={column.stage}
							setDragging={setDragging}
							setDropTarget={setDropTarget}
						/>
					))}
				</div>
			)}
		</div>
	);
}

function LeadColumn({
	column,
	filters,
	dragging,
	dropTarget,
	setDragging,
	setDropTarget,
	drop,
}: {
	column: BoardColumn;
	filters: LeadFilterInput;
	dragging: LeadCard | null;
	dropTarget: DropTarget | null;
	setDragging: (lead: LeadCard | null) => void;
	setDropTarget: (target: DropTarget | null) => void;
	drop: (target: DropTarget) => void;
}) {
	const trpc = useTRPC();
	const nextCursor =
		column.total > column.leads.length
			? (column.leads.at(-1)?.position ?? null)
			: null;
	const pages = useInfiniteQuery({
		...trpc.leads.column.infiniteQueryOptions(
			{ ...filters, stage: column.stage },
			{ getNextPageParam },
		),
		initialData: {
			pages: [{ leads: column.leads, nextCursor }],
			pageParams: [null],
		},
	});
	const loaded = uniqueCards(pages.data.pages.flatMap((page) => page.leads));
	const atEnd = endTarget(column.stage, loaded);
	const targetAtEnd = sameTarget(dropTarget, atEnd);
	const remaining = Math.max(0, column.total - loaded.length);

	return (
		<section
			aria-label={LEAD_BOARD.label[column.stage]}
			className={cn(
				"flex w-80 shrink-0 flex-col overflow-hidden rounded-2xl border bg-card shadow-sm",
				dropTarget?.stage === column.stage && "border-primary",
			)}
			onDragLeave={(event) => {
				const next = event.relatedTarget;
				if (!(next instanceof Node) || !event.currentTarget.contains(next)) {
					setDropTarget(null);
				}
			}}
			onDragOver={(event) => {
				event.preventDefault();
				setDropTarget(atEnd);
			}}
			onDrop={(event) => {
				event.preventDefault();
				drop(dropTarget?.stage === column.stage ? dropTarget : atEnd);
			}}
		>
			<header className="flex items-center gap-2 border-b bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-4 py-3">
				<h3 className="font-medium text-sm">
					{LEAD_BOARD.label[column.stage]}
				</h3>
				<Badge className="ml-auto" variant="secondary">
					{column.total}
				</Badge>
			</header>

			<div className="flex min-h-24 flex-1 flex-col gap-3 overflow-y-auto bg-muted/15 p-3">
				{loaded.length === 0 ? (
					<p className="p-4 text-center text-muted-foreground text-xs">
						Nothing here yet.
					</p>
				) : null}

				<ul className="flex flex-col gap-2">
					{loaded.map((lead, index) => {
						const before = {
							stage: column.stage,
							beforeId: loaded[index - 1]?.id ?? null,
							afterId: lead.id,
						} satisfies DropTarget;

						return (
							<li
								key={lead.id}
								onDragOver={(event) => {
									event.preventDefault();
									event.stopPropagation();
									setDropTarget(
										targetForPointer(event, column.stage, loaded, index),
									);
								}}
								onDrop={(event) => {
									event.preventDefault();
									event.stopPropagation();
									drop(targetForPointer(event, column.stage, loaded, index));
								}}
							>
								{sameTarget(dropTarget, before) ? <DropIndicator /> : null}
								<LeadCardView
									dragging={dragging?.id === lead.id}
									lead={lead}
									onDragEnd={() => {
										setDragging(null);
										setDropTarget(null);
									}}
									onDragStart={() => setDragging(lead)}
								/>
							</li>
						);
					})}

					{targetAtEnd ? (
						<li>
							<DropIndicator />
						</li>
					) : null}
				</ul>

				{remaining > 0 && pages.hasNextPage ? (
					<Button
						disabled={pages.isFetchingNextPage}
						onClick={() =>
							void pages.fetchNextPage().then((result) => {
								if (result.error) toast.error(result.error.message);
							})
						}
						size="sm"
						variant="ghost"
					>
						{pages.isFetchingNextPage ? (
							<Spinner data-icon="inline-start" />
						) : null}
						{remaining} more
					</Button>
				) : null}
			</div>
		</section>
	);
}

function LeadCardView({
	lead,
	dragging,
	onDragStart,
	onDragEnd,
}: {
	lead: LeadCard;
	dragging: boolean;
	onDragStart: () => void;
	onDragEnd: () => void;
}) {
	const openRecord = useOpenRecord();
	const pointer = useRef<{
		x: number;
		y: number;
		id: number;
		moved: boolean;
	} | null>(null);

	const open = () => openRecord({ kind: "lead", id: lead.id });

	return (
		<Card
			aria-grabbed={dragging}
			aria-label={`Open ${lead.name}`}
			draggable
			onClick={() => {
				const moved = pointer.current?.moved ?? false;
				pointer.current = null;
				if (!moved) open();
			}}
			onDragEnd={onDragEnd}
			onDragStart={(event) => {
				if (pointer.current) pointer.current.moved = true;
				else pointer.current = { x: 0, y: 0, id: -1, moved: true };
				event.dataTransfer.effectAllowed = "move";
				event.dataTransfer.setData("text/plain", lead.id);
				onDragStart();
			}}
			onKeyDown={(event) => {
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					open();
				}
			}}
			onPointerCancel={() => {
				pointer.current = null;
			}}
			onPointerDown={(event) => {
				if (event.button !== 0) return;
				pointer.current = {
					x: event.clientX,
					y: event.clientY,
					id: event.pointerId,
					moved: false,
				};
			}}
			onPointerMove={(event) => {
				const start = pointer.current;
				if (!start || start.id !== event.pointerId || start.moved) return;

				const x = event.clientX - start.x;
				const y = event.clientY - start.y;
				const threshold = LEAD_BOARD.pointerDragThresholdPx;
				if (x * x + y * y >= threshold * threshold) start.moved = true;
			}}
			role="button"
			tabIndex={0}
			className="rounded-xl border bg-card shadow-xs transition-[transform,box-shadow,border-color] duration-150 ease-out hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md active:scale-[0.985]"
		>
			<CardContent className="flex flex-col gap-3 rounded-xl border-0 p-4">
				<div className="flex items-start justify-between gap-2">
					<p className="truncate font-medium text-sm">{lead.name}</p>
					{lead.entity ? (
						<Badge variant="outline">{LEAD_BOARD.entity[lead.entity]}</Badge>
					) : null}
				</div>

				{lead.companyName ? (
					<p className="truncate text-muted-foreground text-xs">
						{lead.companyName}
					</p>
				) : null}

				<div className="flex items-center justify-between gap-2">
					<Badge variant="secondary">{LEAD_BOARD.kind[lead.kind]}</Badge>

					{lead.owner ? (
						<PersonAvatar
							name={lead.owner.name}
							size="sm"
							src={lead.owner.image}
						/>
					) : (
						<span className="text-muted-foreground text-xs">Unassigned</span>
					)}
				</div>
			</CardContent>
		</Card>
	);
}

function DropIndicator() {
	return (
		<div aria-hidden="true" className="mb-2 h-0.5 rounded-sm bg-primary" />
	);
}

function getNextPageParam(page: ColumnPage): number | null {
	return page.nextCursor;
}

function targetForPointer(
	event: React.DragEvent<HTMLElement>,
	stage: LeadStage,
	leads: LeadCard[],
	index: number,
): DropTarget {
	const box = event.currentTarget.getBoundingClientRect();
	const after = event.clientY >= box.top + box.height / 2;

	return after
		? {
				stage,
				beforeId: leads[index]?.id ?? null,
				afterId: leads[index + 1]?.id ?? null,
			}
		: {
				stage,
				beforeId: leads[index - 1]?.id ?? null,
				afterId: leads[index]?.id ?? null,
			};
}

function endTarget(stage: LeadStage, leads: LeadCard[]): DropTarget {
	return {
		stage,
		beforeId: leads.at(-1)?.id ?? null,
		afterId: null,
	};
}

function sameTarget(left: DropTarget | null, right: DropTarget): boolean {
	return (
		left?.stage === right.stage &&
		left.beforeId === right.beforeId &&
		left.afterId === right.afterId
	);
}

function uniqueCards(leads: LeadCard[]): LeadCard[] {
	const seen = new Set<string>();
	return leads.filter((lead) => {
		if (seen.has(lead.id)) return false;
		seen.add(lead.id);
		return true;
	});
}

function findLead(
	id: string,
	board: BoardData | undefined,
	columns: ColumnSnapshot[],
): LeadCard | undefined {
	const boardLead = board?.columns
		.flatMap((column) => column.leads)
		.find((lead) => lead.id === id);
	if (boardLead) return boardLead;

	return columns
		.flatMap((column) => column.data?.pages ?? [])
		.flatMap((page) => page.leads)
		.find((lead) => lead.id === id);
}

function isVisibleAfterMove(
	filters: LeadFilterInput,
	stage: LeadStage,
): boolean {
	return stage !== "UNASSIGNED" || (!filters.mine && !filters.ownerId);
}

function moveBoardCard(
	board: BoardData,
	card: LeadCard,
	from: LeadStage,
	to: LeadStage,
	afterId: string | null,
	visible: boolean,
): BoardData {
	return {
		...board,
		columns: board.columns.map((column) => {
			const leftSource = column.stage === from && from !== to;
			const enteredTarget = column.stage === to && from !== to && visible;
			const leads = column.leads.filter((lead) => lead.id !== card.id);

			return {
				...column,
				leads:
					column.stage === to && visible ? insert(leads, card, afterId) : leads,
				total: column.total - Number(leftSource) + Number(enteredTarget),
			};
		}),
	};
}

function removeCard(pages: ColumnPages, id: string): ColumnPages {
	return {
		...pages,
		pages: pages.pages.map((page) => ({
			...page,
			leads: page.leads.filter((lead) => lead.id !== id),
		})),
	};
}

function insertCard(
	pages: ColumnPages,
	card: LeadCard,
	afterId: string | null,
): ColumnPages {
	const pageIndex =
		afterId === null
			? pages.pages.length - 1
			: pages.pages.findIndex((page) =>
					page.leads.some((lead) => lead.id === afterId),
				);
	const targetPage = Math.max(0, pageIndex);

	return {
		...pages,
		pages: pages.pages.map((page, index) =>
			index === targetPage
				? { ...page, leads: insert(page.leads, card, afterId) }
				: page,
		),
	};
}

function insert(
	leads: LeadCard[],
	card: LeadCard,
	afterId: string | null,
): LeadCard[] {
	if (afterId === null) return [...leads, card];

	const at = leads.findIndex((lead) => lead.id === afterId);
	if (at === -1) return [...leads, card];

	return [...leads.slice(0, at), card, ...leads.slice(at)];
}
