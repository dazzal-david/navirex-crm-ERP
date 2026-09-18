"use client";

import Building from "@carbon/icons-react/es/Building";
import Chat from "@carbon/icons-react/es/Chat";
import Close from "@carbon/icons-react/es/Close";
import Dashboard from "@carbon/icons-react/es/Dashboard";
import Group from "@carbon/icons-react/es/Group";
import Employee from "@carbon/icons-react/es/Identification";
import Partnership from "@carbon/icons-react/es/Partnership";
import Plug from "@carbon/icons-react/es/Plug";
import Settings from "@carbon/icons-react/es/Settings";
import UserMultiple from "@carbon/icons-react/es/UserMultiple";
import { Button } from "@crm/ui/components/button";
import type { CarbonIcon } from "@crm/ui/components/icon";
import { Icon } from "@crm/ui/components/icon";
import Bot from "@crm/ui/components/icons/bot";
import Logo from "@crm/ui/components/logo";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@crm/ui/components/sheet";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { AgentBuilderSidebar } from "@/components/agent-builder/agent-builder-sidebar";
import { usePrefetchSection } from "@/components/crm/section-prefetch";
import { useMobileNav } from "@/components/mobile-nav";
import { useTRPC } from "@/lib/trpc/client";
import { useHydrated } from "@/lib/use-hydrated";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

type RailItem = {
	title: string;
	href: string;
	icon: CarbonIcon;
	iconClassName?: string;
	match: "exact" | "prefix";
	related?: string[];
	group: "primary" | "utility";
	requiresPeopleManager?: boolean;
};

const ITEMS: RailItem[] = [
	{
		title: "Dashboard",
		href: "/",
		icon: Dashboard,
		match: "exact",
		group: "primary",
	},
	{
		title: "Leads",
		href: "/leads",
		icon: Partnership,
		match: "prefix",
		group: "primary",
	},
	{
		title: "Communications",
		href: "/communications",
		icon: Chat,
		match: "prefix",
		group: "primary",
	},
	{
		title: "Contacts",
		href: "/contacts",
		icon: UserMultiple,
		match: "prefix",
		group: "primary",
	},
	{
		title: "Companies",
		href: "/companies",
		icon: Building,
		match: "prefix",
		group: "primary",
	},
	{
		title: "Automations",
		href: "/agents",
		icon: Bot,
		iconClassName: "size-5",
		match: "prefix",
		related: ["/agents"],
		group: "primary",
	},
	{
		title: "Human resources",
		href: "/people",
		icon: Group,
		match: "prefix",
		group: "utility",
		requiresPeopleManager: true,
	},
	{
		title: "Connections",
		href: "/settings/connections",
		icon: Plug,
		match: "prefix",
		group: "utility",
	},
	{
		title: "Settings",
		href: "/settings",
		icon: Settings,
		match: "exact",
		group: "utility",
	},
	{
		title: "Employee portal",
		href: "/employee",
		icon: Employee,
		match: "prefix",
		group: "utility",
	},
];

function isActive(item: RailItem, pathname: string): boolean {
	return (
		pathname === item.href ||
		(item.match === "prefix" && pathname.startsWith(item.href)) ||
		Boolean(item.related?.some((prefix) => pathname.startsWith(prefix)))
	);
}

function RailLink({
	item,
	active,
	onPrefetch,
}: {
	item: RailItem;
	active: boolean;
	onPrefetch: () => void;
}) {
	return (
		<Button
			asChild
			variant={active ? "default" : "ghost"}
			className="w-full justify-start gap-3 px-3"
		>
			<Link
				href={item.href}
				prefetch
				onMouseEnter={onPrefetch}
				onFocus={onPrefetch}
				aria-current={active ? "page" : undefined}
				transitionTypes={["nav-lateral"]}
			>
				<Icon icon={item.icon} className={item.iconClassName} />
				<span className="truncate">{item.title}</span>
			</Link>
		</Button>
	);
}

function MobileRailLink({
	item,
	active,
	onNavigate,
	onPrefetch,
}: {
	item: RailItem;
	active: boolean;
	onNavigate: () => void;
	onPrefetch: () => void;
}) {
	return (
		<Button
			asChild
			variant={active ? "default" : "ghost"}
			className="justify-start gap-3"
		>
			<Link
				href={item.href}
				prefetch
				onMouseEnter={onPrefetch}
				onFocus={onPrefetch}
				aria-current={active ? "page" : undefined}
				onClick={onNavigate}
				transitionTypes={[
					item.title === "Automations" ? "nav-forward" : "nav-lateral",
				]}
			>
				<Icon icon={item.icon} className={item.iconClassName} />
				<span>{item.title}</span>
			</Link>
		</Button>
	);
}

