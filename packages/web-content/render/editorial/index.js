/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * The editorial component library -- one body renderer per section type, grouped by kind rather than one file per
 * component (fifteen single-function files would be more files than content). `render/sections.js` binds these into
 * the type registry and supplies the shared wrapper and chrome.
 *
 * Every component takes ( section, context ) and returns a SafeString of the section BODY only. None of them emits a
 * style attribute, and none reads the content store directly -- the query-bearing ones (featured, postList) go
 * through the repository passed in the context, so visibility filtering applies to them like every other surface.
 */

const text = require( "./text.js" );
const media = require( "./media.js" );
const lore = require( "./lore.js" );
const listing = require( "./listing.js" );
const forms = require( "./forms.js" );
const dictionary = require( "./dictionary.js" );

module.exports = {
    // text.js
    renderProse: text.renderProse,
    renderVerse: text.renderVerse,
    renderClosing: text.renderClosing,
    renderLanguageExample: text.renderLanguageExample,
    // media.js
    renderHero: media.renderHero,
    renderGallery: media.renderGallery,
    renderAudio: media.renderAudio,
    // lore.js
    renderCharacterCards: lore.renderCharacterCards,
    renderAgePanels: lore.renderAgePanels,
    renderTimeStrip: lore.renderTimeStrip,
    renderTimeline: lore.renderTimeline,
    // listing.js
    renderFeatured: listing.renderFeatured,
    renderPostList: listing.renderPostList,
    renderPostCard: listing.renderPostCard,
    renderPagination: listing.renderPagination,
    // forms.js
    renderCapture: forms.renderCapture,
    renderFormStatus: forms.renderFormStatus,
    // dictionary.js
    renderDictionary: dictionary.renderDictionary
};
