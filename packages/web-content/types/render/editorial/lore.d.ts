declare const _exports: {
    renderCharacterCards: typeof renderCharacterCards;
    renderAgePanels: typeof renderAgePanels;
    renderTimeStrip: typeof renderTimeStrip;
    renderTimeline: typeof renderTimeline;
};
export = _exports;
/**
 * `characterCards` -- portrait, name, title, description, and an optional pulled line of dialogue.
 *
 * @param {Object} section
 * @returns {import("../html.js").SafeString}
 */
declare function renderCharacterCards(section: Object): import("../html.js").SafeString;
/**
 * `agePanels` -- the eras, each with its abbreviation, name, gloss, and dating notation. The era hue is carried by
 * the panel modifier; the label text stays a contrast-safe token.
 *
 * @param {Object} section
 * @returns {import("../html.js").SafeString}
 */
declare function renderAgePanels(section: Object): import("../html.js").SafeString;
/**
 * `timeStrip` -- the partitioned day. Each partition is an empty div whose phase class carries the hue; the legend
 * names the phases in legible text. (Generic name for what the site calls the day cycle -- the phase vocabulary
 * stays site-specific, the component does not.)
 *
 * @param {Object} section
 * @returns {import("../html.js").SafeString}
 */
declare function renderTimeStrip(section: Object): import("../html.js").SafeString;
/**
 * `timeline` -- an ordered list of dated events; `major` promotes an entry typographically.
 *
 * @param {Object} section
 * @returns {import("../html.js").SafeString}
 */
declare function renderTimeline(section: Object): import("../html.js").SafeString;
