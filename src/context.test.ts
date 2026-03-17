// Import necessary dependencies
import { expect, test, describe } from "@jest/globals";
import { strict as assert } from "assert";

import {
	getContextBoundsAtSelection,
	PartialBoundToken,
	BoundTokenPair,
	MinimalSelectionRange,
} from "./context";
import { BoundType, ContextToken, MinimalText } from "./parseContextBounds";

describe("getContextBoundsAtSelection", () => {
	const bounds = [
		new ContextToken(0, 5, BoundType.Opening),
		new ContextToken(10, 15, BoundType.Closing),
		new ContextToken(20, 25, BoundType.Opening),
		new ContextToken(30, 35, BoundType.Opening),
		new ContextToken(40, 45, BoundType.Closing),
		new ContextToken(50, 55, BoundType.Closing),
	];

	test("handles simple selections within non-nested bounds", () => {
		const ranges: readonly MinimalSelectionRange[] = [
			{ from: 6, to: 6 },
			{ from: 16, to: 16 },
			{ from: 27, to: 27 },
		];

		expect(getContextBoundsAtSelection(bounds, ranges)).toStrictEqual([
			[
				new BoundTokenPair(
					new PartialBoundToken(0, 5),
					new PartialBoundToken(10, 15),
				),
			],
			[],
			[
				new BoundTokenPair(
					new PartialBoundToken(20, 25),
					new PartialBoundToken(50, 55),
				),
			],
		]);
	})

	test("handles selections within nested bounds", () => {
		const ranges: readonly MinimalSelectionRange[] = [
			{ from: 37, to: 37 },
		];

		expect(getContextBoundsAtSelection(bounds, ranges)).toStrictEqual([
			[
				new BoundTokenPair(
					new PartialBoundToken(20, 25),
					new PartialBoundToken(50, 55),
				),
				new BoundTokenPair(
					new PartialBoundToken(30, 35),
					new PartialBoundToken(40, 45),
				),
			],
		]);
	})

	test("handles selections within a bound token", () => {
		const ranges: readonly MinimalSelectionRange[] = [
			{ from: 1, to: 1 },
			{ from: 11, to: 17 },
			{ from: 24, to: 25 },
			{ from: 31, to: 31 },
			{ from: 39, to: 41 },
			{ from: 51, to: 52 },
		];

		expect(getContextBoundsAtSelection(bounds, ranges)).toStrictEqual([
			[],
			[],
			[],
			[
				new BoundTokenPair(
					new PartialBoundToken(20, 25),
					new PartialBoundToken(50, 55),
				),
			],
			[
				new BoundTokenPair(
					new PartialBoundToken(20, 25),
					new PartialBoundToken(50, 55),
				),

			],
			[],
		]);
	})
});

class MockText implements MinimalText {
	private text: string;
	constructor(text: string) {
		this.text = text;
		this.length = text.length;
	}

	length: number;
	sliceString(
		from: number,
		to?: number | undefined,
		lineSep?: string | undefined,
	): string {
		assert(lineSep === undefined);
		return this.text.slice(from, to);
	}
}
