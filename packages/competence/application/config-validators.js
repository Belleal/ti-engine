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
 * Each validator is `(value, context) => issue[] | Promise<issue[]>`, where `context.getConfig(key)` returns a Promise
 * of the current (or pending, within the same edit) value of another editable document — every cross-document
 * reference is read this way so that a single change-set sees its own pending values. The cap is a runtime setting
 * (not a registered editable document) and is the only sibling still read from `configuration-loader` directly.
 *
 * @module config-validators
 */

const configurationLoader = require( "#configuration-loader" );

const SUBCATEGORIES = [ "E1", "E2", "E3", "I1", "I2", "I3", "C1", "C2", "C3" ];
const SCOPE_LEVELS = [ "N", "J", "R", "S", "X", "T" ];
const nonEmpty = ( value ) => typeof value === "string" && value.trim().length > 0;

/**
 * A single validation finding produced by a semantic validator.
 *
 * @typedef {Object} ValidationIssue
 * @property {string} path - Dotted path of the offending node, relative to the validated document's root.
 * @property {string} message - Human-readable description of the violation.
 * @property {string} code - Machine-readable issue category (e.g. "reference-integrity", "floor-coverage", "cap", "content").
 */

/**
 * The cross-document read context handed to every validator. `getConfig` resolves the current — or pending, within the
 * same change-set — value of another editable configuration document, keyed by its admin config key.
 *
 * @typedef {Object} ValidatorContext
 * @property {function( string ): Promise<*>} getConfig
 */

/**
 * competencies: every competency must reference a relevancy archetype that exists in the (editable) archetypes config.
 *
 * @method
 * @param {ConfigCompetencies} value - The pending competency dictionary being validated.
 * @param {ValidatorContext} context
 * @returns {Promise<Array<ValidationIssue>>}
 * @public
 */
function competenciesArchetypeResolves( value, context ) {
    return context.getConfig( "relevancy-archetypes" ).then( ( archetypesConfig ) => {
        const issues = [];
        const archetypes = archetypesConfig || {};
        const competencies = ( value && value.competencies ) || {};
        for ( const [ code, competency ] of Object.entries( competencies ) ) {
            if ( !competency.relevancyArchetype ) {
                issues.push( { path: `.competencies.${ code }.relevancyArchetype`, message: "missing relevancyArchetype", code: "relevancy-archetype" } );
            } else if ( !archetypes[ competency.relevancyArchetype ] ) {
                issues.push( { path: `.competencies.${ code }.relevancyArchetype`, message: `archetype '${ competency.relevancyArchetype }' is not defined`, code: "relevancy-archetype" } );
            }
        }
        return issues;
    } );
}

/**
 * active-competency-sets: every code exists in the dictionary; every specialization key is a valid specialization.
 *
 * @method
 * @param {ConfigActiveCompetencySets} value - The pending active-competency-sets document being validated.
 * @param {ValidatorContext} context
 * @returns {Promise<Array<ValidationIssue>>}
 * @public
 */
