declare const _exports: {
    renderDictionary: typeof renderDictionary;
    groupEntries: typeof groupEntries;
    renderEntry: typeof renderEntry;
};
export = _exports;
/**
 * `dictionary` -- toolbar, jump index, count, and the grouped collapsible entries.
 *
 * @param {Object} section
 * @param {Object} context
 * @returns {import("../html.js").SafeString}
 */
declare function renderDictionary(section: Object, context: Object): import("../html.js").SafeString;
/**
 * Groups entries by their first letter, preserving alphabetical order within each group.
 *
 * @param {Object[]} entries
 * @returns {Array<{ letter: string, entries: Object[] }>}
 */
declare function groupEntries(entries: Object[]): Array<{
    letter: string;
    entries: Object[];
}>;
/**
 * One collapsible entry. `.dictionary-entry-rich` plus the `◇` marker signal that a declension table sits behind the
 * row, so a reader can see there is more before opening anything.
 *
 * @param {Object} entry
 * @param {number} index
 * @returns {import("../html.js").SafeString}
 */
declare function renderEntry(entry: Object, index: number): import("../html.js").SafeString;
