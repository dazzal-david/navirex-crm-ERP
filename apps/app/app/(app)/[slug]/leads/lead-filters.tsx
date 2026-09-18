"use client";

import Search from "@carbon/icons-react/es/Search";
import { Button } from "@crm/ui/components/button";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from "@crm/ui/components/input-group";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { Spinner } from "@crm/ui/components/spinner";
import { useQuery } from "@tanstack/react-query";
import { useQueryStates } from "nuqs";
import { LEAD_BOARD } from "@/lib/leads/board-config";
import { useTRPC } from "@/lib/trpc/client";
import { leadFilterParsers, toLeadFilters } from "./leads-search-params";

export function useLeadFilters() {
	const [values, setValues] = useQueryStates(leadFilterParsers);

	return {
		filters: toLeadFilters(values),
		setValues,
		values,
	};
}

export function LeadFilters({ loading }: { loading: boolean }) {
	const trpc = useTRPC();
	const owners = useQuery(trpc.leads.owners.queryOptions());
	const { values, setValues } = useLeadFilters();
	const ownerValue = values.mine
		? LEAD_BOARD.filter.mine
		: values.owner
			? `${LEAD_BOARD.filter.ownerPrefix}${values.owner}`
			: LEAD_BOARD.filter.all;
	const active = Boolean(
		values.q || values.entity || values.kind || values.owner || values.mine,
	);

	return (
		<div className="flex flex-wrap items-center gap-2">
			<InputGroup className="w-full sm:w-64">
				<InputGroupAddon>
					<Search />
				</InputGroupAddon>
				<InputGroupInput
					aria-label="Search leads"
					autoComplete="off"
					onChange={(event) =>
						void setValues({ q: event.target.value || null })
					}
					placeholder="Search leads…"
					value={values.q}
				/>
			</InputGroup>

			<Select
				onValueChange={(value) =>
					void setValues({
						entity:
							value === LEAD_BOARD.filter.all
								? null
								: (value as (typeof LEAD_BOARD.entities)[number]),
					})
				}
				value={values.entity ?? LEAD_BOARD.filter.all}
			>
				<SelectTrigger aria-label="Filter by Navirex entity">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value={LEAD_BOARD.filter.all}>All entities</SelectItem>
					{LEAD_BOARD.entities.map((entity) => (
						<SelectItem key={entity} value={entity}>
							{LEAD_BOARD.entityName[entity]}
						</SelectItem>
					))}
				</SelectContent>
			</Select>

			<Select
				onValueChange={(value) =>
					void setValues({
						kind:
							value === LEAD_BOARD.filter.all
								? null
								: (value as (typeof LEAD_BOARD.kinds)[number]),
					})
				}
				value={values.kind ?? LEAD_BOARD.filter.all}
			>
				<SelectTrigger aria-label="Filter by lead type">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value={LEAD_BOARD.filter.all}>All types</SelectItem>
					{LEAD_BOARD.kinds.map((kind) => (
						<SelectItem key={kind} value={kind}>
							{LEAD_BOARD.kind[kind]}
						</SelectItem>
					))}
				</SelectContent>
			</Select>

			<Select
				onValueChange={(value) => {
					if (value === LEAD_BOARD.filter.all) {
						void setValues({ mine: false, owner: null });
						return;
					}

					if (value === LEAD_BOARD.filter.mine) {
						void setValues({ mine: true, owner: null });
						return;
					}

					void setValues({
						mine: false,
						owner: value.slice(LEAD_BOARD.filter.ownerPrefix.length),
					});
				}}
				value={ownerValue}
			>
				<SelectTrigger aria-label="Filter by lead owner">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value={LEAD_BOARD.filter.all}>All owners</SelectItem>
					<SelectItem value={LEAD_BOARD.filter.mine}>My leads</SelectItem>
					{(owners.data ?? []).map((owner) => (
						<SelectItem
							key={owner.id}
							value={`${LEAD_BOARD.filter.ownerPrefix}${owner.id}`}
						>
							{owner.name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>

			{active ? (
				<Button onClick={() => void setValues(null)} size="sm" variant="ghost">
					Clear filters
				</Button>
			) : null}

			{loading ? <Spinner aria-label="Updating leads" /> : null}
		</div>
	);
}
