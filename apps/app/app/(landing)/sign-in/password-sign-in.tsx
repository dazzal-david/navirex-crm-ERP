"use client";

import { signIn } from "@crm/auth/client";
import { Button } from "@crm/ui/components/button";
import { Field, FieldGroup, FieldLabel } from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import { Spinner } from "@crm/ui/components/spinner";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";

export function PasswordSignIn({ next }: { next: string | null }) {
	const router = useRouter();

	const emailId = useId();
	const passwordId = useId();

	const [pending, setPending] = useState(false);

	function fail(message?: string) {
		setPending(false);
		toast.error(message ?? "Could not reach the sign-in service.");
	}

	async function submit(form: FormData) {
		const email = String(form.get("email") ?? "").trim();
		const password = String(form.get("password") ?? "");

		const { error } = await signIn.email({ email, password });

		if (error) {
			fail(error.message);
			return;
		}

		if (next) {
			window.location.assign(next);
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
						autoComplete="current-password"
						id={passwordId}
						name="password"
						placeholder="Your password"
						required
						type="password"
					/>
				</Field>
			</FieldGroup>

			<Button className="w-full" disabled={pending} type="submit">
				{pending ? <Spinner data-icon="inline-start" /> : null}
				Sign in
			</Button>

			<p className="text-center text-muted-foreground text-sm/5">
				Access is by invitation only. Ask a Founder or Superadmin to invite you.
			</p>
		</form>
	);
}
