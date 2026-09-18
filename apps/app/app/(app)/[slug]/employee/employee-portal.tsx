"use client";

import Add from "@carbon/icons-react/es/Add";
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
import { Input } from "@crm/ui/components/input";
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
	return (
		<div className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
			<div className="flex flex-col gap-6">
				<Card>
					<CardHeader>
						<CardTitle>{profile?.name}</CardTitle>
						<CardDescription>
							{profile?.designation ?? ROLE_LABEL[profile?.role ?? "member"]}
						</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col gap-3 text-sm">
						<Row label="Email" value={profile?.email} />
						<Row label="Employee code" value={profile?.employeeCode} />
						<Row label="Department" value={profile?.department} />
						<Row label="Location" value={profile?.location} />
						<Row label="Manager" value={profile?.managerName} />
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
				<PasswordCard />
			</div>
			<div className="flex min-w-0 flex-col gap-4">
				<div className="flex items-center justify-between gap-3">
					<div>
						<h2 className="font-medium text-lg">Reimbursements</h2>
						<p className="text-muted-foreground text-sm">
							Track requests from submission through payment.
						</p>
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
										expenseDate: new Date(`${value("expenseDate")}T00:00:00`),
										receiptUrl: value("receiptUrl") || undefined,
									});
								}}
							>
								<FieldGroup>
									<Field>
										<FieldLabel htmlFor="expense-title">Expense</FieldLabel>
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
										<FieldLabel htmlFor="expense-date">Expense date</FieldLabel>
										<Input
											id="expense-date"
											name="expenseDate"
											type="date"
											required
										/>
									</Field>
									<Field>
										<FieldLabel htmlFor="receipt-url">Receipt link</FieldLabel>
										<Input id="receipt-url" name="receiptUrl" type="url" />
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
				<div className="overflow-hidden rounded-lg border bg-card">
					{reimbursements.data?.length ? (
						reimbursements.data.map((item) => (
							<div
								className="flex items-center justify-between gap-4 border-b p-4 last:border-b-0"
								key={item.id}
							>
								<div className="min-w-0">
									<p className="truncate font-medium text-sm">{item.title}</p>
									<p className="text-muted-foreground text-xs">
										{new Date(item.expenseDate).toLocaleDateString()} ·{" "}
										{item.currency} {item.amount}
									</p>
								</div>
								<Badge variant={item.status === "PAID" ? "default" : "outline"}>
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
			</div>
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
		<Card>
			<CardHeader>
				<CardTitle>Account security</CardTitle>
				<CardDescription>Change your CRM password.</CardDescription>
			</CardHeader>
			<CardContent>
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
		<div>
			<p className="text-muted-foreground text-xs">{label}</p>
			<p>{value || "Not set"}</p>
		</div>
	);
}
