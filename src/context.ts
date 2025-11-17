import { strict as assert } from "assert";

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
		if (result[0] === MajorContextTypes.Math && text === "\\text{") {
			result = [MajorContextTypes.Text, bound];
			continue;
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
		const activeContextTokenText = getActiveMajorContextToken(
			doc,
			stack
		)?.text(doc);
		if (activeContextTokenText === undefined) {
			i_doc = parseContextTokenInText(doc, i_doc, stack, result);
			continue;
		}
		if (["$$", "$"].includes(activeContextTokenText)) {
			i_doc = parseContextTokenInMath(
				doc,
				i_doc,
				stack,
				result,
				activeContextTokenText === "$" ? "inline" : "display"
			);
			continue;
		}
		if (["```", "`"].includes(activeContextTokenText)) {
			i_doc = parseContextTokenInCode(
				doc,
				i_doc,
				stack,
				result,
				activeContextTokenText === "`" ? "inline" : "display"
			);
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
): number {
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

	// if no bounds match, advance counter
	return i_doc + 1;
}

function parseContextTokenInMath(
	doc: MinimalText,
	i_doc: number,
	stack: ContextToken[],
	result: ContextToken[],
	boundType: "inline" | "display"
): number {
	// ignore escape sequences
	if (textAtEquals(doc, i_doc, "\\")) {
		return i_doc + 2;
	}

	let endBoundTokenText = undefined;
	if (boundType === "inline") {
		if (textAtEquals(doc, i_doc, "\n")) {
			// newlines cancel inline math blocks completely
			stack.pop();
			result.pop();
			return i_doc + 1;
		}
		endBoundTokenText = "$";
	} else {
		// if (boundType === "display") {
		endBoundTokenText = "$$";
	}

	if (!textAtEquals(doc, i_doc, endBoundTokenText)) {
		return i_doc + 1;
	}

	pushClosingToken(stack, result, i_doc, endBoundTokenText.length);
	return i_doc + endBoundTokenText.length;
}

function parseContextTokenInCode(
	doc: MinimalText,
	i_doc: number,
	stack: ContextToken[],
	result: ContextToken[],
	boundType: "inline" | "display"
): number {
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

	return i_doc + 1;
}

function getActiveMajorContextToken(
	doc: MinimalText,
	boundTokens: ContextToken[]
): ContextToken | undefined {
	let result = undefined;
	for (const token of boundTokens) {
		const tokenText = token.text(doc);
		if (!["$$", "$", "```", "`", "\n"].includes(tokenText)) {
			continue;
		}
		if (result === undefined) {
			result = token;
			continue;
		}
		const resultText = result.text(doc);
		if (resultText === tokenText) {
			result = undefined;
			continue;
		}
		// note: inline code also terminates on newline
		// (whereas inline math is cancelled completely -> no need to handle)
		if (resultText === "`" && tokenText === "\n") {
			result = undefined;
			continue;
		}
	}
	return result;
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
