"use client";

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";

export const MAIN_RECIPIENT = "main";

export type Recipient = {
	id: string | null;
	name: string;
	designation: string | null;
	phone: string | null;
	email: string | null;
	primary: boolean;
};

export type RecipientChannel = "email" | "whatsapp";

export function recipientKey(recipient: Recipient): string {
	return recipient.id ?? MAIN_RECIPIENT;
}

export function reachable(recipient: Recipient, channel: RecipientChannel) {
	return channel === "email"
		? Boolean(recipient.email)
		: Boolean(recipient.phone);
}

export function defaultRecipient(
	recipients: Recipient[],
	channel: RecipientChannel,
): string | null {
	const first = recipients.find((recipient) => reachable(recipient, channel));
	return first ? recipientKey(first) : null;
}

export function contactIdOf(key: string | null): string | undefined {
	return key && key !== MAIN_RECIPIENT ? key : undefined;
}

export function RecipientSelect({
	recipients,
	channel,
	value,
	onChange,
}: {
	recipients: Recipient[];
	channel: RecipientChannel;
	value: string | null;
	onChange: (key: string) => void;
}) {
	return (
		<Select onValueChange={onChange} value={value ?? undefined}>
			<SelectTrigger aria-label="Send to" className="w-full">
				<SelectValue placeholder="Choose who to send to" />
			</SelectTrigger>
			<SelectContent>
				{recipients.map((recipient) => {
					const address =
						channel === "email" ? recipient.email : recipient.phone;
					return (
						<SelectItem
							disabled={!address}
							key={recipientKey(recipient)}
							value={recipientKey(recipient)}
						>
							{recipient.name}
							{recipient.primary ? " (main)" : ""} ·{" "}
							{address ?? (channel === "email" ? "no email" : "no mobile")}
						</SelectItem>
					);
				})}
			</SelectContent>
		</Select>
	);
}
