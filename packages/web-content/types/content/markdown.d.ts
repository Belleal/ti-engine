declare const _exports: {
    render: typeof render;
    renderInline: typeof renderInline;
    CONTAINERS: {
        "pull-quote": {
            tag: string;
            className: string;
            parts: string[];
        };
        "chapter-opener": {
            tag: string;
            className: string;
            parts: string[];
        };
        "language-example": {
            tag: string;
            className: string;
            parts: string[];
        };
        figure: {
            tag: string;
            className: string;
            parts: (string | null)[];
            unwrapImage: boolean;
        };
    };
    ALLOWED_ATTRIBUTES: string[];
};
export = _exports;
/**
 * Renders markdown to block-level HTML (paragraphs, headings, lists, and the editorial primitives).
 *
 * @param {string} source
 * @returns {import("../render/html.js").SafeString}
 */
declare function render(source: string): import("../render/html.js").SafeString;
/**
 * Renders markdown without the wrapping paragraph -- for summaries, blurbs, captions, and other single-line fields.
 *
 * @param {string} source
 * @returns {import("../render/html.js").SafeString}
 */
declare function renderInline(source: string): import("../render/html.js").SafeString;
