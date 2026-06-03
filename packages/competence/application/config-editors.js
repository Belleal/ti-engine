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
 * a coherent entity rather than raw label keys / weight maps spread across files. Registered with the framework config
 * service via {@link registerCompetenceEditors} → `TiWebAppManager.registerConfigEditor` → {@link ConfigService#registerEditor}.
 *
 * @module config-editors
 */

const SCOPE_LEVELS = [ "N", "J", "R", "S", "X", "T" ];
const ARCHETYPE_STAGE_LEVELS = [ "N1", "J1", "J2", "J3", "R1", "R2", "R3", "S1", "S2", "S3", "X1", "T1" ];

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
 * Sorts competency rows in place by category → subcategory → numeric index, honouring the dictionary's canonical
 * category/subcategory order. Shared by the competency-text and archetype-assignment editors.
 *
 * @method
 * @param {Array<Object>} rows Rows carrying `category`, `subcategory`, and `code`.
 * @param {Object} categories The dictionary `categories` map (for canonical ordering).
 * @returns {Array<Object>} the same array, sorted
 * @private
 */
function sortCompetencyRows( rows, categories ) {
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
 * Coerces an edited weight to an integer score, leaving non-numeric input untouched so schema validation can reject it.
 *
 * @method
 * @param {*} value
 * @returns {*}
 * @private
 */
function toScore( value ) {
    if ( typeof value === "number" ) {
        return value;
    }
    const parsed = parseInt( value, 10 );
    return Number.isFinite( parsed ) ? parsed : value;
}

/* ============================================================================
 * competency-text — bilingual texts (name, description, six scope anchors)
 * ========================================================================== */

/**
 * Projects each competency's editable texts (name, description, and the six scope anchors), bilingual, out of the
 * dictionary (for grouping + order) and the labels document (the text source). Rows carry read-only grouping context
 * (category/subcategory codes + names) for the UI. **Writes back only the labels document.**
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

    return sortCompetencyRows( rows, categories );
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

/* ============================================================================
 * archetype-assignment — the relevancy archetype assigned to each competency
 * ========================================================================== */

/**
 * Projects each competency's global relevancy-archetype assignment, plus the catalogue of archetypes (id + name +
 * curve) for the picker/preview. **Writes back only the dictionary** (`competencies`).
 *
 * @method
 * @param {Object} docs `{ competencies, "relevancy-archetypes", "competence-labels" }`
 * @returns {{rows: Array<Object>, archetypes: Array<Object>}}
 * @public
 */
function composeArchetypeAssignment( docs ) {
    const dictionary = ( docs && docs.competencies ) || {};
    const labels = ( docs && docs[ "competence-labels" ] ) || {};
    const archetypesDoc = ( docs && docs[ "relevancy-archetypes" ] ) || {};
    const competencies = dictionary.competencies || {};
    const categories = dictionary.categories || {};
    const competencyLabels = labels.competency || {};
    const nameLabels = competencyLabels.name || {};
    const categoryNames = ( labels.category && labels.category.name ) || {};
    const subcategoryNames = ( labels.category && labels.category.sub && labels.category.sub.name ) || {};
    const archetypeNames = ( labels[ "relevancy-archetype" ] && labels[ "relevancy-archetype" ].name ) || {};

    const rows = Object.keys( competencies ).map( ( code ) => {
        const competency = competencies[ code ] || {};
        return {
            code: code,
            category: competency.category || "",
            subcategory: competency.subcategory || "",
            categoryName: pair( categoryNames[ competency.category ] ),
            subcategoryName: pair( subcategoryNames[ competency.subcategory ] ),
            name: pair( nameLabels[ code ] ),
            relevancyArchetype: competency.relevancyArchetype || ""
        };
    } );
    sortCompetencyRows( rows, categories );

    const archetypes = Object.keys( archetypesDoc ).map( ( id ) => ( {
        id: id,
        name: pair( archetypeNames[ id ] ),
        weights: clone( ( archetypesDoc[ id ] && archetypesDoc[ id ].weights ) || {} )
    } ) );

    return { rows: rows, archetypes: archetypes };
}

/**
 * Writes the edited per-competency archetype assignment back into the dictionary, returning the **full** new dictionary
 * (only `relevancyArchetype` is touched, and only for competencies that exist and carry a non-empty value on the row).
 * **Writes the dictionary only**; the archetypes and labels are read-only here.
 *
 * @method
 * @param {Array<Object>|{rows: Array<Object>}} editedView rows from {@link composeArchetypeAssignment}
 * @param {Object} docs current `{ competencies }`
 * @returns {Object<string, Object>} `{ competencies: newValue }`
 * @public
 */
function decomposeArchetypeAssignment( editedView, docs ) {
    const rows = Array.isArray( editedView ) ? editedView : ( ( editedView && editedView.rows ) || [] );
    const dictionary = clone( docs && docs.competencies ) || {};
    dictionary.competencies = dictionary.competencies || {};

    rows.forEach( ( row ) => {
        if ( !row || !row.code ) {
            return;
        }
        const competency = dictionary.competencies[ row.code ];
        if ( competency && typeof row.relevancyArchetype === "string" && row.relevancyArchetype ) {
            competency.relevancyArchetype = row.relevancyArchetype;
        }
    } );

    return { competencies: dictionary };
}

/* ============================================================================
 * relevancy-archetype — the curves themselves (weights + name/description)
 * ========================================================================== */

/**
 * Projects the relevancy archetypes — id, bilingual name/description, the twelve stage-level weights, and the number of
 * competencies currently assigned (so the UI can guard "remove only when unassigned"). **Writes the archetypes config
 * and the archetype labels.**
 *
 * @method
 * @param {Object} docs `{ "relevancy-archetypes", "competence-labels", competencies }`
 * @returns {{rows: Array<Object>, stageLevels: string[]}}
 * @public
 */
function composeRelevancyArchetype( docs ) {
    const archetypesDoc = ( docs && docs[ "relevancy-archetypes" ] ) || {};
    const labels = ( docs && docs[ "competence-labels" ] ) || {};
    const dictionary = ( docs && docs.competencies ) || {};
    const competencies = dictionary.competencies || {};
    const archetypeLabels = labels[ "relevancy-archetype" ] || {};
    const nameLabels = archetypeLabels.name || {};
    const descriptionLabels = archetypeLabels.description || {};

    const assignedCount = {};
    Object.keys( competencies ).forEach( ( code ) => {
        const id = competencies[ code ] && competencies[ code ].relevancyArchetype;
        if ( id ) {
            assignedCount[ id ] = ( assignedCount[ id ] || 0 ) + 1;
        }
    } );

    const rows = Object.keys( archetypesDoc ).map( ( id ) => {
        const weightsSource = ( archetypesDoc[ id ] && archetypesDoc[ id ].weights ) || {};
        const weights = {};
        ARCHETYPE_STAGE_LEVELS.forEach( ( level ) => {
            weights[ level ] = ( typeof weightsSource[ level ] === "number" ) ? weightsSource[ level ] : null;
        } );
        return {
            id: id,
            name: pair( nameLabels[ id ] ),
            description: pair( descriptionLabels[ id ] ),
            weights: weights,
            assignedCount: assignedCount[ id ] || 0
        };
    } );

    return { rows: rows, stageLevels: ARCHETYPE_STAGE_LEVELS.slice() };
}

/**
 * Rebuilds the archetypes config and archetype labels from the edited rows. The submitted rows are treated as the
 * **complete** set: an id absent from the rows is removed (its labels pruned too) — guarded server-side by the
 * `archetypesReferentialIntegrity` validator, which rejects removing an archetype still assigned to a competency. New
 * ids are added. Weights are coerced to integers (schema enforces the 1–10 range). **Writes the archetypes config and
 * the labels document.**
 *
 * @method
 * @param {Array<Object>|{rows: Array<Object>}} editedView rows from {@link composeRelevancyArchetype}
 * @param {Object} docs current `{ "competence-labels" }`
 * @returns {Object<string, Object>} `{ "relevancy-archetypes": newValue, "competence-labels": newValue }`
 * @public
 */
function decomposeRelevancyArchetype( editedView, docs ) {
    const rows = Array.isArray( editedView ) ? editedView : ( ( editedView && editedView.rows ) || [] );
    const newArchetypes = {};
    const labels = clone( docs && docs[ "competence-labels" ] ) || {};
    labels[ "relevancy-archetype" ] = labels[ "relevancy-archetype" ] || {};
    labels[ "relevancy-archetype" ].name = labels[ "relevancy-archetype" ].name || {};
    labels[ "relevancy-archetype" ].description = labels[ "relevancy-archetype" ].description || {};

    const keepIds = {};
    rows.forEach( ( row ) => {
        if ( !row || !row.id ) {
            return;
        }
        const id = row.id;
        keepIds[ id ] = true;
        const weightsSource = row.weights || {};
        const weights = {};
        ARCHETYPE_STAGE_LEVELS.forEach( ( level ) => {
            weights[ level ] = toScore( weightsSource[ level ] );
        } );
        newArchetypes[ id ] = { weights: weights };
        labels[ "relevancy-archetype" ].name[ id ] = mergeLeaf( row.name, labels[ "relevancy-archetype" ].name[ id ] );
        labels[ "relevancy-archetype" ].description[ id ] = mergeLeaf( row.description, labels[ "relevancy-archetype" ].description[ id ] );
    } );

    // Prune labels for archetypes removed in this edit (no longer present in the submitted rows).
    [ "name", "description" ].forEach( ( section ) => {
        Object.keys( labels[ "relevancy-archetype" ][ section ] ).forEach( ( id ) => {
            if ( !keepIds[ id ] ) {
                delete labels[ "relevancy-archetype" ][ section ][ id ];
            }
        } );
    } );

    return { "relevancy-archetypes": newArchetypes, "competence-labels": labels };
}

/* ============================================================================
 * role-families — disciplines (fixed) + their specializations (add/edit/remove)
 * ========================================================================== */

/**
 * Projects the role families and their specializations: each family's bilingual name/description (text from the labels
 * document; the config holds only templated label-key refs) and its specializations (code + bilingual name/description
 * + eCFMapping + the number of active-competency-set cycles that reference the specialization, for the remove guard).
 * The nine families are fixed by schema — only their text and their specializations are editable. **Writes the
 * role-families config and the labels document.**
 *
 * @method
 * @param {Object} docs `{ "role-families", "competence-labels", "active-competency-sets" }`
 * @returns {{families: Array<Object>}}
 * @public
 */
function composeRoleFamilies( docs ) {
    const families = ( docs && docs[ "role-families" ] ) || {};
    const labels = ( docs && docs[ "competence-labels" ] ) || {};
    const activeSets = ( docs && docs[ "active-competency-sets" ] ) || {};
    const rfLabels = labels[ "role-family" ] || {};
    const familyNames = rfLabels.name || {};
    const familyDescriptions = rfLabels.description || {};

    const rows = Object.keys( families ).map( ( familyCode ) => {
        const family = families[ familyCode ] || {};
        const specs = family.specializations || {};
        const specLabels = ( rfLabels[ familyCode ] && rfLabels[ familyCode ].specialization ) || {};
        const specNames = specLabels.name || {};
        const specDescriptions = specLabels.description || {};
        const familyActiveSets = activeSets[ familyCode ] || {};

        const specializations = Object.keys( specs ).map( ( specCode ) => {
            const specActiveSets = familyActiveSets[ specCode ];
            const activeSetUse = ( specActiveSets && typeof specActiveSets === "object" ) ? Object.keys( specActiveSets ).length : 0;
            return {
                code: specCode,
                name: pair( specNames[ specCode ] ),
                description: pair( specDescriptions[ specCode ] ),
                eCFMapping: clone( ( specs[ specCode ] && specs[ specCode ].eCFMapping ) || [] ),
                activeSetUse: activeSetUse
            };
        } );

        return {
            code: familyCode,
            name: pair( familyNames[ familyCode ] ),
            description: pair( familyDescriptions[ familyCode ] ),
            specializations: specializations
        };
    } );

    return { families: rows };
}

/**
 * Rebuilds the role-families config and the role-family labels from the edited families. Family identities are fixed
 * (unknown family codes are ignored, and a family's templated name/description key refs are preserved); per family, the
 * submitted specializations are the **complete** set — new codes are added (with deterministic label-key refs +
 * empty eCFMapping unless supplied), existing ones keep their eCFMapping, and omitted ones are removed (labels pruned).
 * Removing a specialization still referenced by an active set or an employee is rejected by
 * `roleFamiliesReferentialIntegrity`. **Writes the role-families config and the labels document.**
 *
 * @method
 * @param {Array<Object>|{families: Array<Object>}} editedView families from {@link composeRoleFamilies}
 * @param {Object} docs current `{ "role-families", "competence-labels" }`
 * @returns {Object<string, Object>} `{ "role-families": newValue, "competence-labels": newValue }`
 * @public
 */
function decomposeRoleFamilies( editedView, docs ) {
    const rows = Array.isArray( editedView ) ? editedView : ( ( editedView && editedView.families ) || [] );
    const families = clone( docs && docs[ "role-families" ] ) || {};
    const labels = clone( docs && docs[ "competence-labels" ] ) || {};
    labels[ "role-family" ] = labels[ "role-family" ] || {};
    labels[ "role-family" ].name = labels[ "role-family" ].name || {};
    labels[ "role-family" ].description = labels[ "role-family" ].description || {};

    rows.forEach( ( row ) => {
        if ( !row || !row.code ) {
            return;
        }
        const familyCode = row.code;
        const family = families[ familyCode ];
        if ( !family ) {
            return; // families are fixed by schema — ignore unknown codes.
        }

        // The family's config name/description stay as templated key refs; the editable text lives in the labels.
        labels[ "role-family" ].name[ familyCode ] = mergeLeaf( row.name, labels[ "role-family" ].name[ familyCode ] );
        labels[ "role-family" ].description[ familyCode ] = mergeLeaf( row.description, labels[ "role-family" ].description[ familyCode ] );

        labels[ "role-family" ][ familyCode ] = labels[ "role-family" ][ familyCode ] || {};
        labels[ "role-family" ][ familyCode ].specialization = labels[ "role-family" ][ familyCode ].specialization || {};
        const specLabels = labels[ "role-family" ][ familyCode ].specialization;
        specLabels.name = specLabels.name || {};
        specLabels.description = specLabels.description || {};

        const existingSpecs = family.specializations || {};
        const newSpecs = {};
        const keepSpecs = {};
        ( Array.isArray( row.specializations ) ? row.specializations : [] ).forEach( ( spec ) => {
            if ( !spec || !spec.code ) {
                return;
            }
            const specCode = spec.code;
            keepSpecs[ specCode ] = true;
            const existing = existingSpecs[ specCode ] || {};
            newSpecs[ specCode ] = {
                name: "role-family." + familyCode + ".specialization.name." + specCode,
                description: "role-family." + familyCode + ".specialization.description." + specCode,
                eCFMapping: Array.isArray( spec.eCFMapping ) ? spec.eCFMapping : ( Array.isArray( existing.eCFMapping ) ? existing.eCFMapping : [] )
            };
            specLabels.name[ specCode ] = mergeLeaf( spec.name, specLabels.name[ specCode ] );
            specLabels.description[ specCode ] = mergeLeaf( spec.description, specLabels.description[ specCode ] );
        } );

        [ "name", "description" ].forEach( ( section ) => {
            Object.keys( specLabels[ section ] ).forEach( ( specCode ) => {
                if ( !keepSpecs[ specCode ] ) {
                    delete specLabels[ section ][ specCode ];
                }
            } );
        } );

        family.specializations = newSpecs;
    } );

    return { "role-families": families, "competence-labels": labels };
}

/* ============================================================================
 * Editor definitions + registration
 * ========================================================================== */

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
 * The `archetype-assignment` composite editor definition (one relevancy archetype per competency, global).
 *
 * @constant
 * @type {Object}
 */
const archetypeAssignmentEditor = {
    documents: [ "competencies", "relevancy-archetypes", "competence-labels" ],
    compose: composeArchetypeAssignment,
    decompose: decomposeArchetypeAssignment,
    metadata: { label: "relevancy.archetype-assignment", writes: [ "competencies" ] }
};

/**
 * The `relevancy-archetype` composite editor definition (the archetype curves + their names/descriptions).
 *
 * @constant
 * @type {Object}
 */
const relevancyArchetypeEditor = {
    documents: [ "relevancy-archetypes", "competence-labels", "competencies" ],
    compose: composeRelevancyArchetype,
    decompose: decomposeRelevancyArchetype,
    metadata: { label: "relevancy.archetypes", writes: [ "relevancy-archetypes", "competence-labels" ] }
};

/**
 * The `role-families` composite editor definition (disciplines + specializations; text in labels).
 *
 * @constant
 * @type {Object}
 */
const roleFamiliesEditor = {
    documents: [ "role-families", "competence-labels", "active-competency-sets" ],
    compose: composeRoleFamilies,
    decompose: decomposeRoleFamilies,
    metadata: { label: "role.families", writes: [ "role-families", "competence-labels" ] }
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
    app.registerConfigEditor( "archetype-assignment", archetypeAssignmentEditor );
    app.registerConfigEditor( "relevancy-archetype", relevancyArchetypeEditor );
    app.registerConfigEditor( "role-families", roleFamiliesEditor );
    return app;
}

module.exports = {
    SCOPE_LEVELS,
    ARCHETYPE_STAGE_LEVELS,
    composeCompetencyText,
    decomposeCompetencyText,
    composeArchetypeAssignment,
    decomposeArchetypeAssignment,
    composeRelevancyArchetype,
    decomposeRelevancyArchetype,
    composeRoleFamilies,
    decomposeRoleFamilies,
    competencyTextEditor,
    archetypeAssignmentEditor,
    relevancyArchetypeEditor,
    roleFamiliesEditor,
    registerCompetenceEditors
};
