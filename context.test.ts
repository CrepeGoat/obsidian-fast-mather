// Import necessary dependencies
import { expect, test, describe } from "@jest/globals";
import { strict as assert } from "assert";

import {
	getContextBoundsAtSelection,
	MajorContextTypes,
	ContextToken,
	BoundType,
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

	test("returns one bound when inside an inline math block ($)", () => {
		const doc = new MockText("simple math $1 + 1 = 2$, nicely formatted");
		const ranges: readonly MinimalSelectionRange[] = [
			{
				from: "simple math $1 + ".length,
				to: "simple math $1 + 1 =".length,
			},
		];

		expect(getContextBoundsAtSelection(doc, ranges)).toStrictEqual([
			[
				new ContextToken(
					"simple math ".length,
					"simple math $".length,
					BoundType.Opening
				),
			],
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
				new ContextToken(
					"display math:\n".length,
					"display math:\n$$".length,
					BoundType.Opening
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
