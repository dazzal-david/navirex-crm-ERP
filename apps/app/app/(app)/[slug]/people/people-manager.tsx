"use client";

import { Badge } from "@crm/ui/components/badge";
import { Button } from "@crm/ui/components/button";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@crm/ui/components/tabs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";

const ROLE_LABEL = {
	owner: "Founder",
	admin: "Superadmin",
	manager: "Manager",
	member: "Staff",
} as const;

export function PeopleManager() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const directory = useQuery(trpc.people.directory.queryOptions());
	const reimbursements = useQuery(trpc.people.reimbursements.queryOptions());
	const refresh = () =>
		queryClient.invalidateQueries({
			queryKey: trpc.people.reimbursements.queryKey(),
		});
	const review = useMutation(
		trpc.people.reviewReimbursement.mutationOptions({
			onSuccess: refresh,
			onError: (error) => toast.error(error.message),
		}),
	);
	const paid = useMutation(
		trpc.people.markReimbursementPaid.mutationOptions({
			onSuccess: refresh,
			onError: (error) => toast.error(error.message),
		}),
	);
	return (
		<Tabs defaultValue="directory">
			<TabsList variant="line">
				<TabsTrigger value="directory">Staff directory</TabsTrigger>
				<TabsTrigger value="reimbursements">Reimbursements</TabsTrigger>
			</TabsList>
			<TabsContent value="directory">
				<div className="overflow-hidden rounded-lg border bg-card">
					{directory.data?.map((person) => (
						<div
							className="grid gap-2 border-b p-4 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_10rem_10rem] sm:items-center"
							key={person.userId}
						>
							<div>
								<p className="font-medium text-sm">{person.name}</p>
								<p className="text-muted-foreground text-xs">{person.email}</p>
							</div>
							<div className="text-sm">
								<p>{person.designation ?? "No designation"}</p>
								<p className="text-muted-foreground text-xs">
									{person.department ?? "No department"}
								</p>
							</div>
							<Badge className="w-fit" variant="outline">
								{ROLE_LABEL[person.role]}
							</Badge>
						</div>
					))}
				</div>
			</TabsContent>
			<TabsContent value="reimbursements">
				<div className="overflow-hidden rounded-lg border bg-card">
					{reimbursements.data?.length ? (
						reimbursements.data.map((item) => (
							<div
								className="flex flex-col gap-3 border-b p-4 last:border-b-0 md:flex-row md:items-center"
								key={item.id}
							>
								<div className="min-w-0 flex-1">
									<p className="font-medium text-sm">{item.title}</p>
									<p className="text-muted-foreground text-xs">
										{item.employeeName} ·{" "}
										{new Date(item.expenseDate).toLocaleDateString()} ·{" "}
										{item.currency} {item.amount}
									</p>
								</div>
								<Badge
									className="w-fit"
									variant={item.status === "PAID" ? "default" : "outline"}
								>
									{item.status}
								</Badge>
								{item.status === "SUBMITTED" ? (
									<div className="flex gap-2">
										<Button
											size="sm"
											variant="outline"
											onClick={() =>
												review.mutate({ id: item.id, decision: "REJECTED" })
											}
										>
											Reject
										</Button>
										<Button
											size="sm"
											onClick={() =>
												review.mutate({ id: item.id, decision: "APPROVED" })
											}
										>
											Approve
										</Button>
									</div>
								) : null}
								{item.status === "APPROVED" ? (
									<Button
										size="sm"
										onClick={() => paid.mutate({ id: item.id })}
									>
										Mark paid
									</Button>
								) : null}
							</div>
						))
					) : (
						<p className="p-6 text-center text-muted-foreground text-sm">
							No reimbursement requests.
						</p>
					)}
				</div>
			</TabsContent>
		</Tabs>
	);
}
