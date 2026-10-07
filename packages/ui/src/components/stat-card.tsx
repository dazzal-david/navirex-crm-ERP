import { cn } from "@crm/ui/lib/utils";
import type * as React from "react";

type TrendDirection = "up" | "down" | "neutral";

type StatDelta = {
	value: string;
	direction?: TrendDirection;
	label?: string;
};

const TREND_COLOR: Record<TrendDirection, string> = {
	up: "text-success",
	down: "text-destructive",
	neutral: "text-muted-foreground",
};

const TREND_GLYPH: Record<TrendDirection, string> = {
	up: "↑",
	down: "↓",
	neutral: "→",
};

function inferDirection(value: string): TrendDirection {
	if (value.trim().startsWith("-")) return "down";
	if (value.trim().startsWith("+")) return "up";
	return "neutral";
}

function StatDeltaText({
	delta,
	className,
}: {
	delta: StatDelta;
	className?: string;
}) {
	const direction = delta.direction ?? inferDirection(delta.value);
	return (
		<span className={cn("inline-flex items-baseline gap-1.5", className)}>
			<span
				className={cn(
					"inline-flex items-baseline gap-0.5 font-medium text-xs tabular-nums",
					TREND_COLOR[direction],
				)}
			>
				{direction !== "neutral" ? (
					<span aria-hidden>{TREND_GLYPH[direction]}</span>
				) : null}
				{delta.value}
			</span>
			{delta.label ? (
				<span className="text-muted-foreground text-xs">{delta.label}</span>
			) : null}
		</span>
	);
}

type StatCardBody = {
	label?: React.ReactNode;
	value: React.ReactNode;
	delta?: StatDelta;
	description?: React.ReactNode;
	children?: React.ReactNode;
};

function StatCardContent({
	label,
	value,
	delta,
	description,
	children,
}: StatCardBody) {
	return (
		<>
			{label != null ? (
				<span className="truncate text-sm font-medium text-muted-foreground">
					{label}
				</span>
			) : null}
			<div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
				<span className="font-medium text-3xl tracking-tight tabular-nums">
					{value}
				</span>
				{delta ? <StatDeltaText delta={delta} /> : null}
			</div>
			{description ? (
				<p className="text-pretty text-muted-foreground text-xs/relaxed">
					{description}
				</p>
			) : null}
			{children}
		</>
	);
}

function StatCard({
	label,
	value,
	delta,
	description,
	className,
	children,
	...props
}: Omit<React.ComponentProps<"div">, "title"> & StatCardBody) {
	return (
		<div
			data-slot="stat-card"
			className={cn("flex flex-col gap-2.5 p-4 md:p-6", className)}
			{...props}
		>
			<StatCardContent
				delta={delta}
				description={description}
				label={label}
				value={value}
			>
				{children}
			</StatCardContent>
		</div>
	);
}

function StatCardButton({
	label,
	value,
	delta,
	description,
	className,
	children,
	...props
}: Omit<React.ComponentProps<"button">, "title" | "value"> & StatCardBody) {
	return (
		<button
			data-slot="stat-card"
			type="button"
			className={cn(
				"flex cursor-pointer flex-col gap-2.5 p-4 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:ring-[3px] focus-visible:ring-ring/50 md:p-6",
				className,
			)}
			{...props}
		>
			<StatCardContent
				delta={delta}
				description={description}
				label={label}
				value={value}
			>
				{children}
			</StatCardContent>
		</button>
	);
}

export type { StatDelta, TrendDirection };
export { StatCard, StatCardButton, StatDeltaText };
