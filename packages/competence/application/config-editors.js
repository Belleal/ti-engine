/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/**
 * Composite (entity) editors for the competence configuration. Each editor projects a domain entity out of one or more
 * configuration documents (`compose`) and scatters an edited entity back into them (`decompose`), so the admin UI edits
 * a coherent entity rather than raw label keys spread across files. Registered with the framework config service via
 * {@link registerCompetenceEditors} → `TiWebAppManager.registerConfigEditor` → {@link ConfigService#registerEditor}.
 *
 * @module config-editors
 */

const SCOPE_LEVELS = [ "N", "J", "R", "S", "X", "T" ];

/**
 * @method
 * @param {*} value
 * @returns {*}
 * @private
 */
function clone( value ) {
    return ( value === undefined || value === null ) ? value : JSON.parse( JSON.stringify( value ) );
}

/**
 * Normalizes a bilingual leaf to a plain `{ en, bg }` of strings (missing sides become empty).
 *
 * @method
 * @param {Object} [leaf]
 * @returns {{en: string, bg: string}}
 * @private
 */
function pair( leaf ) {
    return {
        en: ( leaf && typeof leaf.en === "string" ) ? leaf.en : "",
        bg: ( leaf && typeof leaf.bg === "string" ) ? leaf.bg : ""
    };
}

/**
 * Merges an edited `{ en, bg }` over the existing leaf, preferring edited strings and falling back to the existing
 * value when a side is omitted — so a partial edit (or a payload that drops the read-only reference language) never
 * blanks the other language.
 *
 * @method
 * @param {Object} [edited]
 * @param {Object} [existing]
 * @returns {{en: string, bg: string}}
 * @private
 */
function mergeLeaf( edited, existing ) {
    const base = existing || {};
    const next = edited || {};
    return {
        en: ( typeof next.en === "string" ) ? next.en : ( typeof base.en === "string" ? base.en : "" ),
        bg: ( typeof next.bg === "string" ) ? next.bg : ( typeof base.bg === "string" ? base.bg : "" )
    };
}

/**
 * Position of a key within an object's insertion order (used to honour the canonical category/subcategory order rather
 * than alphabetical). Unknown keys sort last.
 *
 * @method
 * @param {Object} [object]
 * @param {string} key
 * @returns {number}
 * @private
 */
function indexOfKey( object, key ) {
    const keys = object ? Object.keys( object ) : [];
    const index = keys.indexOf( key );
    return index < 0 ? Number.MAX_SAFE_INTEGER : index;
}

/**
 * Numeric ordinal parsed from a competency code's trailing segment (e.g. `E1-12` → 12), so codes sort 1,2,…,10,11
 * rather than lexically.
 *
 * @method
 * @param {string} code
 * @returns {number}
 * @private
 */
function codeOrdinal( code ) {
    const suffix = String( code || "" ).split( "-" ).pop();
    const ordinal = parseInt( suffix, 10 );
    return Number.isFinite( ordinal ) ? ordinal : Number.MAX_SAFE_INTEGER;
}

/**
 * `competency-text` editor — projects each competency's editable texts (name, description, and the six scope anchors),
 * bilingual, out of the dictionary (for grouping + order) and the labels document (the text source). The rows carry
 * read-only grouping context (category/subcategory codes + names) for the UI. **Writes back only the labels document.**
 *
 * @method
 * @param {Object} docs `{ competencies, "competence-labels" }`
 * @returns {Array<Object>} competency rows ordered category → subcategory → index
 * @public
 */