function MobileRailIconLink({
	item,
	active,
	onNavigate,
	onPrefetch,
}: {
	item: RailItem;
	active: boolean;
	onNavigate: () => void;
	onPrefetch: () => void;
}) {
	return (
		<Button asChild variant={active ? "default" : "ghost"} size="icon">
			<Link
				href={item.href}
				prefetch
				onMouseEnter={onPrefetch}
				onFocus={onPrefetch}
				aria-current={active ? "page" : undefined}
				onClick={onNavigate}
			>
				<Icon icon={item.icon} className={item.iconClassName} />
				<span className="sr-only">{item.title}</span>
			</Link>
		</Button>
	);
}

function RailBrand() {
	return (
		<div className="mb-4 flex items-center gap-3 px-2 py-2">
			<Logo className="size-8 shrink-0" />
			<div className="flex min-w-0 flex-col">
				<span className="truncate font-medium">Navirex</span>
				<span className="truncate text-muted-foreground text-xs">
					Lead operations
				</span>
			</div>
		</div>
	);
}

export function AppIconRailFallback() {
	return (
		<nav
			aria-label="Primary"
			aria-busy="true"
			className="hidden w-(--width-app-navigation) shrink-0 flex-col gap-1 border-r bg-sidebar p-3 md:flex [view-transition-name:app-rail]"
		>
			<RailBrand />
			{ITEMS.map((item) => (
				<Button
					key={item.href}
					variant="ghost"
					disabled
					className={`w-full justify-start gap-3 px-3 ${item.group === "utility" && item.title === "Connections" ? "mt-auto" : ""}`}
				>
					<Icon icon={item.icon} className={item.iconClassName} />
					<span>{item.title}</span>
				</Button>
			))}
		</nav>
	);
}

export function AppIconRail() {
	const trpc = useTRPC();
	const workspace = useQuery(trpc.workspace.get.queryOptions());
	const hydrated = useHydrated();
	const pathname = usePathname();
	const workspaceUrl = useWorkspaceUrl();
	const { open, setOpen } = useMobileNav();
	const prefetchSection = usePrefetchSection();
	const items = useMemo(
		() =>
			ITEMS.filter(
				(item) =>
					!item.requiresPeopleManager ||
					(hydrated && workspace.data?.canManageEmployees),
			).map((item) => ({
				...item,
				section: item.href,
				href: workspaceUrl(item.href),
				related: item.related?.map((path) => workspaceUrl(path)),
			})),
		[hydrated, workspace.data?.canManageEmployees, workspaceUrl],
	);
	const inChat = items.some(
		(item) => item.title === "Automations" && isActive(item, pathname),
	);
	const primaryItems = items.filter((item) => item.group === "primary");
	const utilityItems = items.filter((item) => item.group === "utility");

	return (
		<>
			<nav
				aria-label="Primary"
				className="hidden w-(--width-app-navigation) shrink-0 flex-col gap-1 border-r bg-sidebar p-3 md:flex [view-transition-name:app-rail]"
			>
				<RailBrand />
				{primaryItems.map((item) => (
					<RailLink
						key={item.href}
						item={item}
						active={isActive(item, pathname)}
						onPrefetch={() => prefetchSection(item.section)}
					/>
				))}
				<div className="mt-auto flex flex-col gap-1">
					{utilityItems.map((item) => (
						<RailLink
							key={item.href}
							item={item}
							active={isActive(item, pathname)}
							onPrefetch={() => prefetchSection(item.section)}
						/>
					))}
				</div>
			</nav>

			<Sheet open={open} onOpenChange={setOpen}>
				{inChat ? (
					<SheetContent
						side="left"
						showCloseButton={false}
						className="w-5/6 max-w-sm flex-row gap-0 p-0"
					>
						<SheetHeader className="sr-only">
							<SheetTitle>Navigation and agent chats</SheetTitle>
						</SheetHeader>
						<nav
							aria-label="Primary"
							className="flex w-14 shrink-0 flex-col items-center gap-1 border-r py-3"
						>
							<Button
								variant="ghost"
								size="icon"
								aria-label="Close navigation"
								onClick={() => setOpen(false)}
							>
								<Icon icon={Close} />
							</Button>
							<div className="my-1 h-px w-5 bg-border" />
							{items.map((item) => (
								<MobileRailIconLink
									key={item.href}
									item={item}
									active={isActive(item, pathname)}
									onNavigate={() => setOpen(false)}
									onPrefetch={() => prefetchSection(item.section)}
								/>
							))}
						</nav>
						<AgentBuilderSidebar
							className="flex flex-1"
							onNavigate={() => setOpen(false)}
						/>
					</SheetContent>
				) : (
					<SheetContent side="left" className="w-64 gap-0 p-0">
						<SheetHeader>
							<SheetTitle>Navigation</SheetTitle>
						</SheetHeader>
						<nav
							aria-label="Primary"
							className="flex flex-1 flex-col gap-1 p-2"
						>
							{items.map((item) => (
								<MobileRailLink
									key={item.href}
									item={item}
									active={isActive(item, pathname)}
									onNavigate={() => setOpen(false)}
									onPrefetch={() => prefetchSection(item.section)}
								/>
							))}
						</nav>
					</SheetContent>
				)}
			</Sheet>
		</>
	);
}
