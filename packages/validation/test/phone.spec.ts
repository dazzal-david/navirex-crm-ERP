import { describe, expect, it } from "bun:test";
import { joinPhone, samePhone, withCountryCode } from "../src/phone";

describe("withCountryCode", () => {
	it("adds +91 to a bare Indian mobile number", () => {
		expect(withCountryCode("9946788886")).toBe("+919946788886");
		expect(withCountryCode("99467 88886")).toBe("+919946788886");
	});

	it("drops the trunk 0 of an Indian number", () => {
		expect(withCountryCode("09946788886")).toBe("+919946788886");
	});

	it("adds the plus to 91 followed by ten digits", () => {
		expect(withCountryCode("919946788886")).toBe("+919946788886");
	});

	it("keeps a number that already has a country code", () => {
		expect(withCountryCode("+49 151 2345 6789")).toBe("+4915123456789");
		expect(withCountryCode("0049 151 23456789")).toBe("+4915123456789");
	});

	it("leaves an Indian-default number it cannot read unchanged", () => {
		expect(withCountryCode("12345")).toBe("12345");
	});

	it("uses the German code for a German lead", () => {
		expect(withCountryCode("0151 23456789", "49")).toBe("+4915123456789");
	});

	it("returns null for an empty value", () => {
		expect(withCountryCode("  ")).toBeNull();
	});
});

describe("joinPhone", () => {
	it("joins a dial code and a local number", () => {
		expect(joinPhone("91", "99467 88886")).toBe("+919946788886");
		expect(joinPhone("49", "0151 23456789")).toBe("+4915123456789");
		expect(joinPhone("91", "")).toBe("");
	});
});

describe("samePhone", () => {
	it("matches a WhatsApp id to a lead stored without a country code", () => {
		expect(samePhone("919946788886", "9946788886")).toBe(true);
		expect(samePhone("+91 99467 88886", "919946788886")).toBe(true);
	});

	it("does not match short fragments", () => {
		expect(samePhone("919946788886", "88886")).toBe(false);
		expect(samePhone("919946788886", "919946788887")).toBe(false);
	});
});
