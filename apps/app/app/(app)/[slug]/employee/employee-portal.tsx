"use client";

import Add from "@carbon/icons-react/es/Add";
import Calendar from "@carbon/icons-react/es/Calendar";
import Security from "@carbon/icons-react/es/Security";
import UserProfile from "@carbon/icons-react/es/UserProfile";
import Wallet from "@carbon/icons-react/es/Wallet";
import { authClient } from "@crm/auth/client";
import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@crm/ui/components/field";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import { PersonAvatar } from "@crm/ui/components/person-avatar";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@crm/ui/components/sheet";
import { Textarea } from "@crm/ui/components/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";

const ROLE_LABEL = {
	owner: "Founder",
	admin: "Superadmin",
	manager: "Manager",
	member: "Staff",
} as const;

export function EmployeePortal() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const me = useQuery(trpc.people.me.queryOptions());
	const reimbursements = useQuery(trpc.people.myReimbursements.queryOptions());
	const [open, setOpen] = useState(false);
	const [section, setSection] = useState<"overview" | "security">("overview");
	const submit = useMutation(
		trpc.people.submitReimbursement.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: trpc.people.myReimbursements.queryKey(),
				});
				setOpen(false);
				toast.success("Reimbursement submitted.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const profile = me.data?.profile;
	const claims = reimbursements.data ?? [];
	const openClaims = claims.filter(
		(item) => item.status === "SUBMITTED" || item.status === "APPROVED",
	).length;
	return (
		<div className="flex flex-col gap-6">
			<nav
				className="flex w-fit rounded-xl border bg-card p-1 shadow-xs"
				aria-label="Employee portal sections"
			>
				<Button
					onClick={() => setSection("overview")}
					size="sm"
					variant={section === "overview" ? "default" : "ghost"}
				>
					<Icon icon={UserProfile} data-icon="inline-start" />
					Overview
				</Button>
				<Button
					onClick={() => setSection("security")}
					size="sm"
					variant={section === "security" ? "default" : "ghost"}
				>
					<Icon icon={Security} data-icon="inline-start" />
					Account security
				</Button>
			</nav>

			{section === "security" ? (
				<div className="max-w-2xl">
					<PasswordCard />
				</div>
			) : (
				<>
					<section className="relative overflow-hidden rounded-[2rem] border bg-gradient-to-br from-emerald-50 via-background to-amber-100/70 p-6 shadow-sm dark:from-emerald-950/40 dark:via-background dark:to-amber-950/30 md:p-8">
						<div
							aria-hidden
							className="absolute -top-24 -right-20 size-64 rounded-full border border-amber-300/30"
						/>
						<div
							aria-hidden
							className="absolute -top-10 -right-10 size-40 rounded-full border border-emerald-300/30"
						/>
						<div className="relative flex flex-col gap-8">
							<div className="flex items-center gap-4">
								<PersonAvatar
									name={profile?.name}
									src={profile?.image}
									size="lg"
								/>
								<div className="min-w-0">
									<p className="font-medium text-emerald-800 text-xs uppercase tracking-[0.2em] dark:text-emerald-300">
										Employee self-service
									</p>
									<h2 className="truncate font-medium text-3xl tracking-tight md:text-4xl">
										Welcome, {profile?.name?.split(" ")[0] ?? "there"}
									</h2>
									<p className="mt-1 text-muted-foreground text-sm">
										{profile?.employeeCode ?? "Employee"} ·{" "}
										{profile?.designation ??
											ROLE_LABEL[profile?.role ?? "member"]}
									</p>
								</div>
							</div>
							<div className="grid gap-px overflow-hidden rounded-2xl border bg-border sm:grid-cols-2 lg:grid-cols-4">
								<PortalStat
									label="Employee code"
									value={profile?.employeeCode ?? "Not set"}
								/>
								<PortalStat
									label="Department"
									value={profile?.department ?? "Not set"}
								/>
								<PortalStat
									label="Manager"
									value={profile?.managerName ?? "Not set"}
								/>
								<PortalStat label="Open claims" value={String(openClaims)} />
							</div>
						</div>
					</section>

					<div className="grid gap-6 lg:grid-cols-[0.9fr_minmax(0,1.6fr)]">
						<Card className="rounded-2xl border bg-card p-5 shadow-sm">
							<CardHeader>
								<CardTitle className="text-base">Your profile</CardTitle>
								<CardDescription>
									Employment and contact information.
								</CardDescription>
							</CardHeader>
							<CardContent className="grid gap-5 rounded-2xl border-0 bg-muted/30 text-sm sm:grid-cols-2 lg:grid-cols-1">
								<Row label="Email" value={profile?.email} />
								<Row label="Location" value={profile?.location} />
								<Row label="Employment type" value={profile?.employmentType} />
								<Row
									label="Joined"
									value={
										profile?.joinedAt
											? new Date(profile.joinedAt).toLocaleDateString()
											: null
									}
								/>
							</CardContent>
						</Card>

						<Card className="rounded-2xl border bg-card p-5 shadow-sm">
							<div className="flex items-center justify-between gap-3">
								<div>
									<CardTitle className="text-base">Reimbursements</CardTitle>
									<CardDescription className="mt-1 block">
										Track requests from submission through payment.
									</CardDescription>
								</div>
								<Sheet open={open} onOpenChange={setOpen}>
									<SheetTrigger asChild>
										<Button size="sm">
											<Add data-icon="inline-start" />
											New request
										</Button>
									</SheetTrigger>
									<SheetContent>
										<SheetHeader>
											<SheetTitle>New reimbursement</SheetTitle>
											<SheetDescription>
												Submit an expense for manager review.
											</SheetDescription>
										</SheetHeader>
										<form
											id="reimbursement"
											className="overflow-y-auto px-4"
											onSubmit={(event) => {
												event.preventDefault();
												const data = new FormData(event.currentTarget);
												const value = (name: string) =>
													String(data.get(name) ?? "").trim();
												submit.mutate({
													title: value("title"),
													description: value("description") || undefined,
													amount: value("amount"),
													currency: "INR",
													expenseDate: new Date(
														`${value("expenseDate")}T00:00:00`,
													),
													receiptUrl: value("receiptUrl") || undefined,
												});
											}}
										>
											<FieldGroup>
												<Field>
													<FieldLabel htmlFor="expense-title">
														Expense
													</FieldLabel>
													<Input id="expense-title" name="title" required />
												</Field>
												<Field>
													<FieldLabel htmlFor="expense-amount">
														Amount (INR)
													</FieldLabel>
													<Input
														id="expense-amount"
														name="amount"
														inputMode="decimal"
														required
													/>
												</Field>
												<Field>
													<FieldLabel htmlFor="expense-date">
														Expense date
													</FieldLabel>
													<Input
														id="expense-date"
														name="expenseDate"
														type="date"
														required
													/>
												</Field>
												<Field>
													<FieldLabel htmlFor="receipt-url">
														Receipt link
													</FieldLabel>
													<Input
														id="receipt-url"
														name="receiptUrl"
														type="url"
													/>
												</Field>
												<Field>
													<FieldLabel htmlFor="expense-description">
														Details
													</FieldLabel>
													<Textarea
														id="expense-description"
														name="description"
														rows={5}
													/>
												</Field>
											</FieldGroup>
										</form>
										<SheetFooter>
											<Button
												type="submit"
												form="reimbursement"
												disabled={submit.isPending}
											>
												Submit request
											</Button>
										</SheetFooter>
									</SheetContent>
								</Sheet>
							</div>
							<div className="mt-2 overflow-hidden rounded-2xl border bg-muted/15">
								{reimbursements.data?.length ? (
									reimbursements.data.map((item) => (
										<div
											className="flex items-center justify-between gap-4 border-b p-4 transition-colors hover:bg-muted/40 last:border-b-0"
											key={item.id}
										>
											<div className="flex min-w-0 items-center gap-3">
												<div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
													<Icon icon={Wallet} />
												</div>
												<div className="min-w-0">
													<p className="truncate font-medium text-sm">
														{item.title}
													</p>
													<p className="text-muted-foreground text-xs">
														{new Date(item.expenseDate).toLocaleDateString()} ·{" "}
														{item.currency} {item.amount}
													</p>
												</div>
											</div>
											<Badge
												variant={item.status === "PAID" ? "default" : "outline"}
											>
												{item.status}
											</Badge>
										</div>
									))
								) : (
									<p className="p-6 text-center text-muted-foreground text-sm">
										No reimbursement requests yet.
									</p>
								)}
							</div>
						</Card>
					</div>
				</>
			)}
		</div>
	);
}

