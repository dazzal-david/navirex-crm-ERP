"use client";

import Chat from "@carbon/icons-react/es/Chat";
import WarningAlt from "@carbon/icons-react/es/WarningAlt";
import { Alert, AlertDescription, AlertTitle } from "@crm/ui/components/alert";
import { Icon } from "@crm/ui/components/icon";

export type WhatsAppWindow = {
	open: boolean;
	closesAt: Date | string | null;
};

const CLOSES_FORMAT = new Intl.DateTimeFormat(undefined, {
	weekday: "short",
	hour: "numeric",
	minute: "2-digit",
});

export function WhatsAppWindowAlert({ state }: { state: WhatsAppWindow }) {
	if (!state.open) {
		return (
			<Alert variant="warning">
				<Icon icon={WarningAlt} />
				<AlertTitle>Only templates can be sent</AlertTitle>
				<AlertDescription>
					This lead has not messaged you in the last 24 hours. WhatsApp only
					allows approved templates until they reply. Free text, files and voice
					notes unlock when they reply.
				</AlertDescription>
			</Alert>
		);
	}

	return (
		<Alert>
			<Icon icon={Chat} />
			<AlertTitle>Chat is open</AlertTitle>
			<AlertDescription>
				{state.closesAt
					? `Free text, files and voice notes are allowed until ${CLOSES_FORMAT.format(new Date(state.closesAt))}.`
					: "Free text, files and voice notes are allowed."}
			</AlertDescription>
		</Alert>
	);
}
