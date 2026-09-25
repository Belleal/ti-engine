declare const _exports: {
    VERSION_LENGTH: number;
    digestOf: typeof digestOf;
    versionOf: typeof versionOf;
    addressFragmentReferences: typeof addressFragmentReferences;
};
export = _exports;
/**
 * The SHA-256 of a fragment's markup, in hex.
 *
 * @method
 * @param {string} markup
 * @returns {string}
 * @public
 */
declare function digestOf(markup: string): string;
/**
 * The version that addresses a set of fragments: a hash over every member's identifier and digest, in identifier
 * order, so it does not depend on the order they were registered in.
 *
 * @method
 * @param {Map<string, string>} digestsByIdentifier
 * @returns {string}
 * @public
 */
declare function versionOf(digestsByIdentifier: Map<string, string>): string;
/**
 * Addresses every reference to an immutable screen in an HTML fragment: `hx-get="/app/<id>"` becomes
 * `hx-get="/app/<id>?v=<version>"` for every `<id>` in `identifiers`, and a `true` history attribute on the same tag
 * becomes the screen's plain path. Nothing else changes: other screens, references that carry a query, and anything
 * inside a comment, `<script>` or `<style>`.
 *
 * @method
 * @param {string} html
 * @param {Set<string>} identifiers The immutable fragments' identifiers.
 * @param {string} version The version that addresses them.
 * @returns {string}
 * @public
 */
declare function addressFragmentReferences(html: string, identifiers: Set<string>, version: string): string;
