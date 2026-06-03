/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/**
 * Semantic (cross-document) validators for the competence configuration documents, used by the framework's config
 * registry at write time. These encode the same integrity rules previously enforced only in tests (reference
 * integrity, baseline floor coverage, cap, content completeness, relevancy-archetype resolution).
 *
 * Each validator is `(value, context) => issue[] | Promise<issue[]>`, where `context.getConfig(key)` returns the
 * current (or pending, within the same edit) value of another **editable** document. **Read-only** siblings
 * (role families) and settings (the cap) are read from `configuration-loader` directly, since they are not editable
 * and so always reflect the live state.
 *
 * @module config-validators
 */

const configurationLoader = require( "#configuration-loader" );

const SUBCATEGORIES = [ "E1", "E2", "E3", "I1", "I2", "I3", "C1", "C2", "C3" ];
const SCOPE_LEVELS = [ "N", "J", "R", "S", "X", "T" ];
const nonEmpty = ( value ) => typeof value === "string" && value.trim().length > 0;

/**
 * competencies: every competency must reference a relevancy archetype that exists in the (editable) archetypes config.
 */
async function competenciesArchetypeResolves( value, context ) {
    const issues = [];
    const archetypes = ( await context.getConfig( "relevancy-archetypes" ) ) || {};
    const competencies = ( value && value.competencies ) || {};
    for ( const [ code, competency ] of Object.entries( competencies ) ) {
        if ( !competency.relevancyArchetype ) {
            issues.push( { path: `.competencies.${ code }.relevancyArchetype`, message: "missing relevancyArchetype", code: "relevancy-archetype" } );
        } else if ( !archetypes[ competency.relevancyArchetype ] ) {
            issues.push( { path: `.competencies.${ code }.relevancyArchetype`, message: `archetype '${ competency.relevancyArchetype }' is not defined`, code: "relevancy-archetype" } );
        }
    }
    return issues;
}

/**
 * active-competency-sets: every code exists in the dictionary; every specialization key is a valid specialization.
 */
async function activeSetsReferenceIntegrity( value, context ) {
    const issues = [];
    const dictionary = ( ( await context.getConfig( "competencies" ) ) || {} ).competencies || {};
    const roleFamilies = configurationLoader.configRoleFamilies || {};
    for ( const [ family, familyEntry ] of Object.entries( value || {} ) ) {
        const validSpecs = new Set( Object.keys( roleFamilies[ family ]?.specializations || {} ) );
        for ( const [ key, cycleMap ] of Object.entries( familyEntry || {} ) ) {
            if ( key !== "baseline" && !validSpecs.has( key ) ) {
                issues.push( { path: `.${ family }.${ key }`, message: `'${ key }' is not a valid specialization of '${ family }'`, code: "reference-integrity" } );
            }
            for ( const [ cycleID, codes ] of Object.entries( cycleMap || {} ) ) {
                for ( const code of ( codes || [] ) ) {
                    if ( !dictionary[ code ] ) {
                        issues.push( { path: `.${ family }.${ key }.${ cycleID }`, message: `unknown competency '${ code }'`, code: "reference-integrity" } );
                    }
                }
            }
        }
    }
    return issues;
}

/**
 * active-competency-sets: every configured baseline covers all nine subcategories.
 */
async function activeSetsFloorCoverage( value, context ) {
    const issues = [];
    const dictionary = ( ( await context.getConfig( "competencies" ) ) || {} ).competencies || {};
    for ( const [ family, familyEntry ] of Object.entries( value || {} ) ) {
        const baseline = familyEntry && familyEntry.baseline;
        if ( !baseline ) continue;
        for ( const [ cycleID, codes ] of Object.entries( baseline ) ) {
            const covered = new Set();
            for ( const code of ( codes || [] ) ) {
                const competency = dictionary[ code ];
                if ( competency ) covered.add( competency.subcategory );
            }
            for ( const subcategory of SUBCATEGORIES ) {
                if ( !covered.has( subcategory ) ) {
                    issues.push( { path: `.${ family }.baseline.${ cycleID }`, message: `baseline is missing subcategory '${ subcategory }'`, code: "floor-coverage" } );
                }
            }
        }
    }
    return issues;
}

/**
 * active-competency-sets: the baseline and every resolved (baseline ∪ specialization) set stay within the cap.
 */
function activeSetsCap( value ) {
    const issues = [];
    const cap = configurationLoader.getSetting( "performanceAppraisals.activeCompetencySetCap", 30 );
    for ( const [ family, familyEntry ] of Object.entries( value || {} ) ) {
        const baseline = ( familyEntry && familyEntry.baseline ) || {};
        const specializations = {};
        for ( const [ key, cycleMap ] of Object.entries( familyEntry || {} ) ) {
            if ( key !== "baseline" ) specializations[ key ] = cycleMap;
        }
        for ( const [ cycleID, codes ] of Object.entries( baseline ) ) {
            if ( ( codes || [] ).length > cap ) {
                issues.push( { path: `.${ family }.baseline.${ cycleID }`, message: `baseline size ${ codes.length } exceeds the cap of ${ cap }`, code: "cap" } );
            }
            for ( const [ specKey, specCycles ] of Object.entries( specializations ) ) {
                const resolved = new Set( [ ...( codes || [] ), ...( ( specCycles && specCycles[ cycleID ] ) || [] ) ] );
                if ( resolved.size > cap ) {
                    issues.push( { path: `.${ family }.${ specKey }.${ cycleID }`, message: `resolved set (baseline ∪ '${ specKey }') size ${ resolved.size } exceeds the cap of ${ cap }`, code: "cap" } );
                }
            }
        }
    }
    return issues;
}

