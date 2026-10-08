"use client";

import Add from "@carbon/icons-react/es/Add";
import Edit from "@carbon/icons-react/es/Edit";
import Star from "@carbon/icons-react/es/Star";
import TrashCan from "@carbon/icons-react/es/TrashCan";
import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@crm/ui/components/dialog";
import { Field, FieldGroup, FieldLabel } from "@crm/ui/components/field";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";
import { PhoneInput } from "@/components/crm/phone-input";
import { useTRPC } from "@/lib/trpc/client";

type ContactRow = {
	id: string;
	name: string;
	designation: string | null;
	phone: string | null;
	email: string | null;
};

type Editing = { mode: "add" } | { mode: "edit"; contact: ContactRow };

export function LeadContacts({
	leadId,
	main,
}: {
	leadId: string;
	main: Omit<ContactRow, "id">;
}) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const contacts = useQuery(trpc.leads.contactsOf.queryOptions({ id: leadId }));
	const [editing, setEditing] = useState<Editing | null>(null);

	const refresh = () =>
		Promise.all([
			queryClient.invalidateQueries({
				queryKey: trpc.leads.contactsOf.queryKey({ id: leadId }),
			}),
			queryClient.invalidateQueries({
				queryKey: trpc.leads.byId.queryKey({ id: leadId }),
			}),
			queryClient.invalidateQueries({
				queryKey: trpc.communications.recipients.queryKey({ leadId }),
			}),
			queryClient.invalidateQueries({ queryKey: trpc.leads.board.queryKey() }),
			queryClient.invalidateQueries({
				queryKey: trpc.leads.column.pathKey(),
			}),
			queryClient.invalidateQueries({ queryKey: trpc.leads.list.pathKey() }),
		]);

	const remove = useMutation(
		trpc.leads.removeContact.mutationOptions({
			onSuccess: async () => {
				toast.success("Contact removed.");
				await refresh();
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const makePrimary = useMutation(
		trpc.leads.makePrimaryContact.mutationOptions({
			onSuccess: async () => {
				toast.success("Main contact changed.");
				await refresh();
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const busy = remove.isPending || makePrimary.isPending;

	return (
		<div className="flex flex-col gap-2">
			<ul className="flex flex-col divide-y rounded-lg border">
				<ContactLine contact={main}>
					<Badge variant="secondary">Main</Badge>
				</ContactLine>
				{(contacts.data ?? []).map((contact) => (
					<ContactLine contact={contact} key={contact.id}>
						<Button
							aria-label={`Make ${contact.name} the main contact`}
							disabled={busy}
							onClick={() => makePrimary.mutate({ id: contact.id })}
							size="icon-sm"
							title="Make main contact"
							variant="ghost"
						>
							<Icon icon={Star} />
						</Button>
						<Button
							aria-label={`Edit ${contact.name}`}
							disabled={busy}
							onClick={() => setEditing({ mode: "edit", contact })}
							size="icon-sm"
							variant="ghost"
						>
							<Icon icon={Edit} />
						</Button>
						<Button
							aria-label={`Remove ${contact.name}`}
							disabled={busy}
							onClick={() => {
								if (window.confirm(`Remove ${contact.name} from this lead?`)) {
									remove.mutate({ id: contact.id });
								}
							}}
							size="icon-sm"
							variant="ghost"
						>
							<Icon icon={TrashCan} />
						</Button>
					</ContactLine>
				))}
			</ul>
			<Button
				className="self-start"
				onClick={() => setEditing({ mode: "add" })}
				size="sm"
				variant="outline"
			>
				<Icon data-icon="inline-start" icon={Add} />
				Add contact
			</Button>
			{editing ? (
				<ContactDialog
					editing={editing}
					leadId={leadId}
					onClose={() => setEditing(null)}
					onSaved={refresh}
				/>
			) : null}
		</div>
	);
}

function ContactLine({
	contact,
	children,
}: {
	contact: Omit<ContactRow, "id">;
	children: React.ReactNode;
}) {
	return (
		<li className="flex items-start gap-3 p-3">
			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
				<span className="truncate font-medium text-sm">
					{contact.name}
					{contact.designation ? (
						<span className="font-normal text-muted-foreground">
							{" "}
							· {contact.designation}
						</span>
					) : null}
				</span>
				<span className="truncate text-muted-foreground text-xs">
					{[contact.phone, contact.email].filter(Boolean).join(" · ") ||
						"No phone or email"}
				</span>
			</div>
			<div className="flex shrink-0 items-center gap-1">{children}</div>
		</li>
	);
}

function ContactDialog({
	editing,
	leadId,
	onClose,
	onSaved,
}: {
	editing: Editing;
	leadId: string;
	onClose: () => void;
	onSaved: () => Promise<unknown>;
}) {
	const trpc = useTRPC();
	const nameId = useId();
	const designationId = useId();
	const phoneId = useId();
	const emailId = useId();
	const current = editing.mode === "edit" ? editing.contact : null;

	const done = async (message: string) => {
		toast.success(message);
		await onSaved();
		onClose();
	};

	const add = useMutation(
		trpc.leads.addContact.mutationOptions({
			onSuccess: () => done("Contact added."),
			onError: (error) => toast.error(error.message),
		}),
	);
	const update = useMutation(
		trpc.leads.updateContact.mutationOptions({
			onSuccess: () => done("Contact saved."),
			onError: (error) => toast.error(error.message),
		}),
	);
	const pending = add.isPending || update.isPending;

	return (
		<Dialog
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
			open
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{current ? "Edit contact" : "Add contact"}</DialogTitle>
					<DialogDescription>
						Another person at this company. The lead keeps one owner and one
						status.
					</DialogDescription>
				</DialogHeader>
				<form
					className="flex flex-col gap-4"
					onSubmit={(event) => {
						event.preventDefault();
						const form = new FormData(event.currentTarget);
						const text = (key: string) => String(form.get(key) ?? "").trim();
						const name = text("name");
						if (!name) return;
						const fields = {
							name,
							designation: text("designation"),
							phone: text("phone"),
							email: text("email"),
						};
						if (current) update.mutate({ id: current.id, ...fields });
						else add.mutate({ leadId, ...fields });
					}}
				>
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor={nameId}>Name *</FieldLabel>
							<Input
								autoFocus
								defaultValue={current?.name}
								id={nameId}
								name="name"
								required
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor={designationId}>
								Designation / role
							</FieldLabel>
							<Input
								defaultValue={current?.designation ?? undefined}
								id={designationId}
								name="designation"
								placeholder="e.g. Procurement head"
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor={phoneId}>Mobile number</FieldLabel>
							{current ? (
								<Input
									defaultValue={current.phone ?? undefined}
									id={phoneId}
									name="phone"
									placeholder="+91 99467 88886"
									type="tel"
								/>
							) : (
								<PhoneInput id={phoneId} label="Mobile number" name="phone" />
							)}
						</Field>
						<Field>
							<FieldLabel htmlFor={emailId}>Email</FieldLabel>
							<Input
								defaultValue={current?.email ?? undefined}
								id={emailId}
								name="email"
								placeholder="name@company.com"
								type="email"
							/>
						</Field>
					</FieldGroup>
					<DialogFooter>
						<Button disabled={pending} type="submit">
							{pending ? <Spinner data-icon="inline-start" /> : null}
							{current ? "Save contact" : "Add contact"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
