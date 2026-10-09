"use client";

import Enterprise from "@carbon/icons-react/es/Enterprise";
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
import { Icon } from "@crm/ui/components/icon";
import { Spinner } from "@crm/ui/components/spinner";
import { useState } from "react";
import { MentionTextarea } from "@/components/crm/mention-textarea";

export function ConvertLeadDialog({
	title,
	pending,
	onConvert,
}: {
	title: string;
	pending: boolean;
	onConvert: (
		input: { note?: string; mentions: string[] },
		done: () => void,
	) => void;
}) {
	const [open, setOpen] = useState(false);
	const [note, setNote] = useState("");
	const [mentions, setMentions] = useState<string[]>([]);

	const reset = (next: boolean) => {
		setOpen(next);
		if (!next) {
			setNote("");
			setMentions([]);
		}
	};

	const convert = () => {
		if (pending) return;
		const text = note.trim();
		onConvert({ note: text || undefined, mentions: text ? mentions : [] }, () =>
			reset(false),
		);
	};

	return (
		<Dialog onOpenChange={reset} open={open}>
			<DialogTrigger asChild>
				<Button size="sm">
					<Icon data-icon="inline-start" icon={Enterprise} />
					Convert
				</Button>
			</DialogTrigger>
			<DialogContent size="md">
				<DialogHeader>
					<DialogTitle>Convert {title} to an account</DialogTitle>
					<DialogDescription>
						Add a handover note if someone needs to pick this up. It is saved on
						the lead and on the new account. Type @ to mention a teammate; they
						get a notification and an email.
					</DialogDescription>
				</DialogHeader>
				<MentionTextarea
					ariaLabel="Handover note"
					autoFocus
					mentions={mentions}
					onChange={setNote}
					onMentionsChange={setMentions}
					onSubmitShortcut={convert}
					placeholder="Optional. e.g. Onboarded. @Arjun please start portal registration."
					value={note}
				/>
				<DialogFooter>
					<Button onClick={() => reset(false)} type="button" variant="outline">
						Cancel
					</Button>
					<Button disabled={pending} onClick={convert} type="button">
						{pending ? <Spinner data-icon="inline-start" /> : null}
						Convert
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