function PortalStat({ label, value }: { label: string; value: string }) {
	return (
		<div className="bg-background/80 p-4 backdrop-blur-sm">
			<p className="text-muted-foreground text-xs uppercase tracking-wider">
				{label}
			</p>
			<p className="mt-2 truncate font-medium text-xl tracking-tight">
				{value}
			</p>
		</div>
	);
}

const MIN_PASSWORD_LENGTH = 12;

function PasswordCard() {
	const [pending, setPending] = useState(false);

	async function changePassword(form: HTMLFormElement) {
		const data = new FormData(form);
		const currentPassword = String(data.get("currentPassword") ?? "");
		const newPassword = String(data.get("newPassword") ?? "");
		const confirmation = String(data.get("confirmation") ?? "");

		if (newPassword !== confirmation) {
			toast.error("The new passwords do not match.");
			setPending(false);
			return;
		}

		const { error } = await authClient.changePassword({
			currentPassword,
			newPassword,
			revokeOtherSessions: true,
		});

		if (error) {
			toast.error(error.message ?? "Password could not be changed.");
			setPending(false);
			return;
		}

		form.reset();
		setPending(false);
		toast.success("Password changed. Other sessions were signed out.");
	}

	return (
		<Card className="rounded-2xl border bg-card p-5 shadow-sm">
			<CardHeader>
				<div className="mb-2 flex size-11 items-center justify-center rounded-xl bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300">
					<Icon icon={Security} />
				</div>
				<CardTitle className="text-lg">Account security</CardTitle>
				<CardDescription>Change your CRM password.</CardDescription>
			</CardHeader>
			<CardContent className="rounded-2xl bg-muted/20">
				<form
					className="flex flex-col gap-4"
					onSubmit={(event) => {
						event.preventDefault();
						setPending(true);
						changePassword(event.currentTarget).catch(() => {
							setPending(false);
							toast.error("Password could not be changed.");
						});
					}}
				>
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor="current-password">
								Current password
							</FieldLabel>
							<Input
								autoComplete="current-password"
								id="current-password"
								name="currentPassword"
								required
								type="password"
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor="new-password">New password</FieldLabel>
							<Input
								autoComplete="new-password"
								id="new-password"
								minLength={MIN_PASSWORD_LENGTH}
								name="newPassword"
								required
								type="password"
							/>
							<FieldDescription>
								Use at least {MIN_PASSWORD_LENGTH} characters.
							</FieldDescription>
						</Field>
						<Field>
							<FieldLabel htmlFor="confirm-password">
								Confirm new password
							</FieldLabel>
							<Input
								autoComplete="new-password"
								id="confirm-password"
								minLength={MIN_PASSWORD_LENGTH}
								name="confirmation"
								required
								type="password"
							/>
						</Field>
					</FieldGroup>
					<Button disabled={pending} type="submit">
						{pending ? "Changing…" : "Change password"}
					</Button>
					<p className="text-muted-foreground text-xs">
						Microsoft-only accounts use their Microsoft password.
					</p>
				</form>
			</CardContent>
		</Card>
	);
}

function Row({ label, value }: { label: string; value?: string | null }) {
	return (
		<div className="flex items-start gap-3">
			<div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-background text-muted-foreground shadow-xs">
				<Icon icon={Calendar} size="sm" />
			</div>
			<div className="min-w-0">
				<p className="text-muted-foreground text-xs">{label}</p>
				<p className="truncate">{value || "Not set"}</p>
			</div>
		</div>
	);
}
