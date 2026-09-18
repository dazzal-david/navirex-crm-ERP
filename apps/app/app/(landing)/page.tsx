import ArrowRight from "@carbon/icons-react/es/ArrowRight";
import ChartLine from "@carbon/icons-react/es/ChartLine";
import Email from "@carbon/icons-react/es/Email";
import Flow from "@carbon/icons-react/es/Flow";
import UserMultiple from "@carbon/icons-react/es/UserMultiple";
import { Button } from "@crm/ui/components/button";
import Logo from "@crm/ui/components/logo";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
	title: "Internal CRM",
	description:
		"The internal Navirex workspace for leads, communications, automations, and team operations.",
};

const workspaceAreas = [
	{
		title: "Lead pipeline",
		description: "Capture, qualify, and progress every opportunity.",
		icon: ChartLine,
	},
	{
		title: "Communications",
		description: "Keep email, WhatsApp, and notes in one timeline.",
		icon: Email,
	},
	{
		title: "Automations",
		description: "Route new leads and trigger timely follow-ups.",
		icon: Flow,
	},
	{
		title: "Employee portal",
		description: "Manage staff profiles and reimbursement requests.",
		icon: UserMultiple,
	},
] as const;

export default function Home() {
	return (
		<div className="relative flex min-h-svh flex-col overflow-hidden bg-background text-foreground">
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_0%,var(--primary),transparent_34%)] opacity-[0.07]"
			/>

			<header className="relative border-border border-b">
				<nav className="mx-auto flex h-20 w-full max-w-7xl items-center justify-between px-6 lg:px-10">
					<Link
						href="/"
						aria-label="Navirex CRM home"
						className="flex items-center gap-3"
					>
						<Logo className="h-10 w-11 shrink-0" />
						<span className="flex flex-col">
							<span className="font-semibold text-base/5 tracking-tight">
								Navirex
							</span>
							<span className="text-muted-foreground text-xs/4">CRM</span>
						</span>
					</Link>

					<div className="flex items-center gap-4">
						<span className="hidden items-center gap-2 text-muted-foreground text-xs/4 sm:flex">
							<span className="size-1.5 rounded-full bg-primary" />
							Internal workspace
						</span>
						<Button asChild variant="outline" size="lg">
							<Link href="/sign-in">Sign in</Link>
						</Button>
					</div>
				</nav>
			</header>

			<main className="relative flex flex-1 items-center py-16 sm:py-20 lg:py-24">
				<section className="mx-auto grid w-full max-w-7xl items-center gap-14 px-6 lg:grid-cols-[minmax(0,1fr)_minmax(420px,520px)] lg:gap-20 lg:px-10">
					<div className="flex max-w-2xl flex-col items-start">
						<div className="mb-7 inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 font-mono text-muted-foreground text-xs/4 uppercase tracking-wide">
							<span className="size-1.5 rounded-full bg-primary" />
							Navirex internal operations
						</div>

						<h1 className="max-w-[12ch] text-balance font-semibold text-5xl/[1.04] tracking-[-0.045em] sm:text-6xl/[1.02] lg:text-7xl/[1.02]">
							One workspace for every lead conversation.
						</h1>

						<p className="mt-7 max-w-xl text-pretty text-lg/7 text-muted-foreground">
							Manage lead intake, customer communication, follow-ups, and team
							operations across Navirex from one focused workspace.
						</p>

						<div className="mt-9 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
							<Button asChild size="xl">
								<Link href="/sign-in">
									Sign in to Navirex CRM
									<ArrowRight data-icon="inline-end" />
								</Link>
							</Button>
							<p className="text-muted-foreground text-xs/5">
								Authorized Navirex team members only
							</p>
						</div>
					</div>

					<div className="overflow-hidden rounded-lg border border-border bg-background">
						<div className="flex items-center justify-between border-border border-b px-5 py-4">
							<div>
								<p className="font-medium text-sm/5">Navirex workspace</p>
								<p className="text-muted-foreground text-xs/4">
									Connected lead operations
								</p>
							</div>
							<span className="rounded-md border border-border px-2.5 py-1 text-muted-foreground text-xs/4">
								Secure access
							</span>
						</div>

						<div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
							{workspaceAreas.map((area) => {
								const AreaIcon = area.icon;

								return (
									<div
										key={area.title}
										className="flex min-h-40 flex-col justify-between bg-background p-5"
									>
										<div className="flex size-9 items-center justify-center rounded-md border border-border text-primary">
											<AreaIcon aria-hidden="true" className="size-4" />
										</div>
										<div className="mt-8">
											<h2 className="font-medium text-sm/5">{area.title}</h2>
											<p className="mt-1 max-w-[28ch] text-muted-foreground text-xs/5">
												{area.description}
											</p>
										</div>
									</div>
								);
							})}
						</div>

						<div className="flex items-center gap-3 border-border border-t px-5 py-4">
							<div className="flex -space-x-2" aria-hidden="true">
								<span className="flex size-7 items-center justify-center rounded-full border-2 border-background bg-muted font-medium text-[10px]">
									FO
								</span>
								<span className="flex size-7 items-center justify-center rounded-full border-2 border-background bg-muted font-medium text-[10px]">
									MG
								</span>
								<span className="flex size-7 items-center justify-center rounded-full border-2 border-background bg-muted font-medium text-[10px]">
									ST
								</span>
							</div>
							<p className="text-muted-foreground text-xs/5">
								Role-based access for every team member
							</p>
						</div>
					</div>
				</section>
			</main>

			<footer className="relative border-border border-t">
				<div className="mx-auto flex w-full max-w-7xl flex-col gap-2 px-6 py-5 text-muted-foreground text-xs/4 sm:flex-row sm:items-center sm:justify-between lg:px-10">
					<p>Navirex CRM · Internal business system</p>
					<p>Protected access · Activity is monitored</p>
				</div>
			</footer>
		</div>
	);
}
