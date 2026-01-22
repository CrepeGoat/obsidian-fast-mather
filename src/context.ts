import { strict as assert } from "assert";
import { COMMANDS } from "./mathjax-commands";

const COMMANDS_BOUNDS: ReadonlyArray<string> = COMMANDS.filter(
	(command) => command.argument_count ?? 0 > 0
).map((command) => "\\" + command.command + "{");
const TEXT_COMMANDS_BOUNDS: ReadonlyArray<string> = COMMANDS.filter(
	(command) => command.text_argument === true
).map((command) => "\\" + command.command + "{");

export function getMajorType(
	doc: MinimalText,
	bound_stack: readonly BoundTokenPair[]
): [MajorContextTypes, BoundTokenPair | undefined] {
	let result: [MajorContextTypes, BoundTokenPair | undefined] = [
		MajorContextTypes.Text,
		undefined,
	];
	for (let bound of bound_stack) {
		const text = bound.opening.text(doc);
		for (const commandBoundText of TEXT_COMMANDS_BOUNDS) {
			if (
				result[0] === MajorContextTypes.Math &&
				text === commandBoundText
			) {
				result = [MajorContextTypes.Text, bound];
				continue;
			}
		}
		if (
			result[0] === MajorContextTypes.Text &&
			(text === "$$" || text === "$")
		) {
			result = [MajorContextTypes.Math, bound];
			continue;
		}
		if (
			result[0] === MajorContextTypes.Text &&
			(text === "```" || text === "`")
		) {
			result = [MajorContextTypes.Code, bound];
			continue;
		}
	}

	return result;
}

export function getContextBoundsAtSelection(
	doc: MinimalText,
	ranges: readonly MinimalSelectionRange[]
): BoundTokenPair[][] {
	const bounds = parseContextTokens(doc);
	const positions = ranges.flatMap((range) => [range.from, range.to]);
	const pos_bound_indices = bisectPositionsToBounds(bounds, positions);
	const pos_bound_stacks = getBoundsAbout(bounds, pos_bound_indices);

	let range_bound_stacks = [];
	for (let i = 1; i < pos_bound_stacks.length; i = i + 2) {
		range_bound_stacks.push(
			longestCommonPrefix(pos_bound_stacks[i - 1]!, pos_bound_stacks[i]!)
		);
	}

	return range_bound_stacks;
}

function longestCommonPrefix<T>(a1: readonly T[], a2: readonly T[]): T[] {
	let i = 0;
	for (; ; i++) {
		if (i >= a1.length || i >= a2.length) break;
		if (a1[i] !== a2[i]) break;
	}
	return [...a1.slice(0, i)];
}

function getBoundsAbout(
	bounds: readonly ContextToken[],
	pos_bound_indices: readonly number[]
): BoundTokenPair[][] {
	assertIsSorted(pos_bound_indices);
	let result: (BoundTokenPair[] | undefined)[] = Array.from(
		Array(pos_bound_indices.length)
	);
	let stack: BoundTokenPair[] = [];

	let i_pos = 0;
	for (let i_bound = 0; ; i_bound++) {
		while (i_bound === pos_bound_indices[i_pos]) {
			result[i_pos] = [...stack];
			i_pos++;
			if (i_pos >= pos_bound_indices.length) {
				break;
			}
		}
		if (i_bound >= bounds.length) {
			// the positions should run out before the bounds
			assert(i_pos >= pos_bound_indices.length);
			break;
		}
		const bound = bounds[i_bound]!;
		if (bound.type === BoundType.Closing) {
			// A closing bound must have a matching opening bound
			// TODO check that bounds are matching
			assert(stack.length > 0);
			assert(stack[stack.length - 1]!.isIncomplete());
			stack[stack.length - 1]!.closing = new PartialBoundToken(
				bound.from,
				bound.to
			);
			stack.pop();
		} else {
			stack.push(
				new BoundTokenPair(new PartialBoundToken(bound.from, bound.to))
			);
		}
	}

	assert(i_pos >= pos_bound_indices.length);
	return result.map((x) => x!);
}

function bisectPositionsToBounds(
	bounds: readonly ContextToken[],
	positions: readonly number[]
): number[] {
	if (positions.length === 0) {
		return [];
	}

	const i_pos_mid = Math.floor(positions.length / 2);
	const i_map_to_bounds = bisectBounds(bounds, positions[i_pos_mid]!);

	return [
		...bisectPositionsToBounds(
			bounds.slice(0, i_map_to_bounds + 1), // include middle bound
			positions.slice(0, i_pos_mid) // exclude middle position
		),
		i_map_to_bounds,
		...bisectPositionsToBounds(
			bounds.slice(i_map_to_bounds), // include middle bound
			positions.slice(i_pos_mid + 1) // exclude middle position
		).map((pos: number) => pos + i_map_to_bounds),
	];
}

