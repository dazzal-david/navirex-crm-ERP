"use client";

import { signUp } from "@crm/auth/client";
import { INVITES } from "@crm/auth/invite-config";
import { Button } from "@crm/ui/components/button";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import { Spinner } from "@crm/ui/components/spinner";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";

const MIN_PASSWORD_LENGTH = 12;

export function InviteSignUp({
	email,
	token,
}: {
	email: string;
	token: string;
}) {
	const router = useRouter();

	const nameId = useId();
	const emailId = useId();
	const passwordId = useId();

	const [pending, setPending] = useState(false);

	function fail(message?: string) {
		setPending(false);
		toast.error(message ?? "Could not reach the sign-in service.");
	}

	async function submit(form: FormData) {
		const name = String(form.get("name") ?? "").trim();
		const password = String(form.get("password") ?? "");

		const { error } = await signUp.email(
			{ email, password, name: name || email },
			{ headers: { [INVITES.header]: token } },
		);

		if (error) {
			fail(error.message);
			return;
		}

		router.replace("/");
		router.refresh();
	}

	return (
		<form
			className="flex w-full flex-col gap-6"
			onSubmit={(event) => {
				event.preventDefault();
				setPending(true);
				submit(new FormData(event.currentTarget)).catch(() => fail());
			}}
		>
			<FieldGroup>
				<Field>
					<FieldLabel htmlFor={emailId}>Email</FieldLabel>
					<Input
						autoComplete="email"
						id={emailId}
						name="email"
						readOnly
						type="email"
						value={email}
					/>
				</Field>

				<Field>
					<FieldLabel htmlFor={nameId}>Name</FieldLabel>
					<Input
						autoComplete="name"
						autoFocus
						id={nameId}
						name="name"
						placeholder="Your name"
						required
						type="text"
					/>
				</Field>

				<Field>
					<FieldLabel htmlFor={passwordId}>Password</FieldLabel>
					<Input
						autoComplete="new-password"
						id={passwordId}
						minLength={MIN_PASSWORD_LENGTH}
						name="password"
						placeholder="Your password"
						required
						type="password"
					/>
					<FieldDescription>
						At least {MIN_PASSWORD_LENGTH} characters.
					</FieldDescription>
				</Field>
			</FieldGroup>

			<Button className="w-full" disabled={pending} type="submit">
				{pending ? <Spinner data-icon="inline-start" /> : null}
				Create account
			</Button>
		</form>
	);
}