/**
 * relevancy-archetypes: every archetype currently assigned to a competency must still exist after the edit — the
 * mirror of competenciesArchetypeResolves, enforced from the archetypes side so removing/renaming an archetype that is
 * still in use (in the dictionary) is rejected. This is the "remove only when unassigned" guard.
 */
async function archetypesReferentialIntegrity( value, context ) {
    const issues = [];
    const archetypes = value || {};
    const competencies = ( ( await context.getConfig( "competencies" ) ) || {} ).competencies || {};
    for ( const [ code, competency ] of Object.entries( competencies ) ) {
        const id = competency && competency.relevancyArchetype;
        if ( id && !archetypes[ id ] ) {
            issues.push( { path: `.${ id }`, message: `archetype '${ id }' is still assigned to competency '${ code }' and cannot be removed`, code: "reference-integrity" } );
        }
    }
    return issues;
}

/**
 * role-families: a role family or specialization may only be removed when nothing references it — neither an active
 * competency set nor an employee. Active-set references are read from config (cross-document context); employee
 * references are read from the data layer (async, defensive: if the data layer is unavailable — e.g. outside the
 * running service — the employee check is skipped so config-only validation still works). Issues are de-duplicated by
 * path so a family used by many employees is reported once.
 */
async function roleFamiliesReferentialIntegrity( value, context ) {
    const issues = [];
    const families = value || {};

    const activeSets = ( await context.getConfig( "active-competency-sets" ) ) || {};
    for ( const [ familyCode, familyEntry ] of Object.entries( activeSets ) ) {
        const family = families[ familyCode ];
        if ( !family ) {
            issues.push( { path: `.${ familyCode }`, message: `role family '${ familyCode }' is referenced by active competency sets and cannot be removed`, code: "reference-integrity" } );
            continue;
        }
        const specs = family.specializations || {};
        for ( const key of Object.keys( familyEntry || {} ) ) {
            if ( key !== "baseline" && !specs[ key ] ) {
                issues.push( { path: `.${ familyCode }.specializations.${ key }`, message: `specialization '${ familyCode }.${ key }' is referenced by active competency sets and cannot be removed`, code: "reference-integrity" } );
            }
        }
    }

    let employees = [];
    try {
        employees = ( await module.exports.fetchEmployeesForValidation() ) || [];
    } catch {
        employees = [];
    }
    for ( const employee of employees ) {
        const career = employee && employee.career;
        if ( !career || !career.roleFamily ) {
            continue;
        }
        const family = families[ career.roleFamily ];
        if ( !family ) {
            issues.push( { path: `.${ career.roleFamily }`, message: `role family '${ career.roleFamily }' is assigned to an employee and cannot be removed`, code: "reference-integrity" } );
        } else if ( career.specialization && !( family.specializations || {} )[ career.specialization ] ) {
            issues.push( { path: `.${ career.roleFamily }.specializations.${ career.specialization }`, message: `specialization '${ career.roleFamily }.${ career.specialization }' is assigned to an employee and cannot be removed`, code: "reference-integrity" } );
        }
    }

    const seen = {};
    return issues.filter( ( issue ) => {
        if ( seen[ issue.path ] ) {
            return false;
        }
        seen[ issue.path ] = true;
        return true;
    } );
}

/**
 * competence-labels: every competency in the dictionary has complete, non-empty en+bg name, description, and the six
 * scope anchors. This is the content-integrity guard that protects edits made through the translation editor.
 */
async function labelsContentComplete( value, context ) {
    const issues = [];
    const dictionary = ( ( await context.getConfig( "competencies" ) ) || {} ).competencies || {};
    const labels = ( value && value.competency ) || {};
    for ( const code of Object.keys( dictionary ) ) {
        const name = labels.name && labels.name[ code ];
        if ( !name || !nonEmpty( name.en ) || !nonEmpty( name.bg ) ) issues.push( { path: `.competency.name.${ code }`, message: "empty en/bg name", code: "content" } );
        const description = labels.description && labels.description[ code ];
        if ( !description || !nonEmpty( description.en ) || !nonEmpty( description.bg ) ) issues.push( { path: `.competency.description.${ code }`, message: "empty en/bg description", code: "content" } );
        const scope = ( labels.scope && labels.scope[ code ] ) || {};
        for ( const level of SCOPE_LEVELS ) {
            const entry = scope[ level ];
            if ( !entry || !nonEmpty( entry.en ) || !nonEmpty( entry.bg ) ) issues.push( { path: `.competency.scope.${ code }.${ level }`, message: `empty en/bg scope.${ level }`, code: "content" } );
        }
    }
    return issues;
}

/**
 * Employee source for {@link roleFamiliesReferentialIntegrity}, isolated as a seam so it can be overridden in tests
 * (the data-manager singleton is frozen and cannot be stubbed directly). Returns [] if the data layer is unavailable.
 *
 * @method
 * @returns {Promise<Array<Object>>}
 * @public
 */
async function fetchEmployeesForValidation() {
    return ( await require( "#data-manager" ).instance.fetchEmployees() ) || [];
}

module.exports = {
    competenciesArchetypeResolves,
    activeSetsReferenceIntegrity,
    activeSetsFloorCoverage,
    activeSetsCap,
    archetypesReferentialIntegrity,
    roleFamiliesReferentialIntegrity,
    fetchEmployeesForValidation,
    labelsContentComplete
};
