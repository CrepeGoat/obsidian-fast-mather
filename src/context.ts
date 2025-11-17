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
		// scan for bounds (also increments i_doc)
		for (let bound_text of ["$$", "```", "\\", "$", "`", "\n", undefined]) {
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

			// ignore escape sequences
			if (bound_text === "\\") {
				i_doc += 2;
				break;
			}

			let last_bound_text = result[result.length - 1]?.text(doc);
			let last_bound_type = result[result.length - 1]?.type;
			if (
				last_bound_text === "$$" &&
				last_bound_type === BoundType.Opening &&
				bound_text === "$"
			) {
				continue;
			}
			if (bound_text === "\n") {
				if (
					last_bound_text === "$" &&
					last_bound_type === BoundType.Opening
				) {
					// a `$` terminated with a newline is not a bound
					stack.pop();
					result.pop();
				}

				if (
					last_bound_text === "`" &&
					last_bound_type === BoundType.Opening
				) {
					stack.pop();
					result.push(
						new ContextToken(
							i_doc,
							i_doc + bound_text.length,
							BoundType.Closing
						)
					);
				}

				// newlines are not a bound -> ignore
				continue;
			}

			let bound_type: BoundType;
			if (
				pushToBoundStack(
					stack,
					doc,
					i_doc,
					i_doc + bound_text.length
				) === undefined
			) {
				bound_type = BoundType.Opening;
			} else {
				bound_type = BoundType.Closing;
			}

			result.push(
				new ContextToken(i_doc, i_doc + bound_text.length, bound_type)
			);

			// make sure not to interpret the same bound multiple times
			i_doc = i_doc + bound_text.length;
			break;
		}
	}

	return result;
}

function pushToBoundStack(
	stack: ContextToken[],
	doc: MinimalText,
	from: number,
	to: number
): ContextToken | undefined {
	const text = doc.sliceString(from, to);
	if (
		stack[stack.length - 1]?.type === BoundType.Opening &&
		stack[stack.length - 1]?.text(doc) === text
	) {
		return stack.pop();
	} else {
		stack.push(new ContextToken(from, to, BoundType.Opening));
	}
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
