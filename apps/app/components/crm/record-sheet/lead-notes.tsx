"use client";

import Add from "@carbon/icons-react/es/Add";
import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import { Spinner } from "@crm/ui/components/spinner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
	MentionText,
	MentionTextarea,
} from "@/components/crm/mention-textarea";
import { LocalDateTime } from "@/components/local-date-time";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

const NOTE_TIME: Intl.DateTimeFormatOptions = {
	dateStyle: "medium",
	timeStyle: "short",
};

export function LeadNotes({ leadId }: { leadId: string }) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const cache = useCrmCache();
	const [adding, setAdding] = useState(false);
	const [draft, setDraft] = useState("");
	const [mentions, setMentions] = useState<string[]>([]);

	const notes = useQuery(trpc.communications.notes.queryOptions({ leadId }));

	const add = useMutation(
		trpc.communications.addNote.mutationOptions({
			onSuccess: async () => {
				const notified = mentions.length;
				setDraft("");
				setMentions([]);
				setAdding(false);
				toast.success(
					notified > 0
						? `Note added. ${notified} ${notified === 1 ? "person" : "people"} notified.`
						: "Note added.",
				);
				await Promise.all([
					queryClient.invalidateQueries({
						queryKey: trpc.communications.notes.queryKey({ leadId }),
					}),
					queryClient.invalidateQueries({
						queryKey: trpc.communications.conversation.queryKey({ leadId }),
					}),
					queryClient.invalidateQueries({
						queryKey: trpc.communications.conversations.queryKey(),
					}),
					queryClient.invalidateQueries({
						queryKey: trpc.leads.byId.queryKey({ id: leadId }),
					}),
					cache.activity(),
				]);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const text = draft.trim();
	const submit = () => {
		if (text === "" || add.isPending) return;
		add.mutate({ leadId, body: text, mentions });
	};

	return (
		<div className="flex flex-col gap-3">
			{adding ? (
				<form
					className="flex flex-col gap-2"
					onSubmit={(event) => {
						event.preventDefault();
						submit();
					}}
				>
					<MentionTextarea
						ariaLabel="New note"
						autoFocus
						mentions={mentions}
						onChange={setDraft}
						onMentionsChange={setMentions}
						onSubmitShortcut={submit}
						placeholder="What happened? Type @ to mention a teammate."
						value={draft}
					/>
					<div className="flex justify-end gap-2">
						<Button
							onClick={() => {
								setDraft("");
								setMentions([]);
								setAdding(false);
							}}
							size="sm"
							type="button"
							variant="ghost"
						>
							Cancel
						</Button>
						<Button
							disabled={text === "" || add.isPending}
							size="sm"
							type="submit"
						>
							{add.isPending ? <Spinner data-icon="inline-start" /> : null}
							Save note
						</Button>
					</div>
				</form>
			) : (
				<Button
					className="self-start"
					onClick={() => setAdding(true)}
					size="sm"
					variant="outline"
				>
					<Icon data-icon="inline-start" icon={Add} />
					Add note
				</Button>
			)}

			{notes.isPending ? (
				<Spinner aria-label="Loading notes" />
			) : notes.data?.length ? (
				<ul className="flex flex-col gap-2">
					{notes.data.map((note) => (
						<li className="rounded-lg border bg-card p-3" key={note.id}>
							<p className="whitespace-pre-wrap text-pretty text-sm wrap-anywhere">
								<MentionText mentions={note.mentions} text={note.body} />
							</p>
							<p className="mt-2 text-muted-foreground text-xs">
								{note.authorName} ·{" "}
								<LocalDateTime date={note.occurredAt} options={NOTE_TIME} />
							</p>
						</li>
					))}
				</ul>
			) : (
				<p className="text-muted-foreground text-sm">No notes yet.</p>
			)}
		</div>
	);
}
