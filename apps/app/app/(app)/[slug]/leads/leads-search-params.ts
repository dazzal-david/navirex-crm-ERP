import {
	createLoader,
	parseAsBoolean,
	parseAsString,
	parseAsStringLiteral,
} from "nuqs/server";
import { LEAD_BOARD } from "@/lib/leads/board-config";

export const leadFilterParsers = {
	q: parseAsString.withDefault(""),
	entity: parseAsStringLiteral(LEAD_BOARD.entities),
	kind: parseAsStringLiteral(LEAD_BOARD.kinds),
	owner: parseAsString.withDefault(""),
	mine: parseAsBoolean.withDefault(false),
};

export type LeadFilters = {
	q?: string;
	entity?: (typeof LEAD_BOARD.entities)[number];
	kind?: (typeof LEAD_BOARD.kinds)[number];
	ownerId?: string;
	mine?: boolean;
};

type LeadFilterValues = {
	q: string;
	entity: (typeof LEAD_BOARD.entities)[number] | null;
	kind: (typeof LEAD_BOARD.kinds)[number] | null;
	owner: string;
	mine: boolean;
};

export const loadLeadSearchParams = createLoader(leadFilterParsers);

export function toLeadFilters(values: LeadFilterValues): LeadFilters {
	const q = values.q.trim();
	const filters: LeadFilters = {};
	if (q) filters.q = q;
	if (values.entity) filters.entity = values.entity;
	if (values.kind) filters.kind = values.kind;
	if (values.owner && !values.mine) filters.ownerId = values.owner;
	if (values.mine) filters.mine = true;
	return filters;
}
