import { strict as assert } from "assert";

export function getContextBoundsAtSelection(
	doc: MinimalText,
	ranges: readonly MinimalSelectionRange[]
): ContextToken[][] {
	const bound_pairs = parseContextTokens(doc);
	const flat_bounds = flattenBoundPairs(bound_pairs);
	const positions = ranges.flatMap((range) => [range.from, range.to]);
	const pos_bound_indices = bisectPositionsToBounds(flat_bounds, positions);
	const pos_bound_stacks = getBoundsAbout(flat_bounds, pos_bound_indices);

	let range_bound_stacks = [];
	for (let i = 1; i < pos_bound_stacks.length; i = i + 2) {
		range_bound_stacks.push(
			longestCommonPrefix(pos_bound_stacks[i - 1]!, pos_bound_stacks[i]!)
		);
	}

	return range_bound_stacks;
}

export function getMajorType(
	doc: MinimalText,
	bound_stack: readonly BoundTokenPair[]
): MajorContextTypes {
	let result = MajorContextTypes.Text;
	for (let bound of bound_stack) {
		const text = bound.start.text(doc);
		if (result === MajorContextTypes.Math && text === "\\text{") {
			result = MajorContextTypes.Text;
			continue;
		}
		if (
			result === MajorContextTypes.Text &&
			(text === "$$" || text === "$")
		) {
			result = MajorContextTypes.Math;
			continue;
		}
	}

	return result;
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
): ContextToken[][] {
	assertIsSorted(pos_bound_indices);
	let result: (ContextToken[] | undefined)[] = Array.from(
		Array(pos_bound_indices.length)
	);
	let stack: ContextToken[] = [];

	let i_pos = 0;
	for (let i_bound = 0; ; i_bound++) {
		while (i_bound === pos_bound_indices[i_pos]) {
			result[i_pos] = [...stack];
			i_pos++;
			if (i_pos >= pos_bound_indices.length) {
				return result.map((x) => x!);
			}
		}
		// the positions should run out before the bounds -> this shouldn't trigger
		assert(i_bound < bounds.length);

		const bound = bounds[i_bound]!;
		if (bound.type === BoundType.Closing) {
			// A closing bound must have a matching opening bound
			// TODO check that bounds are matching
			assert(stack[stack.length - 1]?.type === BoundType.Opening);
			stack.pop();
		} else {
			stack.push(bound);
		}
	}
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

function flattenBoundPairs(bound_pairs: BoundTokenPair[]): ContextToken[] {
	let result: ContextToken[] = [];
	let stack: ContextToken[] = [];

	for (let bound_pair of bound_pairs) {
		while (
			stack.length > 0 &&
			stack[stack.length - 1]!.from < bound_pair.start.from
		) {
			result.push(stack.pop()!);
		}
		if (bound_pair.end !== undefined) {
			stack.push(
				new ContextToken(
					bound_pair.end.from,
					bound_pair.end.to,
					BoundType.Closing
				)
			);
		}
		stack.push(
			new ContextToken(
				bound_pair.start.from,
				bound_pair.start.to,
				BoundType.Opening
			)
		);
	}
	return result;
}

function parseContextTokens(doc: MinimalText): BoundTokenPair[] {
	let stack: BoundTokenPair[] = [];
	let result_pairs: BoundTokenPair[] = [];

	let i_doc = 0;
	while (i_doc < doc.length) {
		// scan for bounds (also increments i_doc)
		for (let bound_text of ["$$", "$", "\n", undefined]) {
			// terminating condition
			if (bound_text === undefined) {
				i_doc++;
				break;
			}

			if (
				doc.sliceString(i_doc, i_doc + bound_text.length) !== bound_text
			) {
				continue;
			}

			let last_bound_start_text =
				stack[stack.length - 1]?.start.text(doc);
			let last_bound_is_incomplete =
				stack[stack.length - 1]?.isIncomplete();
			if (
				last_bound_start_text === "$$" &&
				last_bound_is_incomplete &&
				bound_text === "$"
			) {
				// a $ within a display math block is not a token -> ignore
				continue;
			}
			if (bound_text === "\n") {
				if (last_bound_start_text === "$" && last_bound_is_incomplete) {
					// a `$` terminated with a newline is not a bound
					stack.pop();
					result_pairs.pop();
				}
				// newlines are not a bound -> ignore
				continue;
			}

			const token = new PartialBoundToken(
				i_doc,
				i_doc + bound_text.length
			);
			if (
				last_bound_is_incomplete &&
				last_bound_start_text === bound_text
			) {
				stack.pop()!.end = token;
			} else {
				const new_bound = new BoundTokenPair(token);
				stack.push(new_bound);
				result_pairs.push(new_bound);
			}

			// make sure not to interpret the same bound multiple times
			i_doc = i_doc + bound_text.length;
			break;
		}
	}

	return result_pairs;
}

export class BoundTokenPair {
	start: PartialBoundToken;
	end: PartialBoundToken | undefined;

	constructor(start: PartialBoundToken, end?: PartialBoundToken | undefined) {
		this.start = start;
		this.end = end;
	}

	public isComplete(): boolean {
		return this.end !== undefined;
	}
	public isIncomplete(): boolean {
		return this.end === undefined;
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
}

export enum BoundType {
	Opening,
	Closing,
}
