"use client";

import { Input } from "@crm/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { joinPhone, PHONE, PHONE_COUNTRIES } from "@crm/validation/phone";
import { useState } from "react";

export function PhoneInput({
	id,
	name,
	label,
	required = false,
}: {
	id: string;
	name: string;
	label: string;
	required?: boolean;
}) {
	const [dial, setDial] = useState<string>(PHONE.defaultDial);
	const [number, setNumber] = useState("");

	return (
		<div className="flex gap-2">
			<input name={name} type="hidden" value={joinPhone(dial, number)} />
			<Select onValueChange={setDial} value={dial}>
				<SelectTrigger aria-label={`${label} country code`} className="w-28">
					<SelectValue>+{dial}</SelectValue>
				</SelectTrigger>
				<SelectContent>
					{PHONE_COUNTRIES.map((country) => (
						<SelectItem key={country.code} value={country.dial}>
							+{country.dial} {country.name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<Input
				aria-label={label}
				id={id}
				inputMode="tel"
				onChange={(event) => setNumber(event.target.value)}
				placeholder="99467 88886"
				required={required}
				type="tel"
				value={number}
			/>
		</div>
	);
}
