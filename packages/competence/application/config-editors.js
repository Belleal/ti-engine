/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/**
 * Composite (entity) editors for the competence configuration. Each editor projects a domain entity out of one or more
 * configuration documents (`compose`) and scatters an edited entity back into them (`decompose`), so the admin UI edits
 * a coherent entity rather than raw label keys / weight maps spread across files. Registered with the framework config
 * service via {@link registerCompetenceEditors} → `TiWebAppManager.registerConfigEditor` → {@link ConfigService#registerEditor}.
 *
 * @module config-editors
 */

const configurationLoader = require( "#configuration-loader" );

// The stage-level ladder is owned by config.stage-levels.json; derive both the scope anchors (level codes) and the
// per-stage archetype-curve keys from it so there is a single source of truth.
const SCOPE_LEVELS = configurationLoader.getStageLevelCodes();
const ARCHETYPE_STAGE_LEVELS = configurationLoader.getArchetypeStageLevels();

/**
 * @method
 * @param {*} value
 * @returns {*}
 * @private
 */
function clone( value ) {
    return ( value === undefined || value === null ) ? value : structuredClone( value );
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
 * Projects the relevancy archetypes — id, bilingual name/description, the thirteen stage-level weights, and the number of
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
 * The set of families is fixed by schema — only their text and their specializations are editable. **Writes the
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
 * work-sites — the office/client nomenclature (add/edit/remove; text stored inline)
 * ========================================================================== */

/**
 * Projects the work-sites document as a flat list of editable rows.
 *
 * @method
 * @param {Object} docs `{ "work-sites" }`
 * @returns {{sites: Array<Object>}}
 * @public
 */
function composeWorkSites( docs ) {
    const sites = ( docs && docs[ "work-sites" ] ) || {};
    const rows = Object.keys( sites ).map( ( code ) => {
        const entry = sites[ code ] || {};
        return {
            code: code,
            type: entry.type === "client" ? "client" : "office",
            name: pair( entry.name )
        };
    } );
    return { sites: rows };
}

/**
 * Rebuilds the work-sites document from the edited rows. **The submitted list is the complete set** — a code that
 * is not in it is removed. That differs deliberately from {@link decomposeRoleFamilies}, whose family identities are
 * fixed by schema: a work site exists precisely so an admin can add and remove it.
 * <br/>
 * Removal is safe here only because `workSitesReferentialIntegrity` refuses to drop a site an employee is assigned
 * to. This function deliberately does **not** repeat that check — the rule has one home, and duplicating it here
 * would let the two drift while making the screen the only guarded path.
 * <br/>
 * `id` is stamped from the row's `code` rather than trusted from the payload: they must be equal or
 * `workSiteIdMatchesKey` blocks the save, and deriving it removes the chance for them to disagree at all. The code
 * is trimmed before it becomes the key/`id`: the CSV importer trims every cell before matching, so a padded code
 * saved verbatim (`" HQ "`) would be a site no import row could ever equal — the client's own duplicate check in
 * `localIssues()` already trims for the same reason, and the server must agree with it. A code that is empty after
 * trimming is skipped, same as one that was empty (or absent) to begin with.
 *
 * @method
 * @param {Array<Object>|{sites: Array<Object>}} editedView rows from {@link composeWorkSites}
 * @param {Object} docs current `{ "work-sites" }`
 * @returns {Object<string, Object>} `{ "work-sites": newValue }`
 * @public
 */
function decomposeWorkSites( editedView, docs ) {
    const rows = Array.isArray( editedView ) ? editedView : ( ( editedView && editedView.sites ) || [] );
    const existing = ( docs && docs[ "work-sites" ] ) || {};
    const next = {};

    rows.forEach( ( row ) => {
        if ( !row || !row.code ) {
            return;
        }
        const code = String( row.code ).trim();
        if ( !code ) {
            return;
        }
        const stored = existing[ code ] || {};
        next[ code ] = {
            id: code,
            type: row.type === "client" ? "client" : "office",
            name: mergeLeaf( row.name, stored.name )
        };
    } );

    return { "work-sites": next };
}

/* ============================================================================
 * organization-structure — the org unit tree (add/edit/remove; `children` derived from `parent`)
 * ========================================================================== */

/**
 * Optional string properties of a unit. Omitted from the rebuilt document when blank rather than written as `""`,
 * which keeps a hand-typed tree free of empty keys — the schema requires none of them.
 *
 * @constant
 * @type {string[]}
 */
const ORGANIZATION_OPTIONAL_FIELDS = [ "displayName", "description", "branch", "location" ];

/**
 * Orders unit IDs root-first, then depth-first through each unit's `children`, so the screen reads as a tree rather
 * than as whatever order the map happens to hold. Falls back to appending any unit the walk never reaches (an
 * orphan whose parent does not exist, or a member of a cycle) so a structurally broken document is still fully
 * editable — which is exactly when an admin needs to see it.
 *
 * @method
 * @param {Object} units The organization-structure document.
 * @returns {string[]} Every key of `units`, in display order.
 * @private
 */
function organizationDisplayOrder( units ) {
    const ordered = [];
    const seen = new Set();

    const visit = ( unitID ) => {
        if ( seen.has( unitID ) || !Object.prototype.hasOwnProperty.call( units, unitID ) ) {
            return;
        }
        seen.add( unitID );
        ordered.push( unitID );
        const children = ( units[ unitID ] && units[ unitID ].children ) || [];
        if ( Array.isArray( children ) ) {
            children.forEach( ( childID ) => visit( String( childID ) ) );
        }
    };

    Object.keys( units ).filter( ( unitID ) => {
        const parent = units[ unitID ] && units[ unitID ].parent;
        return parent === null || parent === undefined || parent === "";
    } ).forEach( visit );

    Object.keys( units ).forEach( ( unitID ) => {
        if ( !seen.has( unitID ) ) {
            ordered.push( unitID );
        }
    } );

    return ordered;
}

/**
 * Projects the organization structure as a flat list of editable rows in tree order.
 * <br/>
 * `children` is deliberately **not** part of the editable surface: it is derived from the rows' `parent` values on
 * the way back in (see {@link decomposeOrganizationStructure}), which makes `organizationParentChildSymmetry`
 * unfailable from this screen instead of something an admin has to keep in sync by hand. `depth` is carried for
 * indentation only and is never written back.
 *
 * @method
 * @param {Object} docs `{ "organization-structure" }`
 * @returns {{units: Array<Object>}}
 * @public
 */
function composeOrganizationStructure( docs ) {
    const units = ( docs && docs[ "organization-structure" ] ) || {};

    const depthOf = ( unitID, guard ) => {
        let depth = 0;
        let cursor = units[ unitID ];
        const walked = guard || new Set( [ unitID ] );
        while ( cursor && cursor.parent !== null && cursor.parent !== undefined && cursor.parent !== "" ) {
            const parentID = String( cursor.parent );
            // A cycle would otherwise spin here; the acyclicity validator reports it, this just stops counting.
            if ( walked.has( parentID ) || !Object.prototype.hasOwnProperty.call( units, parentID ) ) {
                break;
            }
            walked.add( parentID );
            depth += 1;
            cursor = units[ parentID ];
        }
        return depth;
    };

    const rows = organizationDisplayOrder( units ).map( ( unitID ) => {
        const unit = units[ unitID ] || {};
        const row = {
            id: unitID,
            name: ( typeof unit.name === "string" ) ? unit.name : "",
            type: ( typeof unit.type === "string" ) ? unit.type : "",
            parent: ( unit.parent === null || unit.parent === undefined ) ? "" : String( unit.parent ),
            managerID: ( unit.managerID === null || unit.managerID === undefined ) ? "" : String( unit.managerID ),
            depth: depthOf( unitID )
        };
        ORGANIZATION_OPTIONAL_FIELDS.forEach( ( field ) => {
            row[ field ] = ( typeof unit[ field ] === "string" ) ? unit[ field ] : "";
        } );
        return row;
    } );

    return { units: rows };
}

/**
 * Rebuilds the organization-structure document from the edited rows. **The submitted list is the complete set** — a
 * unit absent from it is removed, the same contract as {@link decomposeWorkSites}.
 * <br/>
 * Three things are derived rather than trusted from the payload, each removing a way for the document to contradict
 * itself:
 * <ul>
 *   <li>`id` is stamped from the row's own key, so `organizationIdMatchesKey` cannot be tripped.</li>
 *   <li>`children` is rebuilt from the `parent` values, so `organizationParentChildSymmetry` cannot be tripped —
 *       and a re-parented unit needs no edit on either old or new parent.</li>
 *   <li>An empty `parent` or `managerID` becomes `null`, never `""`: the schema admits `null` or a non-empty
 *       string, and `""` is neither. A blank `parent` therefore means "this is the root", which is what the single-root
 *       validator then judges.</li>
 * </ul>
 * A child ID naming a unit that is not in the submitted set is dropped from `children` rather than written, since a
 * dangling child is an asymmetry the validator would reject; the orphan itself still keeps its `parent` value, so the
 * error the admin sees is the real one (a parent that does not exist) rather than a derived symmetry complaint.
 *
 * @method
 * @param {Array<Object>|{units: Array<Object>}} editedView rows from {@link composeOrganizationStructure}
 * @param {Object} docs current `{ "organization-structure" }`
 * @returns {Object<string, Object>} `{ "organization-structure": newValue }`
 * @public
 */
function decomposeOrganizationStructure( editedView, docs ) {
    const rows = Array.isArray( editedView ) ? editedView : ( ( editedView && editedView.units ) || [] );
    const existing = ( docs && docs[ "organization-structure" ] ) || {};
    const next = {};

    const trimmed = ( value ) => String( value === null || value === undefined ? "" : value ).trim();

    rows.forEach( ( row ) => {
        if ( !row ) {
            return;
        }
        const unitID = trimmed( row.id );
        if ( !unitID ) {
            return;
        }
        const stored = existing[ unitID ] || {};
        const parent = trimmed( row.parent );
        const managerID = trimmed( row.managerID );

        const unit = {
            id: unitID,
            name: ( typeof row.name === "string" ) ? row.name.trim() : ( stored.name || "" ),
            type: ( typeof row.type === "string" ) ? row.type.trim() : ( stored.type || "" ),
            parent: parent === "" ? null : parent,
            children: [],
            managerID: managerID === "" ? null : managerID
        };

        ORGANIZATION_OPTIONAL_FIELDS.forEach( ( field ) => {
            const value = ( typeof row[ field ] === "string" ) ? row[ field ].trim() : trimmed( stored[ field ] );
            if ( value !== "" ) {
                unit[ field ] = value;
            }
        } );

        next[ unitID ] = unit;
    } );

    // Derive `children` from the parent pointers, in the submitted row order so the tree stays stable across saves.
    rows.forEach( ( row ) => {
        const unitID = trimmed( row && row.id );
        const parentID = trimmed( row && row.parent );
        if ( !unitID || !parentID || !next[ parentID ] || !next[ unitID ] ) {
            return;
        }
        if ( !next[ parentID ].children.includes( unitID ) ) {
            next[ parentID ].children.push( unitID );
        }
    } );

    return { "organization-structure": next };
}

/* ============================================================================
 * research-consent — the consent statement per locale + the kill switch
 * ========================================================================== */

/**
 * The locales the consent statement is authored in. Fixed rather than derived from the stored document so the screen
 * always offers both, including on a deployment whose stored value happens to carry only one.
 *
 * @constant
 * @type {string[]}
 */
const CONSENT_LANGUAGES = [ "en", "bg" ];

/**
 * Projects the research-consent document as the kill switch, the wording version, and one body per locale.
 *
 * @method
 * @param {Object} docs `{ "research-consent" }`
 * @returns {{enabled: boolean, version: string, texts: Array<{language: string, body: string}>}}
 * @public
 */
function composeResearchConsent( docs ) {
    const consent = ( docs && docs[ "research-consent" ] ) || {};
    const text = consent.text || {};
    return {
        enabled: consent.enabled === true,
        version: ( typeof consent.version === "string" ) ? consent.version : "",
        texts: CONSENT_LANGUAGES.map( ( language ) => ( {
            language: language,
            body: ( text[ language ] && typeof text[ language ].body === "string" ) ? text[ language ].body : ""
        } ) )
    };
}

/**
 * Rebuilds the research-consent document from the edited view.
 * <br/>
 * A locale whose body is blank after trimming is **omitted** rather than written as `""`: the schema requires a
 * non-empty body on any locale present, so writing an empty one would fail validation on a field the admin simply
 * left alone. The schema's `minProperties: 1` still refuses a document with no locale at all.
 * <br/>
 * The version is deliberately **not** derived or auto-incremented here. `consentTextVersionBumped` refuses a body
 * change that does not move the version, and that refusal is the point: every stored consent record references the
 * version in force, so a silent wording change would misrepresent what people actually agreed to. Bumping it is the
 * admin's explicit act.
 *
 * @method
 * @param {Object} editedView view from {@link composeResearchConsent}
 * @param {Object} docs current `{ "research-consent" }`
 * @returns {Object<string, Object>} `{ "research-consent": newValue }`
 * @public
 */
function decomposeResearchConsent( editedView, docs ) {
    const current = ( docs && docs[ "research-consent" ] ) || {};
    const view = editedView || {};
    const rows = Array.isArray( view.texts ) ? view.texts : [];

    const text = {};
    rows.forEach( ( row ) => {
        if ( !row || CONSENT_LANGUAGES.indexOf( row.language ) === -1 ) {
            return;
        }
        const body = ( typeof row.body === "string" ) ? row.body.trim() : "";
        if ( body !== "" ) {
            text[ row.language ] = { body: body };
        }
    } );

    return {
        "research-consent": {
            enabled: view.enabled === true,
            version: ( typeof view.version === "string" ) ? view.version.trim() : ( current.version || "" ),
            text: text
        }
    };
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
 * The `work-sites` composite editor definition (the office/client nomenclature; text stored inline, not in labels).
 *
 * @constant
 * @type {Object}
 */
const workSitesEditor = {
    documents: [ "work-sites" ],
    compose: composeWorkSites,
    decompose: decomposeWorkSites,
    metadata: { label: "work.sites", writes: [ "work-sites" ] }
};

/**
 * The `organization-structure` composite editor definition (the org unit tree; `children` derived from `parent`).
 * <br/>
 * This is the only write path to the document. It was registered `editable: true` from the start (CA-106) on the
 * assumption that a generic document editor would serve it, but the framework's admin API exposes reads for a
 * document and writes only through a composite editor — so until this editor existed the tree could be seeded and
 * read but never changed, leaving a fresh install permanently on the shipped sample org.
 *
 * @constant
 * @type {Object}
 */
const organizationStructureEditor = {
    documents: [ "organization-structure" ],
    compose: composeOrganizationStructure,
    decompose: decomposeOrganizationStructure,
    metadata: { label: "organization.structure", writes: [ "organization-structure" ] }
};

/**
 * The `research-consent` composite editor definition (the statement per locale, its version, and the kill switch).
 * <br/>
 * Like the organization structure, this document was registered `editable: true` from the start (CA-93) — its design
 * calls the statement "admin-editable per locale" — but nothing wrote it, so the shipped wording could never be
 * changed without a redeploy.
 *
 * @constant
 * @type {Object}
 */
const researchConsentEditor = {
    documents: [ "research-consent" ],
    compose: composeResearchConsent,
    decompose: decomposeResearchConsent,
    metadata: { label: "consent.research", writes: [ "research-consent" ] }
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
    app.registerConfigEditor( "work-sites", workSitesEditor );
    app.registerConfigEditor( "organization-structure", organizationStructureEditor );
    app.registerConfigEditor( "research-consent", researchConsentEditor );
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
    composeWorkSites,
    decomposeWorkSites,
    composeOrganizationStructure,
    decomposeOrganizationStructure,
    composeResearchConsent,
    decomposeResearchConsent,
    competencyTextEditor,
    archetypeAssignmentEditor,
    relevancyArchetypeEditor,
    roleFamiliesEditor,
    workSitesEditor,
    organizationStructureEditor,
    researchConsentEditor,
    registerCompetenceEditors
};
