"use client";

import { signIn, signUp } from "@crm/auth/client";
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

type Mode = "sign-in" | "sign-up";

export function PasswordSignIn() {
	const router = useRouter();

	const emailId = useId();
	const passwordId = useId();
	const nameId = useId();

	const [mode, setMode] = useState<Mode>("sign-in");
	const [pending, setPending] = useState(false);

	const signingUp = mode === "sign-up";

	function fail(message?: string) {
		setPending(false);
		toast.error(message ?? "Could not reach the sign-in service.");
	}

	async function submit(form: FormData) {
		const email = String(form.get("email") ?? "").trim();
		const password = String(form.get("password") ?? "");
		const name = String(form.get("name") ?? "").trim();

		const { error } = signingUp
			? await signUp.email({ email, password, name: name || email })
			: await signIn.email({ email, password });

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
				{signingUp ? (
					<Field>
						<FieldLabel htmlFor={nameId}>Name</FieldLabel>
						<Input
							autoComplete="name"
							id={nameId}
							name="name"
							placeholder="Your name"
							type="text"
						/>
					</Field>
				) : null}

				<Field>
					<FieldLabel htmlFor={emailId}>Email</FieldLabel>
					<Input
						autoComplete="email"
						autoFocus
						id={emailId}
						name="email"
						placeholder="you@company.com"
						required
						type="email"
					/>
				</Field>

				<Field>
					<FieldLabel htmlFor={passwordId}>Password</FieldLabel>
					<Input
						autoComplete={signingUp ? "new-password" : "current-password"}
						id={passwordId}
						minLength={signingUp ? MIN_PASSWORD_LENGTH : undefined}
						name="password"
						placeholder="Your password"
						required
						type="password"
					/>
					{signingUp ? (
						<FieldDescription>
							At least {MIN_PASSWORD_LENGTH} characters. Only addresses on the
							workspace allow-list can create an account.
						</FieldDescription>
					) : null}
				</Field>
			</FieldGroup>

			<Button className="w-full" disabled={pending} type="submit">
				{pending ? <Spinner data-icon="inline-start" /> : null}
				{signingUp ? "Create account" : "Sign in"}
			</Button>

			<p className="text-center text-muted-foreground text-sm/5">
				{signingUp ? "Already have an account?" : "First time here?"}{" "}
				<button
					className="underline underline-offset-4 hover:text-foreground"
					disabled={pending}
					onClick={() => setMode(signingUp ? "sign-in" : "sign-up")}
					type="button"
				>
					{signingUp ? "Sign in" : "Create an account"}
				</button>
			</p>
		</form>
	);
}
