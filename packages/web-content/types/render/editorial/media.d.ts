declare const _exports: {
    renderHero: typeof renderHero;
    renderGallery: typeof renderGallery;
    renderAudio: typeof renderAudio;
};
export = _exports;
/**
 * `hero` -- the page opener. `title` may carry an accented fragment, which the theme colours; the accent is a span
 * rather than a second heading so the title remains one string for assistive technology.
 *
 * @param {Object} section
 * @returns {import("../html.js").SafeString}
 */
declare function renderHero(section: Object): import("../html.js").SafeString;
/**
 * `gallery` -- figures with captions. `alt` is required per image for the picture to mean anything without sight of
 * it; an empty string is accepted (decorative) but the attribute is always present.
 *
 * @param {Object} section
 * @returns {import("../html.js").SafeString}
 */
declare function renderGallery(section: Object): import("../html.js").SafeString;
/**
 * `audio` -- a preview player. The rail is inert markup; the site script wires playback and sets the progress width
 * through a custom property, never an inline style.
 *
 * @param {Object} section
 * @returns {import("../html.js").SafeString}
 */
declare function renderAudio(section: Object): import("../html.js").SafeString;