function bisectBounds(
	bounds: readonly ContextToken[],
	position: number
): number {
	if (bounds.length === 0) {
		return 0;
	}

	const i_bound_mid = Math.floor(bounds.length / 2);
	if (compareToBounds(position, bounds[i_bound_mid]!)) {
		return (
			bisectBounds(bounds.slice(i_bound_mid + 1), position) +
			i_bound_mid +
			1
		);
	} else {
		return bisectBounds(bounds.slice(0, i_bound_mid), position);
	}
}

function compareToBounds(position: number, bound: ContextToken): boolean {
	// TODO 2x-check logic
	// a position that interrupts a brace should be considered outside its bounded region
	if (bound.type === BoundType.Opening) {
		// outside = before
		return position >= bound.to;
	} else {
		// outside = after
		return position > bound.from;
	}
}

function assertIsSorted(array: readonly number[]) {
	for (let i = 1; i < array.length; i++) {
		assert(array[i - 1]! <= array[i]!);
	}
}

function parseContextTokens(doc: MinimalText): ContextToken[] {
	let result: ContextToken[] = [];
	let stack: ContextToken[] = [];

	let i_doc = 0;
	while (i_doc < doc.length) {
		const firstContextTokenText = stack[0]?.text(doc);

		if (firstContextTokenText === undefined) {
			i_doc =
				parseContextTokenInText(doc, i_doc, stack, result) ?? i_doc + 1;
			continue;
		}
		if (firstContextTokenText === "$") {
			i_doc =
				parseContextTokenInInlineMath(doc, i_doc, stack, result) ??
				i_doc + 1;
			continue;
		}
		if (firstContextTokenText === "$$") {
			i_doc =
				parseContextTokenInDisplayMath(doc, i_doc, stack, result) ??
				i_doc + 1;
			continue;
		}
		if (["```", "`"].includes(firstContextTokenText)) {
			i_doc =
				parseContextTokenInCode(
					doc,
					i_doc,
					stack,
					result,
					firstContextTokenText === "`" ? "inline" : "display"
				) ?? i_doc + 1;
			continue;
		}
	}

	return result;
}

function parseContextTokenInText(
	doc: MinimalText,
	i_doc: number,
	stack: ContextToken[],
	result: ContextToken[]
): number | undefined {
	// ignore escape sequences
	if (textAtEquals(doc, i_doc, "\\")) {
		return i_doc + 2;
	}

	let startBoundTokenTexts = ["$$", "```", "$", "`"];
	for (let startBoundTokenText of startBoundTokenTexts) {
		if (!textAtEquals(doc, i_doc, startBoundTokenText)) {
			continue;
		}

		pushOpeningToken(stack, result, i_doc, startBoundTokenText.length);
		return i_doc + startBoundTokenText.length;
	}

	return undefined;
}

function parseOpeningContextTokenInNestedText(
	doc: MinimalText,
	i_doc: number,
	stack: ContextToken[],
	result: ContextToken[],
	i_stackActiveBound: number
): number | undefined {
	// ignore escape sequences
	if (textAtEquals(doc, i_doc, "\\")) {
		return i_doc + 2;
	}

	const startBoundTokenText = "$";
	if (textAtEquals(doc, i_doc, startBoundTokenText)) {
		pushOpeningToken(stack, result, i_doc, startBoundTokenText.length);
		return i_doc + startBoundTokenText.length;
	}

	const endBoundTokenText = "}";
	if (textAtEquals(doc, i_doc, endBoundTokenText)) {
		pushClosingToken(stack, result, i_doc, endBoundTokenText.length);
		return i_doc + endBoundTokenText.length;
	}
	return undefined;
}

function parseContextTokenInInlineMath(
	doc: MinimalText,
	i_doc: number,
	stack: ContextToken[],
	result: ContextToken[]
): number | undefined {
	assert(stack[0]?.text(doc) === "$");

	// ignore escape sequences
	if (textAtEquals(doc, i_doc, "\\")) {
		return i_doc + 2;
	}

	if (!textAtEquals(doc, i_doc, "$")) {
		return undefined;
	}

	pushClosingToken(stack, result, i_doc, "$".length);
	return i_doc + "$".length;
}

function parseContextTokenInDisplayMath(
	doc: MinimalText,
	i_doc: number,
	stack: ContextToken[],
	result: ContextToken[]
): number | undefined {
	assert(stack[0]?.text(doc) === "$$");

	const lastNestedMathToken = stack.findLastIndex(
		(token) => token.text(doc) === "$"
	);
	const lastNestedTextToken =
		1 +
		lastNestedMathToken +
		stack
			.slice(lastNestedMathToken + 1)
			.findIndex((token) =>
				TEXT_COMMANDS_BOUNDS.includes(token.text(doc))
			);
	const activeMathOpeningBoundPos =
		lastNestedMathToken === -1 ? 0 : lastNestedMathToken;
	const closingBoundTokenText = stack[activeMathOpeningBoundPos]!.text(doc);
	assert(["$$", "$"].includes(closingBoundTokenText));

	let out = undefined;
	const mode: "math" | "text" =
		lastNestedTextToken > lastNestedMathToken ? "text" : "math";
	if (mode === "math") {
		out = parseSubContextTokenInMath(
			doc,
			i_doc,
			stack,
			result,
			activeMathOpeningBoundPos
		);
	} else {
		out = parseOpeningContextTokenInNestedText(
			doc,
			i_doc,
			stack,
			result,
			activeMathOpeningBoundPos
		);
	}
	if (out !== undefined) {
		return out;
	}

	if (
		textAtEquals(doc, i_doc, closingBoundTokenText) &&
		!textAtEquals(doc, i_doc - 1, "\\")
	) {
		// interrupt all other active open bounds
		stack.splice(activeMathOpeningBoundPos + 1);

		pushClosingToken(stack, result, i_doc, closingBoundTokenText.length);
		return i_doc + closingBoundTokenText.length;
	}

	return undefined;
}

