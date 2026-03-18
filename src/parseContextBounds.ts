import { strict as assert } from "assert";
import { COMMANDS } from "./mathjax-commands";

export const COMMANDS_BOUNDS: ReadonlyArray<string> = COMMANDS.filter(
    (command) => command.argument_count ?? 0 > 0,
).map((command) => "\\" + command.command + "{");
export const TEXT_COMMANDS_BOUNDS: ReadonlyArray<string> = COMMANDS.filter(
    (command) => command.text_argument === true,
).map((command) => "\\" + command.command + "{");

export function parseContextTokens(doc: MinimalText): (ContextToken | undefined)[] {
    let result: (ContextToken | undefined)[] = [];
    let stack: (ContextToken | undefined)[] = [];

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
                    firstContextTokenText === "`" ? "inline" : "display",
                ) ?? i_doc + 1;
            continue;
        }
    }

    return result;
}

function parseContextTokenInText(
    doc: MinimalText,
    i_doc: number,
    stack: (ContextToken | undefined)[],
    result: (ContextToken | undefined)[],
): number | undefined {
    let startBoundTokenTexts = ["$$", "```", "$", "`"];
    for (let startBoundTokenText of startBoundTokenTexts) {
        if (textAtEquals(doc, i_doc, startBoundTokenText, true)) {
            pushOpeningToken(stack, result, i_doc, startBoundTokenText.length);
            return i_doc + startBoundTokenText.length;
        }
    }

    return undefined;
}

function parseContextTokenInNestedText(
    doc: MinimalText,
    i_doc: number,
    stack: (ContextToken | undefined)[],
    result: (ContextToken | undefined)[],
    nestedMathAllowed: boolean = true,
): number | undefined {
    if (nestedMathAllowed) {
        const startBoundTokenText = "$";
        if (textAtEquals(doc, i_doc, startBoundTokenText, true)) {
            pushOpeningToken(stack, result, i_doc, startBoundTokenText.length);
            return i_doc + startBoundTokenText.length;
        }
    }

    const endBoundTokenText = "}";
    if (textAtEquals(doc, i_doc, endBoundTokenText, true)) {
        pushClosingToken(stack, result, i_doc, endBoundTokenText.length);
        return i_doc + endBoundTokenText.length;
    }
    return undefined;
}

function parseContextTokenInInlineMath(
    doc: MinimalText,
    i_doc: number,
    stack: (ContextToken | undefined)[],
    result: (ContextToken | undefined)[],
): number | undefined {
    assert(stack[0]?.text(doc) === "$");
    const activeMathOpeningBoundPos = 0; // no nested math -> active bound is always the first

    let mode: "math" | "text" = "math";
    for (let token of stack.slice(1)) {
        if (token !== undefined && TEXT_COMMANDS_BOUNDS.includes(token?.text(doc))) {
            mode = "text";
            break;
        }
    }

    let out = undefined;
    if (mode === "math") {
        out = parseContextTokenInNestedMath(
            doc,
            i_doc,
            stack,
            result,
            activeMathOpeningBoundPos,
        );
    } else {
        out = parseContextTokenInNestedText(doc, i_doc, stack, result, false);
    }
    if (out !== undefined) {
        return out;
    }

    const closingBoundTokenText = "$";
    if (
        textAtEquals(doc, i_doc, closingBoundTokenText, true)
    ) {
        // interrupt all other active open bounds
        while (activeMathOpeningBoundPos < stack.length - 1) {
            stack.pop();
            result.push(undefined);
        }
        stack.splice(activeMathOpeningBoundPos + 1);

        pushClosingToken(stack, result, i_doc, closingBoundTokenText.length);
        return i_doc + closingBoundTokenText.length;
    }

    return undefined;
}