function composeCompetencyText( docs ) {
    const dictionary = ( docs && docs.competencies ) || {};
    const labels = ( docs && docs[ "competence-labels" ] ) || {};
    const competencies = dictionary.competencies || {};
    const categories = dictionary.categories || {};
    const competencyLabels = labels.competency || {};
    const nameLabels = competencyLabels.name || {};
    const descriptionLabels = competencyLabels.description || {};
    const scopeLabels = competencyLabels.scope || {};
    const categoryNames = ( labels.category && labels.category.name ) || {};
    const subcategoryNames = ( labels.category && labels.category.sub && labels.category.sub.name ) || {};

    const rows = Object.keys( competencies ).map( ( code ) => {
        const competency = competencies[ code ] || {};
        const scopeLeaf = scopeLabels[ code ] || {};
        const scope = {};
        SCOPE_LEVELS.forEach( ( level ) => {
            scope[ level ] = pair( scopeLeaf[ level ] );
        } );
        return {
            code: code,
            category: competency.category || "",
            subcategory: competency.subcategory || "",
            categoryName: pair( categoryNames[ competency.category ] ),
            subcategoryName: pair( subcategoryNames[ competency.subcategory ] ),
            name: pair( nameLabels[ code ] ),
            description: pair( descriptionLabels[ code ] ),
            scope: scope
        };
    } );

    rows.sort( ( a, b ) => {
        const categoryOrderA = indexOfKey( categories, a.category );
        const categoryOrderB = indexOfKey( categories, b.category );
        if ( categoryOrderA !== categoryOrderB ) {
            return categoryOrderA - categoryOrderB;
        }
        const subcategoriesA = ( categories[ a.category ] && categories[ a.category ].subcategories ) || {};
        const subcategoriesB = ( categories[ b.category ] && categories[ b.category ].subcategories ) || {};
        const subcategoryOrderA = indexOfKey( subcategoriesA, a.subcategory );
        const subcategoryOrderB = indexOfKey( subcategoriesB, b.subcategory );
        if ( subcategoryOrderA !== subcategoryOrderB ) {
            return subcategoryOrderA - subcategoryOrderB;
        }
        const ordinalA = codeOrdinal( a.code );
        const ordinalB = codeOrdinal( b.code );
        if ( ordinalA !== ordinalB ) {
            return ordinalA - ordinalB;
        }
        return a.code < b.code ? -1 : ( a.code > b.code ? 1 : 0 );
    } );

    return rows;
}

/**
 * Scatters edited `competency-text` rows back into the labels document and returns the **full** new labels value (the
 * composite save validates + versions the whole document). Only the texts present on the supplied rows are overlaid, so
 * a partial set of rows leaves every other competency — and every non-competency label — untouched. **Writes labels
 * only**; the dictionary is read-only here.
 *
 * @method
 * @param {Array<Object>|{rows: Array<Object>}} editedView rows from {@link composeCompetencyText}
 * @param {Object} docs current `{ "competence-labels" }`
 * @returns {Object<string, Object>} `{ "competence-labels": newValue }`
 * @public
 */
function decomposeCompetencyText( editedView, docs ) {
    const rows = Array.isArray( editedView ) ? editedView : ( ( editedView && editedView.rows ) || [] );
    const labels = clone( docs && docs[ "competence-labels" ] ) || {};
    labels.competency = labels.competency || {};
    labels.competency.name = labels.competency.name || {};
    labels.competency.description = labels.competency.description || {};
    labels.competency.scope = labels.competency.scope || {};

    rows.forEach( ( row ) => {
        if ( !row || !row.code ) {
            return;
        }
        const code = row.code;
        labels.competency.name[ code ] = mergeLeaf( row.name, labels.competency.name[ code ] );
        labels.competency.description[ code ] = mergeLeaf( row.description, labels.competency.description[ code ] );
        const scopeLeaf = labels.competency.scope[ code ] || {};
        const editedScope = row.scope || {};
        SCOPE_LEVELS.forEach( ( level ) => {
            scopeLeaf[ level ] = mergeLeaf( editedScope[ level ], scopeLeaf[ level ] );
        } );
        labels.competency.scope[ code ] = scopeLeaf;
    } );

    return { "competence-labels": labels };
}

/**
 * The `competency-text` composite editor definition (the BG-review screen's data source).
 *
 * @constant
 * @type {Object}
 */
const competencyTextEditor = {
    documents: [ "competencies", "competence-labels" ],
    compose: composeCompetencyText,
    decompose: decomposeCompetencyText,
    metadata: { label: "competency.text-editor", writes: [ "competence-labels" ] }
};

/**
 * Registers competence's composite editors with the framework config service.
 *
 * @method
 * @param {TiWebAppManager} app
 * @returns {TiWebAppManager} app (chainable)
 * @public
 */
function registerCompetenceEditors( app ) {
    app.registerConfigEditor( "competency-text", competencyTextEditor );
    return app;
}

module.exports = {
    SCOPE_LEVELS,
    composeCompetencyText,
    decomposeCompetencyText,
    competencyTextEditor,
    registerCompetenceEditors
};
