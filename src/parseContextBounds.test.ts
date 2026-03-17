// Import necessary dependencies
import { expect, test, describe } from "@jest/globals";
import { strict as assert } from "assert";

import { BoundType, ContextToken, MinimalText, parseContextTokens } from "./parseContextBounds";

describe("getContextBoundsAtSelection", () => {
	test("returns empty bounds when no bounds are present", () => {
		const doc = new MockText("this is just a bunch of text");

		expect(parseContextTokens(doc)).toStrictEqual([]);
	});

	test("handles an inline math block ($)", () => {
		const doc = new MockText("simple math $1 + 1 = 2$, nicely formatted\n");

		expect(parseContextTokens(doc)).toStrictEqual([
			new ContextToken(
				"simple math ".length,
				"simple math $".length,
				BoundType.Opening,
			),
			new ContextToken(
				"simple math $1 + 1 = 2".length,
				"simple math $1 + 1 = 2$".length,
				BoundType.Closing,
			),
		]);
	});

	test("handles a display math block ($$)", () => {
		const doc = new MockText(
			"display math:\n$$\n1 + 1 = 2\n$$\nnicely formatted",
		);

		expect(parseContextTokens(doc)).toStrictEqual([
			new ContextToken(
				"display math:\n".length,
				"display math:\n$$".length,
				BoundType.Opening,
			),
			new ContextToken(
				"display math:\n$$\n1 + 1 = 2\n".length,
				"display math:\n$$\n1 + 1 = 2\n$$".length,
				BoundType.Closing,
			),
		]);
	});

	test("handles multiple inline math blocks ($)", () => {
		const doc = new MockText(
			"math 1 $1 + 1 = 2$ followed by math 2 $1 - 1 = 0$",
		);
		expect(parseContextTokens(doc)).toStrictEqual([
			new ContextToken("math 1 ".length, "math 1 $".length, BoundType.Opening),
			new ContextToken(
				"math 1 $1 + 1 = 2".length,
				"math 1 $1 + 1 = 2$".length,
				BoundType.Closing,
			),
			new ContextToken(
				"math 1 $1 + 1 = 2$ followed by math 2 ".length,
				"math 1 $1 + 1 = 2$ followed by math 2 $".length,
				BoundType.Opening,
			),
			new ContextToken(
				"math 1 $1 + 1 = 2$ followed by math 2 $1 - 1 = 0"
					.length,
				"math 1 $1 + 1 = 2$ followed by math 2 $1 - 1 = 0$"
					.length,
				BoundType.Closing,
			),
		]);
	});

	test("handles multiple display math blocks ($$)", () => {
		const doc = new MockText(
			"math 1:\n$$1 + 1 = 2$$\nfollowed by math 2:\n$$1 - 1 = 0$$",
		);

		expect(parseContextTokens(doc)).toStrictEqual([
			new ContextToken(
				"math 1:\n".length,
				"math 1:\n$$".length,
				BoundType.Opening,
			),
			new ContextToken(
				"math 1:\n$$1 + 1 = 2".length,
				"math 1:\n$$1 + 1 = 2$$".length,
				BoundType.Closing,
			),
			new ContextToken(
				"math 1:\n$$1 + 1 = 2$$\nfollowed by math 2:\n".length,
				"math 1:\n$$1 + 1 = 2$$\nfollowed by math 2:\n$$"
					.length,
				BoundType.Opening,
			),
			new ContextToken(
				"math 1:\n$$1 + 1 = 2$$\nfollowed by math 2:\n$$1 - 1 = 0"
					.length,
				"math 1:\n$$1 + 1 = 2$$\nfollowed by math 2:\n$$1 - 1 = 0$$"
					.length,
				BoundType.Closing,
			),
		]);
	});

	test("handles mixed inline and display math blocks", () => {
		const doc = new MockText(
			"math 1:\n$$1 + 1 = 2$$\nfollowed by math 2 $1 - 1 = 0$",
		);

		expect(parseContextTokens(doc)).toStrictEqual([
			new ContextToken(
				"math 1:\n".length,
				"math 1:\n$$".length,
				BoundType.Opening,
			),
			new ContextToken(
				"math 1:\n$$1 + 1 = 2".length,
				"math 1:\n$$1 + 1 = 2$$".length,
				BoundType.Closing,
			),
			new ContextToken(
				"math 1:\n$$1 + 1 = 2$$\nfollowed by math 2 ".length,
				"math 1:\n$$1 + 1 = 2$$\nfollowed by math 2 $".length,
				BoundType.Opening,
			),
			new ContextToken(
				"math 1:\n$$1 + 1 = 2$$\nfollowed by math 2 $1 - 1 = 0"
					.length,
				"math 1:\n$$1 + 1 = 2$$\nfollowed by math 2 $1 - 1 = 0$"
					.length,
				BoundType.Closing,
			),
		]);
	});

	test("ignores inline math block ($) when start bound is followed by whitespace", () => {
		const doc = new MockText("$ text$math$text$bad");

		expect(parseContextTokens(doc)).toStrictEqual([
			new ContextToken("$ text".length, "$ text$".length, BoundType.Opening),
			new ContextToken(
				"$ text$math".length,
				"$ text$math$".length,
				BoundType.Closing,
			),
			new ContextToken(
				"$ text$math$text".length,
				"$ text$math$text$".length,
				BoundType.Opening,
			),
		]);
	});

	test("ignores inline math block ($) when end bound is preceded by whitespace", () => {
		const doc = new MockText("$text $math$text$bad");

		expect(parseContextTokens(doc)).toStrictEqual([
			new ContextToken("$text ".length, "$text $".length, BoundType.Opening),
			new ContextToken(
				"$text $math".length,
				"$text $math$".length,
				BoundType.Closing,
			),
			new ContextToken(
				"$text $math$text".length,
				"$text $math$text$".length,
				BoundType.Opening,
			),
		]);
	});

	test("ignores a newline (\\n) inside an inline math block ($)", () => {
		const doc = new MockText("text and $a + b \n = c$\n then more text");

		expect(parseContextTokens(doc)).toStrictEqual([
			new ContextToken("text and ".length, "text and $".length, BoundType.Opening),
			new ContextToken(
				"text and $a + b \n = c".length,
				"text and $a + b \n = c$".length,
				BoundType.Closing,
			),
		]);
	});

	test("ignores escaped bound (\\$) before inline math block ($)", () => {
		const doc = new MockText(
			"little bit of \\$ munny and $some math$ afterwards",
		);

		expect(parseContextTokens(doc)).toStrictEqual([
			new ContextToken(
				"little bit of \\$ munny and ".length,
				"little bit of \\$ munny and $".length,
				BoundType.Opening,
			),
			new ContextToken(
				"little bit of \\$ munny and $some math".length,
				"little bit of \\$ munny and $some math$".length,
				BoundType.Closing,
			),
		]);
	});

	test("ignores escaped bound (\\$) inside inline math block ($)", () => {
		const doc = new MockText("little bit of $math with \\$ munny$ here");

		expect(parseContextTokens(doc)).toStrictEqual([
			new ContextToken(
				"little bit of ".length,
				"little bit of $".length,
				BoundType.Opening,
			),
			new ContextToken(
				"little bit of $math with \\$ munny".length,
				"little bit of $math with \\$ munny$".length,
				BoundType.Closing,
			),
		]);
	});

	test("terminates an inline math block ($) with an un-terminated text block (`\\text{`)", () => {
		const doc = new MockText("text $math\\text{hello$} text");

		expect(parseContextTokens(doc)).toStrictEqual([
			new ContextToken(
				"text ".length,
				"text $".length,
				BoundType.Opening,
			),
			new ContextToken(
				"text $math".length,
				"text $math\\text{".length,
				BoundType.Opening,
			),
			undefined,
			new ContextToken(
				"text $math\\text{hello".length,
				"text $math\\text{hello$".length,
				BoundType.Closing,
			),
		]);
	});

	test("identifies text inside an inline math block ($)", () => {
		const doc = new MockText("$a := \\text{text and stuff}$");

		expect(parseContextTokens(doc)).toStrictEqual([
			new ContextToken("".length, "$".length,
				BoundType.Opening,
			),
			new ContextToken("$a := ".length, "$a := \\text{".length,
				BoundType.Opening,
			),
			new ContextToken(
				"$a := \\text{text and stuff".length,
				"$a := \\text{text and stuff}".length,
				BoundType.Closing,
			),
			new ContextToken(
				"$a := \\text{text and stuff}".length,
				"$a := \\text{text and stuff}$".length,
				BoundType.Closing,
			),
		]);
	});

	test("identifies text inside a display math block ($$)", () => {
		const doc = new MockText("$$\na := \\text{text and stuff}\n$$");

		expect(parseContextTokens(doc)).toStrictEqual([
			new ContextToken("".length, "$$".length,
				BoundType.Opening,
			),
			new ContextToken(
				"$$\na := ".length,
				"$$\na := \\text{".length,
				BoundType.Opening,
			),
			new ContextToken(
				"$$\na := \\text{text and stuff".length,
				"$$\na := \\text{text and stuff}".length,
				BoundType.Closing,
			),
			new ContextToken(
				"$$\na := \\text{text and stuff}\n".length,
				"$$\na := \\text{text and stuff}\n$$".length,
				BoundType.Closing,
			),
		]);
	});

	test("allows simple nested equations and text inside a display math block ($$)", () => {
		const doc = new MockText(
			"$$\na := \\text{text and $b = e$ and stuff}\n$$",
		);

		expect(parseContextTokens(doc)).toStrictEqual([
			new ContextToken("".length, "$$".length,
				BoundType.Opening,
			),
			new ContextToken(
				"$$\na := ".length,
				"$$\na := \\text{".length,
				BoundType.Opening,
			),
			new ContextToken(
				"$$\na := \\text{text and ".length,
				"$$\na := \\text{text and $".length,
				BoundType.Opening,
			),
			new ContextToken(
				"$$\na := \\text{text and $b = e".length,
				"$$\na := \\text{text and $b = e$".length,
				BoundType.Closing,
			),
			new ContextToken(
				"$$\na := \\text{text and $b = e$ and stuff".length,
				"$$\na := \\text{text and $b = e$ and stuff}".length,
				BoundType.Closing,
			),
			new ContextToken(
				"$$\na := \\text{text and $b = e$ and stuff}\n".length,
				"$$\na := \\text{text and $b = e$ and stuff}\n$$".length,
				BoundType.Closing,
			),
		]);
	});

	test("allows nested equations and text inside a display math block ($$)", () => {
		const doc = new MockText(
			"$$\na := \\text{text and $b = \\text{more stuff and $c + d$ and whatever} + e$ and stuff}\n$$",
		);

		expect(parseContextTokens(doc)).toStrictEqual([
			new ContextToken("".length, "$$".length,
				BoundType.Opening,
			),
			new ContextToken(
				"$$\na := ".length,
				"$$\na := \\text{".length,
				BoundType.Opening,
			),
			new ContextToken(
				"$$\na := \\text{text and ".length,
				"$$\na := \\text{text and $".length,
				BoundType.Opening,
			),
			new ContextToken(
				"$$\na := \\text{text and $b = ".length,
				"$$\na := \\text{text and $b = \\text{".length,
				BoundType.Opening,
			),
			new ContextToken(
				"$$\na := \\text{text and $b = \\text{more stuff and "
					.length,
				"$$\na := \\text{text and $b = \\text{more stuff and $"
					.length,
				BoundType.Opening,
			),
			new ContextToken(
				"$$\na := \\text{text and $b = \\text{more stuff and $c + d"
					.length,
				"$$\na := \\text{text and $b = \\text{more stuff and $c + d$"
					.length,
				BoundType.Closing,
			),
			new ContextToken(
				"$$\na := \\text{text and $b = \\text{more stuff and $c + d$ and whatever"
					.length,
				"$$\na := \\text{text and $b = \\text{more stuff and $c + d$ and whatever}"
					.length,
				BoundType.Closing,
			),
			new ContextToken(
				"$$\na := \\text{text and $b = \\text{more stuff and $c + d$ and whatever} + e"
					.length,
				"$$\na := \\text{text and $b = \\text{more stuff and $c + d$ and whatever} + e$"
					.length,
				BoundType.Closing,
			),
			new ContextToken(
				"$$\na := \\text{text and $b = \\text{more stuff and $c + d$ and whatever} + e$ and stuff"
					.length,
				"$$\na := \\text{text and $b = \\text{more stuff and $c + d$ and whatever} + e$ and stuff}"
					.length,
				BoundType.Closing,
			),
			new ContextToken(
				"$$\na := \\text{text and $b = \\text{more stuff and $c + d$ and whatever} + e$ and stuff}\n"
					.length,
				"$$\na := \\text{text and $b = \\text{more stuff and $c + d$ and whatever} + e$ and stuff}\n$$"
					.length,
				BoundType.Closing,
			),
		]);
	});

	test("identifies sub-contexts inside an inline math block ($)", () => {
		const doc = new MockText(
			"$\\bar X := \\frac{1}{n} \\sum_{i = 1}^{n} X_i$",
		);

		expect(parseContextTokens(doc)).toStrictEqual([
			new ContextToken("".length, "$".length,
				BoundType.Opening,
			),
			new ContextToken(
				"$\\bar X := ".length,
				"$\\bar X := \\frac{".length,
				BoundType.Opening,
			),
			new ContextToken(
				"$\\bar X := \\frac{1".length,
				"$\\bar X := \\frac{1}".length,
				BoundType.Closing,
			),
			new ContextToken(
				"$\\bar X := \\frac{1}".length,
				"$\\bar X := \\frac{1}{".length,
				BoundType.Opening,
			),
			new ContextToken(
				"$\\bar X := \\frac{1}{n".length,
				"$\\bar X := \\frac{1}{n}".length,
				BoundType.Closing,
			),
			new ContextToken(
				"$\\bar X := \\frac{1}{n} \\sum_".length,
				"$\\bar X := \\frac{1}{n} \\sum_{".length,
				BoundType.Opening,
			),
			new ContextToken(
				"$\\bar X := \\frac{1}{n} \\sum_{i = 1".length,
				"$\\bar X := \\frac{1}{n} \\sum_{i = 1}".length,
				BoundType.Closing,
			),
			new ContextToken(
				"$\\bar X := \\frac{1}{n} \\sum_{i = 1}^".length,
				"$\\bar X := \\frac{1}{n} \\sum_{i = 1}^{"
					.length,
				BoundType.Opening,
			),
			new ContextToken(
				"$\\bar X := \\frac{1}{n} \\sum_{i = 1}^{n".length,
				"$\\bar X := \\frac{1}{n} \\sum_{i = 1}^{n}"
					.length,
				BoundType.Closing,
			),
			new ContextToken(
				"$\\bar X := \\frac{1}{n} \\sum_{i = 1}^{n} X_i".length,
				"$\\bar X := \\frac{1}{n} \\sum_{i = 1}^{n} X_i$"
					.length,
				BoundType.Closing,
			),
		]);
	});

	test("identifies sub-contexts inside a display math block ($$)", () => {
		const doc = new MockText(
			"$$\n\\bar X := \\frac{1}{n} \\sum_{i = 1}^{n} X_i\n$$",
		);

		expect(parseContextTokens(doc)).toStrictEqual([
			new ContextToken("".length, "$$".length,
				BoundType.Opening,
			),
			new ContextToken(
				"$$\n\\bar X := ".length,
				"$$\n\\bar X := \\frac{".length,
				BoundType.Opening,
			),
			new ContextToken(
				"$$\n\\bar X := \\frac{1".length,
				"$$\n\\bar X := \\frac{1}".length,
				BoundType.Closing,
			),
			new ContextToken(
				"$$\n\\bar X := \\frac{1}".length,
				"$$\n\\bar X := \\frac{1}{".length,
				BoundType.Opening,
			),
			new ContextToken(
				"$$\n\\bar X := \\frac{1}{n".length,
				"$$\n\\bar X := \\frac{1}{n}".length,
				BoundType.Closing,
			),
			new ContextToken(
				"$$\n\\bar X := \\frac{1}{n} \\sum_".length,
				"$$\n\\bar X := \\frac{1}{n} \\sum_{".length,
				BoundType.Opening,
			),
			new ContextToken(
				"$$\n\\bar X := \\frac{1}{n} \\sum_{i = 1".length,
				"$$\n\\bar X := \\frac{1}{n} \\sum_{i = 1}".length,
				BoundType.Closing,
			),
			new ContextToken(
				"$$\n\\bar X := \\frac{1}{n} \\sum_{i = 1}^"
					.length,
				"$$\n\\bar X := \\frac{1}{n} \\sum_{i = 1}^{"
					.length,
				BoundType.Opening,
			),
			new ContextToken(
				"$$\n\\bar X := \\frac{1}{n} \\sum_{i = 1}^{n"
					.length,
				"$$\n\\bar X := \\frac{1}{n} \\sum_{i = 1}^{n}"
					.length,
				BoundType.Closing,
			),
			new ContextToken(
				"$$\n\\bar X := \\frac{1}{n} \\sum_{i = 1}^{n} X_i\n"
					.length,
				"$$\n\\bar X := \\frac{1}{n} \\sum_{i = 1}^{n} X_i\n$$"
					.length,
				BoundType.Closing,
			),
		]);
	});

	test("handles an inline code block (`)", () => {
		const doc = new MockText("code `abc`, nicely formatted\n");

		expect(parseContextTokens(doc)).toStrictEqual([
			new ContextToken("code ".length, "code `".length,
				BoundType.Opening,
			),
			new ContextToken(
				"code `abc".length,
				"code `abc`".length,
				BoundType.Closing,
			),
		]);
	});

	test("returns one bound when inside a display code block (```)", () => {
		const doc = new MockText(
			"display code:\n```\nabc\n```\nnicely formatted",
		);

		expect(parseContextTokens(doc)).toStrictEqual([
			new ContextToken(
				"display code:\n".length,
				"display code:\n```".length,
				BoundType.Opening,
			),
			new ContextToken(
				"display code:\n```\nabc\n".length,
				"display code:\n```\nabc\n```".length,
				BoundType.Closing,
			),
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
		lineSep?: string | undefined,
	): string {
		assert(lineSep === undefined);
		return this.text.slice(from, to);
	}
}
