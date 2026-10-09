"use client";

import { Textarea } from "@crm/ui/components/textarea";
import { useQuery } from "@tanstack/react-query";
import { type KeyboardEvent, useRef, useState } from "react";
import { NOTIFICATIONS_UI } from "@/lib/notifications-config";
import { useTRPC } from "@/lib/trpc/client";

type Member = { id: string; name: string };

type Trigger = { start: number; query: string };

function triggerAt(text: string, caret: number): Trigger | null {
	const before = text.slice(0, caret);
	const query = /(?:^|\s)@([^\s@]{0,40})$/.exec(before)?.[1];
	if (query === undefined) return null;
	return { start: caret - query.length - 1, query };
}

export function keepMentioned(
	text: string,
	mentions: string[],
	members: Member[],
): string[] {
	return mentions.filter((id) => {
		const member = members.find((person) => person.id === id);
		return member ? text.includes(`@${member.name}`) : false;
	});
}

export function useTeamMembers(): Member[] {
	const trpc = useTRPC();
	const owners = useQuery(trpc.leads.owners.queryOptions());
	return (owners.data ?? []).map((owner) => ({
		id: owner.id,
		name: owner.name,
	}));
}

export function MentionTextarea({
	value,
	onChange,
	mentions,
	onMentionsChange,
	onSubmitShortcut,
	placeholder,
	autoFocus,
	ariaLabel,
}: {
	value: string;
	onChange: (value: string) => void;
	mentions: string[];
	onMentionsChange: (mentions: string[]) => void;
	onSubmitShortcut?: () => void;
	placeholder?: string;
	autoFocus?: boolean;
	ariaLabel: string;
}) {
	const members = useTeamMembers();
	const textarea = useRef<HTMLTextAreaElement>(null);
	const [trigger, setTrigger] = useState<Trigger | null>(null);
	const [active, setActive] = useState(0);

	const suggestions = trigger
		? members
				.filter((member) =>
					member.name.toLowerCase().includes(trigger.query.toLowerCase()),
				)
				.slice(0, NOTIFICATIONS_UI.mentionSuggestions)
		: [];

	const update = (text: string, caret: number) => {
		onChange(text);
		onMentionsChange(keepMentioned(text, mentions, members));
		setTrigger(triggerAt(text, caret));
		setActive(0);
	};

	const choose = (member: Member) => {
		if (!trigger) return;
		const caret = trigger.start + trigger.query.length + 1;
		const inserted = `@${member.name} `;
		const text = value.slice(0, trigger.start) + inserted + value.slice(caret);
		onChange(text);
		onMentionsChange(
			mentions.includes(member.id) ? mentions : [...mentions, member.id],
		);
		setTrigger(null);
		const position = trigger.start + inserted.length;
		requestAnimationFrame(() => {
			textarea.current?.focus();
			textarea.current?.setSelectionRange(position, position);
		});
	};

	const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
		if (suggestions.length > 0) {
			if (event.key === "ArrowDown") {
				event.preventDefault();
				setActive((index) => (index + 1) % suggestions.length);
				return;
			}
			if (event.key === "ArrowUp") {
				event.preventDefault();
				setActive(
					(index) => (index - 1 + suggestions.length) % suggestions.length,
				);
				return;
			}
			if (event.key === "Enter" || event.key === "Tab") {
				event.preventDefault();
				const member = suggestions[active];
				if (member) choose(member);
				return;
			}
			if (event.key === "Escape") {
				event.preventDefault();
				setTrigger(null);
				return;
			}
		}
		if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
			event.preventDefault();
			onSubmitShortcut?.();
		}
	};

	return (
		<div className="relative">
			<Textarea
				aria-autocomplete="list"
				aria-expanded={suggestions.length > 0}
				aria-label={ariaLabel}
				autoFocus={autoFocus}
				onBlur={() => setTrigger(null)}
				onChange={(event) =>
					update(event.target.value, event.target.selectionStart)
				}
				onKeyDown={onKeyDown}
				placeholder={placeholder}
				ref={textarea}
				value={value}
			/>
			{suggestions.length > 0 ? (
				<div
					className="absolute top-full left-0 z-50 mt-1 flex w-64 max-w-full flex-col rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
					role="listbox"
				>
					{suggestions.map((member, index) => (
						<div
							aria-selected={index === active}
							className="cursor-pointer rounded-md px-2 py-1.5 text-sm aria-selected:bg-muted"
							key={member.id}
							onMouseDown={(event) => {
								event.preventDefault();
								choose(member);
							}}
							onMouseEnter={() => setActive(index)}
							role="option"
							tabIndex={-1}
						>
							@{member.name}
						</div>
					))}
				</div>
			) : null}
		</div>
	);
}

export function MentionText({
	text,
	mentions,
}: {
	text: string;
	mentions: Member[];
}) {
	const names = mentions
		.map((member) => `@${member.name}`)
		.sort((left, right) => right.length - left.length);
	if (names.length === 0) return <>{text}</>;
	const pattern = new RegExp(
		`(${names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
		"g",
	);
	const parts: { text: string; at: number; mention: boolean }[] = [];
	let at = 0;
	for (const part of text.split(pattern)) {
		if (part === "") continue;
		parts.push({ text: part, at, mention: names.includes(part) });
		at += part.length;
	}
	return (
		<>
			{parts.map((part) =>
				part.mention ? (
					<span className="font-medium text-primary" key={part.at}>
						{part.text}
					</span>
				) : (
					<span key={part.at}>{part.text}</span>
				),
			)}
		</>
	);
}