function parseSubContextTokenInMath(
	doc: MinimalText,
	i_doc: number,
	stack: ContextToken[],
	result: ContextToken[],
	i_stackActiveBound: number
): number | undefined {
	for (const commandBoundText of COMMANDS_BOUNDS) {
		if (textAtEquals(doc, i_doc, commandBoundText)) {
			pushOpeningToken(stack, result, i_doc, commandBoundText.length);
			return i_doc + commandBoundText.length;
		}
	}
	if (textAtEquals(doc, i_doc, "{") && !textAtEquals(doc, i_doc - 1, "\\{")) {
		pushOpeningToken(stack, result, i_doc, 1);
		return i_doc + 1;
	}

	if (stack.length - i_stackActiveBound <= 1) {
		return undefined;
	}

	const prevBoundText = stack[stack.length - 1]?.text(doc);
	if (
		((prevBoundText?.at(0) === "\\" && prevBoundText.at(-1) === "{") ||
			prevBoundText === "{") &&
		textAtEquals(doc, i_doc, "}") &&
		!textAtEquals(doc, i_doc - 1, "\\}")
	) {
		pushClosingToken(stack, result, i_doc, 1);
		return i_doc + 1;
	}
}

function parseContextTokenInCode(
	doc: MinimalText,
	i_doc: number,
	stack: ContextToken[],
	result: ContextToken[],
	boundType: "inline" | "display"
): number | undefined {
	assert(["```", "`"].includes(stack[0]?.text(doc) ?? ""));

	// ignore escape sequences
	if (textAtEquals(doc, i_doc, "\\")) {
		return i_doc + 2;
	}

	let endBoundTokenTexts = [];
	if (boundType === "inline") {
		// newlines terminate inline code blocks
		endBoundTokenTexts = ["`", "\n"];
	} else {
		// if (boundType === "display") {
		endBoundTokenTexts = ["```"];
	}

	for (const endBoundTokenText of endBoundTokenTexts) {
		if (!textAtEquals(doc, i_doc, endBoundTokenText)) {
			continue;
		}

		pushClosingToken(stack, result, i_doc, endBoundTokenText.length);
		return i_doc + endBoundTokenText.length;
	}

	return undefined;
}

function textAtEquals(doc: MinimalText, i_doc: number, text: string) {
	return doc.sliceString(i_doc, i_doc + text.length) === text;
}

function pushOpeningToken(
	stack: ContextToken[],
	result: ContextToken[],
	i_doc: number,
	length: number
) {
	const contextToken = new ContextToken(
		i_doc,
		i_doc + length,
		BoundType.Opening
	);
	stack.push(contextToken);
	result.push(contextToken);
}

function pushClosingToken(
	stack: ContextToken[],
	result: ContextToken[],
	i_doc: number,
	length: number
) {
	stack.pop();
	result.push(new ContextToken(i_doc, i_doc + length, BoundType.Closing));
}

export class BoundTokenPair {
	opening: PartialBoundToken;
	closing: PartialBoundToken | undefined;

	constructor(
		opening: PartialBoundToken,
		closing?: PartialBoundToken | undefined
	) {
		this.opening = opening;
		this.closing = closing;
	}

	public isComplete(): boolean {
		return this.closing !== undefined;
	}
	public isIncomplete(): boolean {
		return this.closing === undefined;
	}
}

export class PartialBoundToken {
	from: number;
	to: number;

	constructor(from: number, to: number) {
		this.from = from;
		this.to = to;
	}

	public text(doc: MinimalText): string {
		return doc.sliceString(this.from, this.to);
	}
}

export class ContextToken {
	from: number;
	to: number;
	type: BoundType;

	constructor(from: number, to: number, type: BoundType) {
		this.from = from;
		this.to = to;
		this.type = type;
	}

	public text(doc: MinimalText): string {
		return doc.sliceString(this.from, this.to);
	}
}

export interface MinimalText {
	length: number;
	sliceString(
		from: number,
		to?: number | undefined,
		lineSep?: string | undefined
	): string;
}

export interface MinimalSelectionRange {
	from: number;
	to: number;
}

export enum MajorContextTypes {
	Text,
	Math,
	Code,
}

export enum BoundType {
	Opening,
	Closing,
}
