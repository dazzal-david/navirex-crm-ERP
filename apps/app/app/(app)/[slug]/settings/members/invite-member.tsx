"use client";

import Add from "@carbon/icons-react/es/Add";
import Copy from "@carbon/icons-react/es/Copy";
import { Button } from "@crm/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@crm/ui/components/dialog";
import { Field, FieldGroup, FieldLabel } from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import { LocalRelativeTime } from "@/components/local-date-time";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

const INVITE_ROLE_LABEL = {
	member: "Staff",
	manager: "Manager",
	admin: "Superadmin",
} as const;

type InviteRole = keyof typeof INVITE_ROLE_LABEL;

async function copy(text: string, done: string) {
	try {
		await navigator.clipboard.writeText(text);
		toast.success(done);
	} catch {
		toast.error("Could not copy the link.");
	}
}

export function InviteMember() {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const emailId = useId();
	const roleId = useId();

	const [open, setOpen] = useState(false);
	const [role, setRole] = useState<InviteRole>("member");
	const [link, setLink] = useState<string | null>(null);

	const invite = useMutation(
		trpc.invitations.invite.mutationOptions({
			onSuccess: async (result) => {
				await cache.workspace();
				setLink(result.link);
				toast.success(
					result.emailed
						? `Invitation emailed to ${result.email}.`
						: "Invitation created. Email is not configured, so copy the link.",
				);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	function reset(next: boolean) {
		setOpen(next);
		if (!next) {
			setLink(null);
			setRole("member");
			invite.reset();
		}
	}

	return (
		<div className="flex flex-col justify-between gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-center">
			<div>
				<p className="font-medium text-sm">Invite employees</p>
				<p className="text-muted-foreground text-sm">
					Access is by invitation only. Each link works once, for one email
					address.
				</p>
			</div>
			<Dialog open={open} onOpenChange={reset}>
				<DialogTrigger asChild>
					<Button size="sm">
						<Add data-icon="inline-start" />
						Invite member
					</Button>
				</DialogTrigger>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Invite an employee</DialogTitle>
						<DialogDescription>
							They get an email with a one-time link to create their account.
						</DialogDescription>
					</DialogHeader>

					{link ? (
						<div className="flex flex-col gap-2">
							<p className="text-muted-foreground text-sm">
								You can also send this link yourself:
							</p>
							<div className="break-all rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs">
								{link}
							</div>
							<DialogFooter>
								<Button
									onClick={() => copy(link, "Invitation link copied.")}
									type="button"
									variant="outline"
								>
									<Copy data-icon="inline-start" />
									Copy link
								</Button>
								<Button onClick={() => reset(false)} type="button">
									Done
								</Button>
							</DialogFooter>
						</div>
					) : (
						<form
							className="flex flex-col gap-4"
							onSubmit={(event) => {
								event.preventDefault();
								const email = String(
									new FormData(event.currentTarget).get("email") ?? "",
								).trim();
								invite.mutate({ email, role });
							}}
						>
							<FieldGroup>
								<Field>
									<FieldLabel htmlFor={emailId}>Email</FieldLabel>
									<Input
										autoFocus
										id={emailId}
										name="email"
										placeholder="name@navirex.in"
										required
										type="email"
									/>
								</Field>
								<Field>
									<FieldLabel htmlFor={roleId}>Role</FieldLabel>
									<Select
										onValueChange={(value) => setRole(value as InviteRole)}
										value={role}
									>
										<SelectTrigger id={roleId} className="w-full">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{(Object.keys(INVITE_ROLE_LABEL) as InviteRole[]).map(
												(value) => (
													<SelectItem key={value} value={value}>
														{INVITE_ROLE_LABEL[value]}
													</SelectItem>
												),
											)}
										</SelectContent>
									</Select>
								</Field>
							</FieldGroup>
							<DialogFooter>
								<Button disabled={invite.isPending} type="submit">
									{invite.isPending ? (
										<Spinner data-icon="inline-start" />
									) : null}
									Send invitation
								</Button>
							</DialogFooter>
						</form>
					)}
				</DialogContent>
			</Dialog>
		</div>
	);
}

export function PendingInvitations() {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const invitations = useQuery(trpc.invitations.list.queryOptions());

	const revoke = useMutation(
		trpc.invitations.revoke.mutationOptions({
			onSuccess: async () => {
				await cache.workspace();
				toast.success("Invitation revoked.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const rows = invitations.data ?? [];
	if (rows.length === 0) return null;

	return (
		<div className="flex flex-col gap-2 rounded-lg border bg-card p-4">
			<p className="font-medium text-sm">Pending invitations</p>
			<ul className="flex flex-col divide-y">
				{rows.map((row) => (
					<li
						className="flex items-center justify-between gap-3 py-2 text-sm"
						key={row.id}
					>
						<span className="min-w-0 truncate">
							{row.email}
							<span className="text-muted-foreground">
								{" "}
								· {INVITE_ROLE_LABEL[row.role]} · invited by {row.invitedBy} ·
								expires <LocalRelativeTime date={row.expiresAt} />
							</span>
						</span>
						<Button
							disabled={revoke.isPending}
							onClick={() => revoke.mutate({ id: row.id })}
							size="sm"
							variant="outline"
						>
							Revoke
						</Button>
					</li>
				))}
			</ul>
		</div>
	);
}
