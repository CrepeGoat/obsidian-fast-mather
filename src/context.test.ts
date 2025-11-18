// Import necessary dependencies
import { expect, test, describe } from "@jest/globals";
import { strict as assert } from "assert";

import {
	getContextBoundsAtSelection,
	PartialBoundToken,
	BoundTokenPair,
	MinimalText,
	MinimalSelectionRange,
} from "./context";

describe("getContextBoundsAtSelection", () => {
	test("returns empty bounds when no bounds are present", () => {
		const doc = new MockText("this is just a bunch of text");
		const ranges: readonly MinimalSelectionRange[] = [
			{ from: 3, to: 3 },
			{ from: 7, to: 10 },
		];

		expect(getContextBoundsAtSelection(doc, ranges)).toStrictEqual([
			[],
			[],
		]);
	});

	test("handles an inline math block ($)", () => {
		const doc = new MockText("simple math $1 + 1 = 2$, nicely formatted\n");
		const ranges: readonly MinimalSelectionRange[] = [
			{
				from: "simple math".length,
				to: "simple math".length,
			},
			{
				from: "simple math $1 + ".length,
				to: "simple math $1 + 1 =".length,
			},
			{
				from: "simple math $1 + 1 = 2$, nicely".length,
				to: "simple math $1 + 1 = 2$, nicely".length,
			},
		];

		expect(getContextBoundsAtSelection(doc, ranges)).toStrictEqual([
			[],
			[
				new BoundTokenPair(
					new PartialBoundToken(
						"simple math ".length,
						"simple math $".length
					),
					new PartialBoundToken(
						"simple math $1 + 1 = 2".length,
						"simple math $1 + 1 = 2$".length
					)
				),
			],
			[],
		]);
	});

	test("returns one bound when inside a display math block ($$)", () => {
		const doc = new MockText(
			"display math:\n$$\n1 + 1 = 2\n$$\nnicely formatted"
		);
		const ranges: readonly MinimalSelectionRange[] = [
			{
				from: "display math:\n$$\n1 + ".length,
				to: "display math:\n$$\n1 + 1 =".length,
			},
		];

		expect(getContextBoundsAtSelection(doc, ranges)).toStrictEqual([
			[
				new BoundTokenPair(
					new PartialBoundToken(
						"display math:\n".length,
						"display math:\n$$".length
					),
					new PartialBoundToken(
						"display math:\n$$\n1 + 1 = 2\n".length,
						"display math:\n$$\n1 + 1 = 2\n$$".length
					)
				),
			],
		]);
	});

	test("handles multiple inline math blocks", () => {
		const doc = new MockText(
			"math 1 $1 + 1 = 2$ followed by math 2 $1 - 1 = 0$"
		);
		const ranges: readonly MinimalSelectionRange[] = [
			{
				from: "math 1 $1 + 1".length,
				to: "math 1 $1 + 1 =".length,
			},
			{
				from: "math 1 $1 + 1 = 2$ followed by math 2 $1 -".length,
				to: "math 1 $1 + 1 = 2$ followed by math 2 $1 - 1 =".length,
			},
		];

		expect(getContextBoundsAtSelection(doc, ranges)).toStrictEqual([
			[
				new BoundTokenPair(
					new PartialBoundToken("math 1 ".length, "math 1 $".length),
					new PartialBoundToken(
						"math 1 $1 + 1 = 2".length,
						"math 1 $1 + 1 = 2$".length
					)
				),
			],
			[
				new BoundTokenPair(
					new PartialBoundToken(
						"math 1 $1 + 1 = 2$ followed by math 2 ".length,
						"math 1 $1 + 1 = 2$ followed by math 2 $".length
					),
					new PartialBoundToken(
						"math 1 $1 + 1 = 2$ followed by math 2 $1 - 1 = 0".length,
						"math 1 $1 + 1 = 2$ followed by math 2 $1 - 1 = 0$".length
					)
				),
			],
		]);
	});

	test("handles multiple display math blocks", () => {
		const doc = new MockText(
			"math 1:\n$$1 + 1 = 2$$\nfollowed by math 2:\n$$1 - 1 = 0$$"
		);
		const ranges: readonly MinimalSelectionRange[] = [
			{
				from: "math 1:\n$$1 + 1".length,
				to: "math 1:\n$$1 + 1 =".length,
			},
			{
				from: "math 1:\n$$1 + 1 = 2$$\nfollowed by math 2:\n$$1 -"
					.length,
				to: "math 1:\n$$1 + 1 = 2$$\nfollowed by math 2:\n$$1 - 1 ="
					.length,
			},
		];

		expect(getContextBoundsAtSelection(doc, ranges)).toStrictEqual([
			[
				new BoundTokenPair(
					new PartialBoundToken(
						"math 1:\n".length,
						"math 1:\n$$".length
					),
					new PartialBoundToken(
						"math 1:\n$$1 + 1 = 2".length,
						"math 1:\n$$1 + 1 = 2$$".length
					)
				),
			],
			[
				new BoundTokenPair(
					new PartialBoundToken(
						"math 1:\n$$1 + 1 = 2$$\nfollowed by math 2:\n".length,
						"math 1:\n$$1 + 1 = 2$$\nfollowed by math 2:\n$$".length
					),
					new PartialBoundToken(
						"math 1:\n$$1 + 1 = 2$$\nfollowed by math 2:\n$$1 - 1 = 0".length,
						"math 1:\n$$1 + 1 = 2$$\nfollowed by math 2:\n$$1 - 1 = 0$$".length
					)
				),
			],
		]);
	});

	test("handles mixed inline and display math blocks", () => {
		const doc = new MockText(
			"math 1:\n$$1 + 1 = 2$$\nfollowed by math 2 $1 - 1 = 0$"
		);
		const ranges: readonly MinimalSelectionRange[] = [
			{
				from: "math 1:\n$$1 + 1".length,
				to: "math 1:\n$$1 + 1 =".length,
			},
			{
				from: "math 1:\n$$1 + 1 = 2$$\nfollowed by math 2 $1 -".length,
				to: "math 1:\n$$1 + 1 = 2$$\nfollowed by math 2 $1 - 1 ="
					.length,
			},
		];

		expect(getContextBoundsAtSelection(doc, ranges)).toStrictEqual([
			[
				new BoundTokenPair(
					new PartialBoundToken(
						"math 1:\n".length,
						"math 1:\n$$".length
					),
					new PartialBoundToken(
						"math 1:\n$$1 + 1 = 2".length,
						"math 1:\n$$1 + 1 = 2$$".length
					)
				),
			],
			[
				new BoundTokenPair(
					new PartialBoundToken(
						"math 1:\n$$1 + 1 = 2$$\nfollowed by math 2 ".length,
						"math 1:\n$$1 + 1 = 2$$\nfollowed by math 2 $".length
					),
					new PartialBoundToken(
						"math 1:\n$$1 + 1 = 2$$\nfollowed by math 2 $1 - 1 = 0".length,
						"math 1:\n$$1 + 1 = 2$$\nfollowed by math 2 $1 - 1 = 0$".length
					)
				),
			],
		]);
	});

	test("terminates an inline math block ($) when interrupted by a newline (\\n)", () => {
		const doc = new MockText("just talking $ here\n$\n\n");
		const ranges: readonly MinimalSelectionRange[] = [
			{
				from: "just talking $".length,
				to: "just talking $".length,
			},
			{
				from: "just talking $ here\n$\n".length,
				to: "just talking $ here\n$\n".length,
			},
		];

		expect(getContextBoundsAtSelection(doc, ranges)).toStrictEqual([
			[],
			[],
		]);
	});
	test("ignores escaped bound (\\$) before inline math block ($)", () => {
		const doc = new MockText(
			"little bit of \\$ munny and $some math$ afterwards"
		);
		const ranges: readonly MinimalSelectionRange[] = [
			{
				from: "little bit of \\$ munny".length,
				to: "little bit of \\$ munny".length,
			},
			{
				from: "little bit of \\$ munny and $some".length,
				to: "little bit of \\$ munny and $some".length,
			},
		];

		expect(getContextBoundsAtSelection(doc, ranges)).toStrictEqual([
			[],
			[
				new BoundTokenPair(
					new PartialBoundToken(
						"little bit of \\$ munny and ".length,
						"little bit of \\$ munny and $".length
					),
					new PartialBoundToken(
						"little bit of \\$ munny and $some math".length,
						"little bit of \\$ munny and $some math$".length
					)
				),
			],
		]);
	});
	test("ignores escaped bound (\\$) inside inline math block ($)", () => {
		const doc = new MockText("little bit of $math with \\$ munny$ here");
		const ranges: readonly MinimalSelectionRange[] = [
			{
				from: "little bit of $math".length,
				to: "little bit of $math".length,
			},
			{
				from: "little bit of $math with \\$ mun".length,
				to: "little bit of $math with \\$ mun".length,
			},
		];

		const bound_range = new BoundTokenPair(
			new PartialBoundToken(
				"little bit of ".length,
				"little bit of $".length
			),
			new PartialBoundToken(
				"little bit of $math with \\$ munny".length,
				"little bit of $math with \\$ munny$".length
			)
		);
		expect(getContextBoundsAtSelection(doc, ranges)).toStrictEqual([
			[bound_range],
			[bound_range],
		]);
	});

	test("identifies text inside a display math block ($$)", () => {
		const doc = new MockText("$$\na := \\text{text and stuff}\n$$");

		const ranges: readonly MinimalSelectionRange[] = [
			{
				from: "$$\na :=".length,
				to: "$$\na :=".length,
			},
			{
				from: "$$\na := \\text{text".length,
				to: "$$\na := \\text{text".length,
			},
			{
				from: "$$\na := \\text{text and stuff}\n".length,
				to: "$$\na := \\text{text and stuff}\n".length,
			},
		];

		const bound_ranges = [
			new BoundTokenPair(
				new PartialBoundToken("".length, "$$".length),
				new PartialBoundToken(
					"$$\na := \\text{text and stuff}\n".length,
					"$$\na := \\text{text and stuff}\n$$".length
				)
			),
			new BoundTokenPair(
				new PartialBoundToken(
					"$$\na := ".length,
					"$$\na := \\text{".length
				),
				new PartialBoundToken(
					"$$\na := \\text{text and stuff".length,
					"$$\na := \\text{text and stuff}".length
				)
			),
		];
		expect(getContextBoundsAtSelection(doc, ranges)).toStrictEqual([
			bound_ranges.slice(0, 1),
			bound_ranges.slice(0, 2),
			bound_ranges.slice(0, 1),
		]);
	});

	test("allows simple nested equations and text inside a display math block ($$)", () => {
		const doc = new MockText(
			"$$\na := \\text{text and $b = e$ and stuff}\n$$"
		);

		const ranges: readonly MinimalSelectionRange[] = [
			{
				from: "$$\na :=".length,
				to: "$$\na :=".length,
			},
			{
				from: "$$\na := \\text{text".length,
				to: "$$\na := \\text{text".length,
			},
			{
				from: "$$\na := \\text{text and $b =".length,
				to: "$$\na := \\text{text and $b =".length,
			},
			{
				from: "$$\na := \\text{text and $b = e$ and".length,
				to: "$$\na := \\text{text and $b = e$ and".length,
			},
			{
				from: "$$\na := \\text{text and $b = e$ and stuff}\n".length,
				to: "$$\na := \\text{text and $b = e$ and stuff}\n".length,
			},
		];

		const bound_ranges = [
			new BoundTokenPair(
				new PartialBoundToken("".length, "$$".length),
				new PartialBoundToken(
					"$$\na := \\text{text and $b = e$ and stuff}\n".length,
					"$$\na := \\text{text and $b = e$ and stuff}\n$$".length
				)
			),
			new BoundTokenPair(
				new PartialBoundToken(
					"$$\na := ".length,
					"$$\na := \\text{".length
				),
				new PartialBoundToken(
					"$$\na := \\text{text and $b = e$ and stuff".length,
					"$$\na := \\text{text and $b = e$ and stuff}".length
				)
			),
			new BoundTokenPair(
				new PartialBoundToken(
					"$$\na := \\text{text and ".length,
					"$$\na := \\text{text and $".length
				),
				new PartialBoundToken(
					"$$\na := \\text{text and $b = e".length,
					"$$\na := \\text{text and $b = e$".length
				)
			),
		];
		expect(getContextBoundsAtSelection(doc, ranges)).toStrictEqual([
			bound_ranges.slice(0, 1),
			bound_ranges.slice(0, 2),
			bound_ranges.slice(0, 3),
			bound_ranges.slice(0, 2),
			bound_ranges.slice(0, 1),
		]);
	});

	test("allows nested equations and text inside a display math block ($$)", () => {
		const doc = new MockText(
			"$$\na := \\text{text and $b = \\text{more stuff and $c + d$ and whatever} + e$ and stuff}\n$$"
		);

		const ranges: readonly MinimalSelectionRange[] = [
			{
				from: "$$\na :=".length,
				to: "$$\na :=".length,
			},
			{
				from: "$$\na := \\text{text".length,
				to: "$$\na := \\text{text".length,
			},
			{
				from: "$$\na := \\text{text and $b =".length,
				to: "$$\na := \\text{text and $b =".length,
			},
			{
				from: "$$\na := \\text{text and $b = \\text{more ".length,
				to: "$$\na := \\text{text and $b = \\text{more ".length,
			},
			{
				from: "$$\na := \\text{text and $b = \\text{more stuff and $c +"
					.length,
				to: "$$\na := \\text{text and $b = \\text{more stuff and $c +"
					.length,
			},
			{
				from: "$$\na := \\text{text and $b = \\text{more stuff and $c + d$ and"
					.length,
				to: "$$\na := \\text{text and $b = \\text{more stuff and $c + d$ and"
					.length,
			},
			{
				from: "$$\na := \\text{text and $b = \\text{more stuff and $c + d$ and whatever} +"
					.length,
				to: "$$\na := \\text{text and $b = \\text{more stuff and $c + d$ and whatever} +"
					.length,
			},
			{
				from: "$$\na := \\text{text and $b = \\text{more stuff and $c + d$ and whatever} + e$ and"
					.length,
				to: "$$\na := \\text{text and $b = \\text{more stuff and $c + d$ and whatever} + e$ and"
					.length,
			},
			{
				from: "$$\na := \\text{text and $b = \\text{more stuff and $c + d$ and whatever} + e$ and stuff}\n"
					.length,
				to: "$$\na := \\text{text and $b = \\text{more stuff and $c + d$ and whatever} + e$ and stuff}\n"
					.length,
			},
		];

		const bound_ranges = [
			new BoundTokenPair(
				new PartialBoundToken("".length, "$$".length),
				new PartialBoundToken(
					"$$\na := \\text{text and $b = \\text{more stuff and $c + d$ and whatever} + e$ and stuff}\n".length,
					"$$\na := \\text{text and $b = \\text{more stuff and $c + d$ and whatever} + e$ and stuff}\n$$".length
				)
			),
			new BoundTokenPair(
				new PartialBoundToken(
					"$$\na := ".length,
					"$$\na := \\text{".length
				),
				new PartialBoundToken(
					"$$\na := \\text{text and $b = \\text{more stuff and $c + d$ and whatever} + e$ and stuff".length,
					"$$\na := \\text{text and $b = \\text{more stuff and $c + d$ and whatever} + e$ and stuff}".length
				)
			),
			new BoundTokenPair(
				new PartialBoundToken(
					"$$\na := \\text{text and ".length,
					"$$\na := \\text{text and $".length
				),
				new PartialBoundToken(
					"$$\na := \\text{text and $b = \\text{more stuff and $c + d$ and whatever} + e".length,
					"$$\na := \\text{text and $b = \\text{more stuff and $c + d$ and whatever} + e$".length
				)
			),
			new BoundTokenPair(
				new PartialBoundToken(
					"$$\na := \\text{text and $b = ".length,
					"$$\na := \\text{text and $b = \\text{".length
				),
				new PartialBoundToken(
					"$$\na := \\text{text and $b = \\text{more stuff and $c + d$ and whatever".length,
					"$$\na := \\text{text and $b = \\text{more stuff and $c + d$ and whatever}".length
				)
			),
			new BoundTokenPair(
				new PartialBoundToken(
					"$$\na := \\text{text and $b = \\text{more stuff and ".length,
					"$$\na := \\text{text and $b = \\text{more stuff and $".length
				),
				new PartialBoundToken(
					"$$\na := \\text{text and $b = \\text{more stuff and $c + d".length,
					"$$\na := \\text{text and $b = \\text{more stuff and $c + d$".length
				)
			),
		];
		expect(getContextBoundsAtSelection(doc, ranges)).toStrictEqual([
			bound_ranges.slice(0, 1),
			bound_ranges.slice(0, 2),
			bound_ranges.slice(0, 3),
			bound_ranges.slice(0, 4),
			bound_ranges.slice(0, 5),
			bound_ranges.slice(0, 4),
			bound_ranges.slice(0, 3),
			bound_ranges.slice(0, 2),
			bound_ranges.slice(0, 1),
		]);
	});

	test("handles an inline code block (`)", () => {
		const doc = new MockText("code `abc`, nicely formatted\n");
		const ranges: readonly MinimalSelectionRange[] = [
			{
				from: "code ".length,
				to: "code ".length,
			},
			{
				from: "code `a".length,
				to: "code `abc".length,
			},
			{
				from: "code `abc`, nicely".length,
				to: "code `abc`, nicely".length,
			},
		];

		expect(getContextBoundsAtSelection(doc, ranges)).toStrictEqual([
			[],
			[
				new BoundTokenPair(
					new PartialBoundToken("code ".length, "code `".length),
					new PartialBoundToken(
						"code `abc".length,
						"code `abc`".length
					)
				),
			],
			[],
		]);
	});

	test("returns one bound when inside a display code block (```)", () => {
		const doc = new MockText(
			"display code:\n```\nabc\n```\nnicely formatted"
		);
		const ranges: readonly MinimalSelectionRange[] = [
			{
				from: "display code:\n```\na".length,
				to: "display code:\n```\nab".length,
			},
		];

		expect(getContextBoundsAtSelection(doc, ranges)).toStrictEqual([
			[
				new BoundTokenPair(
					new PartialBoundToken(
						"display code:\n".length,
						"display code:\n```".length
					),
					new PartialBoundToken(
						"display code:\n```\nabc\n".length,
						"display code:\n```\nabc\n```".length
					)
				),
			],
		]);
	});
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
		lineSep?: string | undefined
	): string {
		assert(lineSep === undefined);
		return this.text.slice(from, to);
	}
}