function parseContextTokenInDisplayMath(
    doc: MinimalText,
    i_doc: number,
    stack: (ContextToken | undefined)[],
    result: (ContextToken | undefined)[],
): number | undefined {
    assert(stack[0]?.text(doc) === "$$");

    const lastNestedMathToken = stack.findLastIndex(
        (token) => token?.text(doc) === "$",
    );
    const lastNestedTextToken =
        1 +
        lastNestedMathToken +
        stack
            .slice(lastNestedMathToken + 1)
            .findIndex((token) =>
                token !== undefined && TEXT_COMMANDS_BOUNDS.includes(token.text(doc)),
            );
    const activeMathOpeningBoundPos =
        lastNestedMathToken === -1 ? 0 : lastNestedMathToken;
    const closingBoundTokenText = stack[activeMathOpeningBoundPos]!.text(doc);
    assert(["$$", "$"].includes(closingBoundTokenText));

    let out = undefined;
    const mode: "math" | "text" =
        lastNestedTextToken > lastNestedMathToken ? "text" : "math";
    if (mode === "math") {
        out = parseContextTokenInNestedMath(
            doc,
            i_doc,
            stack,
            result,
            activeMathOpeningBoundPos,
        );
    } else {
        out = parseContextTokenInNestedText(doc, i_doc, stack, result);
    }
    if (out !== undefined) {
        return out;
    }

    if (
        textAtEquals(doc, i_doc, closingBoundTokenText, true)
    ) {
        // interrupt all other active open bounds
        stack.splice(activeMathOpeningBoundPos + 1);

        pushClosingToken(stack, result, i_doc, closingBoundTokenText.length);
        return i_doc + closingBoundTokenText.length;
    }

    return undefined;
}

function parseContextTokenInNestedMath(
    doc: MinimalText,
    i_doc: number,
    stack: (ContextToken | undefined)[],
    result: (ContextToken | undefined)[],
    i_stackActiveBound: number,
): number | undefined {
    for (const commandBoundText of COMMANDS_BOUNDS) {
        if (textAtEquals(doc, i_doc, commandBoundText)) {
            pushOpeningToken(stack, result, i_doc, commandBoundText.length);
            return i_doc + commandBoundText.length;
        }
    }

    if (textAtEquals(doc, i_doc, "{", true)) {
        pushOpeningToken(stack, result, i_doc, 1);
        return i_doc + 1;
    }

    if (i_stackActiveBound >= stack.length - 1) {
        return undefined;
    }

    const prevBoundText = stack[stack.length - 1]?.text(doc);
    if (
        ((prevBoundText?.at(0) === "\\" && prevBoundText.at(-1) === "{") ||
            prevBoundText === "{") &&
        textAtEquals(doc, i_doc, "}", true)
    ) {
        pushClosingToken(stack, result, i_doc, 1);
        return i_doc + 1;
    }

    return undefined;
}

function parseContextTokenInCode(
    doc: MinimalText,
    i_doc: number,
    stack: (ContextToken | undefined)[],
    result: (ContextToken | undefined)[],
    boundType: "inline" | "display",
): number | undefined {
    assert(["```", "`"].includes(stack[0]?.text(doc) ?? ""));

    let endBoundTokenTexts = [];
    if (boundType === "inline") {
        // newlines terminate inline code blocks
        endBoundTokenTexts = ["`", "\n"];
    } else {
        // if (boundType === "display") {
        endBoundTokenTexts = ["```"];
    }

    for (const endBoundTokenText of endBoundTokenTexts) {
        if (textAtEquals(doc, i_doc, endBoundTokenText, true)) {
            pushClosingToken(stack, result, i_doc, endBoundTokenText.length);
            return i_doc + endBoundTokenText.length;
        }
    }

    return undefined;
}

function textAtEquals(doc: MinimalText, i_doc: number, text: string, unescaped = false) {
    return doc.sliceString(i_doc, i_doc + text.length) === text
        && (!unescaped || (doc.sliceString(i_doc - 1, i_doc) !== "\\"));
}

function pushOpeningToken(
    stack: (ContextToken | undefined)[],
    result: (ContextToken | undefined)[],
    i_doc: number,
    length: number,
) {
    const contextToken = new ContextToken(
        i_doc,
        i_doc + length,
        BoundType.Opening,
    );
    stack.push(contextToken);
    result.push(contextToken);
}

function pushClosingToken(
    stack: (ContextToken | undefined)[],
    result: (ContextToken | undefined)[],
    i_doc: number,
    length: number,
) {
    stack.pop();
    result.push(new ContextToken(i_doc, i_doc + length, BoundType.Closing));
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
        lineSep?: string | undefined,
    ): string;
}

export enum BoundType {
    Opening,
    Closing,
}