function activeSetsReferenceIntegrity( value, context ) {
    return Promise.all( [
        context.getConfig( "competencies" ),
        context.getConfig( "role-families" )
    ] ).then( ( [ competenciesConfig, roleFamiliesConfig ] ) => {
        const issues = [];
        const dictionary = ( competenciesConfig || {} ).competencies || {};
        const roleFamilies = roleFamiliesConfig || {};
        for ( const [ family, familyEntry ] of Object.entries( value || {} ) ) {
            const validSpecs = new Set( Object.keys( ( roleFamilies[ family ] && roleFamilies[ family ].specializations ) || {} ) );
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
    } );
}

/**
 * active-competency-sets: every configured baseline covers all nine subcategories.
 *
 * @method
 * @param {ConfigActiveCompetencySets} value - The pending active-competency-sets document being validated.
 * @param {ValidatorContext} context
 * @returns {Promise<Array<ValidationIssue>>}
 * @public
 */
function activeSetsFloorCoverage( value, context ) {
    return context.getConfig( "competencies" ).then( ( competenciesConfig ) => {
        const issues = [];
        const dictionary = ( competenciesConfig || {} ).competencies || {};
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
    } );
}

/**
 * active-competency-sets: the baseline and every resolved (baseline ∪ specialization) set stay within the cap.
 *
 * @method
 * @param {ConfigActiveCompetencySets} value - The pending active-competency-sets document being validated.
 * @returns {Array<ValidationIssue>}
 * @public
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
 * active-competency-sets: every code in a family's sets (baseline and each specialization) must belong to that family's
 * competency pool (`config.role-family-competencies.json`). This enforces the per-family applicability universe on the
 * admin restore/import path; cycle-setup edits are additionally guarded on their own save path. A family with no
 * defined pool is skipped (its plain reference integrity is covered by {@link activeSetsReferenceIntegrity}).
 *
 * @method
 * @param {ConfigActiveCompetencySets} value - The pending active-competency-sets document being validated.
 * @param {ValidatorContext} context
 * @returns {Promise<Array<ValidationIssue>>}
 * @public
 */
function activeSetsWithinPool( value, context ) {
    return context.getConfig( "role-family-competencies" ).then( ( poolConfig ) => {
        const issues = [];
        const pools = poolConfig || {};
        for ( const [ family, familyEntry ] of Object.entries( value || {} ) ) {
            if ( !Array.isArray( pools[ family ] ) ) continue;
            const pool = new Set( pools[ family ] );
            for ( const [ key, cycleMap ] of Object.entries( familyEntry || {} ) ) {
                for ( const [ cycleID, codes ] of Object.entries( cycleMap || {} ) ) {
                    for ( const code of ( codes || [] ) ) {
                        if ( !pool.has( code ) ) {
                            issues.push( { path: `.${ family }.${ key }.${ cycleID }`, message: `competency '${ code }' is not in the '${ family }' pool`, code: "pool-membership" } );
                        }
                    }
                }
            }
        }
        return issues;
    } );
}

/**
 * role-family-competencies: every family key in the pool must be a defined role family, and every code in each family's
 * pool must exist in the dictionary. The mirror constraint — active sets staying within the pool — is enforced from the
 * active-sets side by {@link activeSetsWithinPool}.
 *
 * @method
 * @param {Object<string, Array<string>>} value - The pending role-family competency pool being validated.
 * @param {ValidatorContext} context
 * @returns {Promise<Array<ValidationIssue>>}
 * @public
 */
function poolReferenceIntegrity( value, context ) {
    return Promise.all( [
        context.getConfig( "competencies" ),
        context.getConfig( "role-families" )
    ] ).then( ( [ competenciesConfig, roleFamiliesConfig ] ) => {
        const issues = [];
        const dictionary = ( competenciesConfig || {} ).competencies || {};
        const roleFamilies = roleFamiliesConfig || {};
        for ( const [ family, codes ] of Object.entries( value || {} ) ) {
            if ( !roleFamilies[ family ] ) {
                issues.push( { path: `.${ family }`, message: `'${ family }' is not a defined role family`, code: "reference-integrity" } );
            }
            for ( const code of ( codes || [] ) ) {
                if ( !dictionary[ code ] ) {
                    issues.push( { path: `.${ family }`, message: `unknown competency '${ code }'`, code: "reference-integrity" } );
                }
            }
        }
        return issues;
    } );
}

/**
 * relevancy-archetypes: every archetype currently assigned to a competency must still exist after the edit — the
 * mirror of competenciesArchetypeResolves, enforced from the archetypes side so removing/renaming an archetype that is
 * still in use (in the dictionary) is rejected. This is the "remove only when unassigned" guard.
 *
 * @method
 * @param {ConfigRelevancyArchetypes} value - The pending relevancy-archetypes document being validated.
 * @param {ValidatorContext} context
 * @returns {Promise<Array<ValidationIssue>>}
 * @public
 */
function archetypesReferentialIntegrity( value, context ) {
    return context.getConfig( "competencies" ).then( ( competenciesConfig ) => {
        const issues = [];
        const archetypes = value || {};
        const competencies = ( competenciesConfig || {} ).competencies || {};
        for ( const [ code, competency ] of Object.entries( competencies ) ) {
            const id = competency && competency.relevancyArchetype;
            if ( id && !archetypes[ id ] ) {
                issues.push( { path: `.${ id }`, message: `archetype '${ id }' is still assigned to competency '${ code }' and cannot be removed`, code: "reference-integrity" } );
            }
        }
        return issues;
    } );
}

/**
 * role-families: a role family or specialization may only be removed when nothing references it — neither an active
 * competency set nor an employee. Active-set references are read from config (cross-document context); employee
 * references are read from the data layer. The employee check fails closed: when the data layer is genuinely absent
 * (e.g. outside the running service) {@link fetchEmployeesForValidation} resolves to [] and the check is skipped so
 * config-only validation still works, but a genuine fetch failure (e.g. a transient cache error) is reported as a
 * blocking issue rather than silently allowing a possibly orphaning removal. Issues are de-duplicated by path so a
 * family used by many employees is reported once.
 *
 * @method
 * @param {ConfigRoleFamilies} value - The pending role-families document being validated.
 * @param {ValidatorContext} context
 * @returns {Promise<Array<ValidationIssue>>}
 * @public
 */
function roleFamiliesReferentialIntegrity( value, context ) {
    const issues = [];
    const families = value || {};

    return context.getConfig( "active-competency-sets" ).then( ( activeSetsConfig ) => {
        const activeSets = activeSetsConfig || {};
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

        // Read employee references through the overridable seam. Defer the call so that a synchronous throw (e.g. from a
        // test stub) and an async rejection both route to the fail-closed branch below.
        return Promise.resolve()
            .then( () => module.exports.fetchEmployeesForValidation() )
            .then( ( employees ) => employees || [] )
            .catch( () => {
                // Fail closed: employee references could not be verified, so refuse the removal rather than risk
                // orphaning employee records. fetchEmployeesForValidation resolves to [] without rejecting when the
                // data layer is simply absent, so reaching here means a genuine fetch failure against an operational
                // data layer.
                issues.push( { path: ".", message: "employee references could not be verified against the data layer; the change was rejected to avoid orphaning employee records — retry once the data layer is reachable", code: "reference-integrity" } );
                return [];
            } );
    } ).then( ( employees ) => {
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
    } );
}

/**
 * competence-labels: the content-integrity guard for every editable entity that stores its display text in the labels
 * document. Each must carry complete, non-empty en+bg text: every competency (name, description, and the six scope
 * anchors), every relevancy archetype (name, description), and every role family and specialization (name,
 * description). This protects edits made through the translation editor as well as the archetype and role-families
 * editors, both of which can add entities whose text would otherwise be left blank.
 *
 * @method
 * @param {Object.<string, *>} value - The pending competence-labels document being validated (an open-ended, string-keyed localization map).
 * @param {ValidatorContext} context
 * @returns {Promise<Array<ValidationIssue>>}
 * @public
 */
function labelsContentComplete( value, context ) {
    const issues = [];
    const requireBilingual = ( leaf, path, message ) => {
        if ( !leaf || !nonEmpty( leaf.en ) || !nonEmpty( leaf.bg ) ) issues.push( { path: path, message: message, code: "content" } );
    };

    return Promise.all( [
        context.getConfig( "competencies" ),
        context.getConfig( "relevancy-archetypes" ),
        context.getConfig( "role-families" )
    ] ).then( ( [ competenciesConfig, archetypesConfig, roleFamiliesConfig ] ) => {
        const dictionary = ( competenciesConfig || {} ).competencies || {};
        const competencyLabels = ( value && value.competency ) || {};
        for ( const code of Object.keys( dictionary ) ) {
            requireBilingual( competencyLabels.name && competencyLabels.name[ code ], `.competency.name.${ code }`, "empty en/bg name" );
            requireBilingual( competencyLabels.description && competencyLabels.description[ code ], `.competency.description.${ code }`, "empty en/bg description" );
            const scope = ( competencyLabels.scope && competencyLabels.scope[ code ] ) || {};
            for ( const level of SCOPE_LEVELS ) {
                requireBilingual( scope[ level ], `.competency.scope.${ code }.${ level }`, `empty en/bg scope.${ level }` );
            }
        }

        const archetypes = archetypesConfig || {};
        const archetypeLabels = ( value && value[ "relevancy-archetype" ] ) || {};
        for ( const id of Object.keys( archetypes ) ) {
            requireBilingual( archetypeLabels.name && archetypeLabels.name[ id ], `.relevancy-archetype.name.${ id }`, "empty en/bg name" );
            requireBilingual( archetypeLabels.description && archetypeLabels.description[ id ], `.relevancy-archetype.description.${ id }`, "empty en/bg description" );
        }

        const roleFamilies = roleFamiliesConfig || {};
        const roleFamilyLabels = ( value && value[ "role-family" ] ) || {};
        for ( const familyCode of Object.keys( roleFamilies ) ) {
            requireBilingual( roleFamilyLabels.name && roleFamilyLabels.name[ familyCode ], `.role-family.name.${ familyCode }`, "empty en/bg name" );
            requireBilingual( roleFamilyLabels.description && roleFamilyLabels.description[ familyCode ], `.role-family.description.${ familyCode }`, "empty en/bg description" );
            const specs = ( roleFamilies[ familyCode ] && roleFamilies[ familyCode ].specializations ) || {};
            const specLabels = ( roleFamilyLabels[ familyCode ] && roleFamilyLabels[ familyCode ].specialization ) || {};
            for ( const specCode of Object.keys( specs ) ) {
                requireBilingual( specLabels.name && specLabels.name[ specCode ], `.role-family.${ familyCode }.specialization.name.${ specCode }`, "empty en/bg name" );
                requireBilingual( specLabels.description && specLabels.description[ specCode ], `.role-family.${ familyCode }.specialization.description.${ specCode }`, "empty en/bg description" );
            }
        }

        return issues;
    } );
}

/**
 * Employee source for {@link roleFamiliesReferentialIntegrity}, isolated as a seam so it can be overridden in tests
 * (the data-manager singleton is frozen and cannot be stubbed directly). Resolves to [] when the data layer is absent
 * (e.g. outside the running service); a genuine fetch failure is allowed to reject so the caller can fail closed.
 *
 * @method
 * @returns {Promise<Array<Object>>}
 * @public
 */
function fetchEmployeesForValidation() {
    let dataManager;
    try {
        dataManager = require( "#data-manager" ).instance;
    } catch {
        return Promise.resolve( [] );
    }
    if ( !dataManager || typeof dataManager.fetchEmployees !== "function" ) {
        return Promise.resolve( [] );
    }
    return dataManager.fetchEmployees().then( ( employees ) => employees || [] );
}

module.exports = {
    competenciesArchetypeResolves,
    activeSetsReferenceIntegrity,
    activeSetsFloorCoverage,
    activeSetsCap,
    activeSetsWithinPool,
    poolReferenceIntegrity,
    archetypesReferentialIntegrity,
    roleFamiliesReferentialIntegrity,
    fetchEmployeesForValidation,
    labelsContentComplete
};
