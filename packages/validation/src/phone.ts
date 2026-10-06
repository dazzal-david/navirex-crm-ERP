export const PHONE_COUNTRIES = [
	{ code: "IN", name: "India", dial: "91" },
	{ code: "DE", name: "Germany", dial: "49" },
	{ code: "AE", name: "United Arab Emirates", dial: "971" },
	{ code: "SA", name: "Saudi Arabia", dial: "966" },
	{ code: "QA", name: "Qatar", dial: "974" },
	{ code: "OM", name: "Oman", dial: "968" },
	{ code: "KW", name: "Kuwait", dial: "965" },
	{ code: "BH", name: "Bahrain", dial: "973" },
	{ code: "GB", name: "United Kingdom", dial: "44" },
	{ code: "US", name: "United States / Canada", dial: "1" },
	{ code: "SG", name: "Singapore", dial: "65" },
	{ code: "AU", name: "Australia", dial: "61" },
	{ code: "NP", name: "Nepal", dial: "977" },
	{ code: "LK", name: "Sri Lanka", dial: "94" },
	{ code: "BD", name: "Bangladesh", dial: "880" },
] as const;

export type PhoneCountry = (typeof PHONE_COUNTRIES)[number];

export const PHONE = {
	defaultDial: "91",
	germanyDial: "49",
	minDigits: 8,
	maxDigits: 15,
	indianMobileLength: 10,
	matchSuffixLength: 10,
} as const;

function digitsOf(value: string): string {
	return value.replace(/\D/g, "");
}

export function phoneDigits(value: string | null | undefined): string {
	return digitsOf(value ?? "");
}

export function withCountryCode(
	value: string | null | undefined,
	defaultDial: string = PHONE.defaultDial,
): string | null {
	const raw = value?.trim() ?? "";
	if (!raw) return null;
	const digits = digitsOf(raw);
	if (!digits) return raw;
	if (raw.startsWith("+")) return `+${digits}`;
	if (digits.startsWith("00")) return `+${digits.slice(2)}`;
	if (defaultDial === PHONE.defaultDial) {
		if (digits.length === PHONE.indianMobileLength) return `+91${digits}`;
		if (
			digits.length === PHONE.indianMobileLength + 1 &&
			digits.startsWith("0")
		)
			return `+91${digits.slice(1)}`;
		if (
			digits.length === PHONE.indianMobileLength + 2 &&
			digits.startsWith("91")
		)
			return `+${digits}`;
		return raw;
	}
	if (digits.startsWith(defaultDial)) return `+${digits}`;
	if (digits.startsWith("0")) return `+${defaultDial}${digits.slice(1)}`;
	return `+${defaultDial}${digits}`;
}

export function joinPhone(dial: string, number: string): string {
	const local = digitsOf(number).replace(/^0+/, "");
	return local ? `+${dial}${local}` : "";
}

export function samePhone(
	left: string | null | undefined,
	right: string | null | undefined,
): boolean {
	const a = phoneDigits(left);
	const b = phoneDigits(right);
	if (!a || !b) return false;
	if (a === b) return true;
	const shorter = a.length < b.length ? a : b;
	const longer = a.length < b.length ? b : a;
	return shorter.length >= PHONE.matchSuffixLength && longer.endsWith(shorter);
}
