/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
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
