/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/**
 * Semantic (cross-document) validators for the competence configuration documents, used by the framework's config
 * registry at write time. These encode the same integrity rules previously enforced only in tests (reference
 * integrity, baseline floor coverage, cap, content completeness, relevancy-archetype resolution, and the
 * research-consent text/version-bump guard).
 *
 * Each validator is `(value, context) => issue[] | Promise<issue[]>`, where `context.getConfig(key)` returns a Promise
 * of the current (or pending, within the same edit) value of another editable document — every cross-document
 * reference is read this way so that a single change-set sees its own pending values. `context.getStoredConfig(key)`
 * instead always returns the committed value, even for the document currently under validation — used by
 * {@link consentTextVersionBumped} to compare a pending edit against its own prior state rather than, via
 * `getConfig`, against itself. The cap is a runtime setting (not a registered editable document) and is the only
 * sibling still read from `configuration-loader` directly.
 *
 * @module config-validators
 */

const configurationLoader = require( "#configuration-loader" );
const organizationRules = require( "#organization-rules" );

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
 * The cross-document read context handed to every validator.
 *  - `getConfig(key)` resolves the current — or pending, within the same change-set — value of another editable
 *    configuration document, keyed by its admin config key. For a document that is itself part of the current edit
 *    batch, this returns the *pending* (incoming) value, not its prior state — fine for checking a sibling
 *    document's post-edit state, but never useful for a document validating itself against its own history.
 *  - `getStoredConfig(key)` always resolves the committed value, even for a document inside the current edit batch.
 *    A validator that must compare its own document against its previous state (e.g. detecting an unbumped version)
 *    must use this instead of `getConfig`, which would otherwise hand back the pending value already under
 *    validation.
 *
 * @typedef {Object} ValidatorContext
 * @property {function( string ): Promise<*>} getConfig
 * @property {function( string ): Promise<*>} getStoredConfig
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
 * Runs a per-employee reference check against the live employee records, owning the three parts every such check
 * needs to get right: the deferred seam call, the fail-closed branch, and de-duplication by path.
 * <br/>
 * **Fail-closed is the load-bearing property.** {@link fetchEmployeesForValidation} resolves `[]` when the data
 * layer is simply absent — outside the running service — so config-only validation still works. Reaching the catch
 * therefore means a *genuine* fetch failure against an operational data layer, and the removal is refused rather
 * than allowed: a transient cache error must not be the thing that orphans employee records.
 * <br/>
 * The seam call is deferred through `Promise.resolve()` so that a synchronous throw (from a test stub) and an
 * async rejection both route to the same branch.
 *
 * @method
 * @param {Array<ValidationIssue>} issues - Issues collected so far; appended to and returned de-duplicated.
 * @param {function(Object, Array<ValidationIssue>): void} inspect - Called once per employee to append any issue.
 * @returns {Promise<Array<ValidationIssue>>}
 * @private
 */
function withEmployeeReferences( issues, inspect ) {
    return Promise.resolve()
        .then( () => module.exports.fetchEmployeesForValidation() )
        .then( ( employees ) => employees || [] )
        .catch( () => {
            issues.push( {
                path: ".",
                message: "employee references could not be verified against the data layer; the change was rejected to avoid orphaning employee records — retry once the data layer is reachable",
                code: "reference-integrity"
            } );
            return [];
        } )
        .then( ( employees ) => {
            for ( const employee of employees ) {
                inspect( employee, issues );
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
 * role-families: a role family or specialization may only be removed when nothing references it — neither an active
 * competency set nor an employee. Active-set references are read from config (cross-document context); employee
 * references are read from the data layer through {@link withEmployeeReferences}, which owns the fail-closed
 * behaviour: when the data layer is genuinely absent (e.g. outside the running service)
 * {@link fetchEmployeesForValidation} resolves to [] and the check is skipped so config-only validation still works,
 * but a genuine fetch failure (e.g. a transient cache error) is reported as a blocking issue rather than silently
 * allowing a possibly orphaning removal. Issues are de-duplicated by path so a family used by many employees is
 * reported once.
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

        return withEmployeeReferences( issues, ( employee, collected ) => {
            const career = employee && employee.career;
            if ( !career || !career.roleFamily ) {
                return;
            }
            const family = families[ career.roleFamily ];
            if ( !family ) {
                collected.push( { path: `.${ career.roleFamily }`, message: `role family '${ career.roleFamily }' is assigned to an employee and cannot be removed`, code: "reference-integrity" } );
            } else if ( career.specialization && !( family.specializations || {} )[ career.specialization ] ) {
                collected.push( { path: `.${ career.roleFamily }.specializations.${ career.specialization }`, message: `specialization '${ career.roleFamily }.${ career.specialization }' is assigned to an employee and cannot be removed`, code: "reference-integrity" } );
            }
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
 * research-consent: the consent statement must never change silently. Because every stored consent record references
 * the `version` in force when it was given, editing a `body` without bumping `version` would make the historical
 * records ambiguous — two different texts sharing one version string. This does not block the edit; it forces the
 * version to move with it.
 *
 * Reads the document's previously *committed* value via `context.getStoredConfig` rather than `context.getConfig` —
 * `research-consent` is always part of its own edit batch, so `getConfig` would resolve to the same pending value
 * being validated (comparing the incoming document against itself, which can never detect an unbumped change).
 * `getStoredConfig` is guaranteed by {@link ValidatorContext} but is guarded defensively anyway: a context that
 * doesn't provide it fails the edit closed (a blocking issue) instead of silently skipping the check — a validator
 * that quietly stops validating is exactly how this defect went unnoticed in the first place.
 *
 * @method
 * @param {Object} value - The pending research-consent document being validated.
 * @param {ValidatorContext} context
 * @returns {Promise<Array<ValidationIssue>>}
 * @public
 */
function consentTextVersionBumped( value, context ) {
    if ( !context || typeof context.getStoredConfig !== "function" ) {
        // Fail closed rather than silently skip: without getStoredConfig this validator has no way to distinguish a
        // no-op from an unbumped text edit, and letting the edit through unvalidated is the exact failure mode this
        // validator exists to prevent.
        return Promise.resolve( [ {
            path: ".",
            message: "validator context does not provide getStoredConfig(); the previously committed research-consent text could not be verified, so the edit was rejected rather than left unvalidated",
            code: "consent-version"
        } ] );
    }
    return context.getStoredConfig( "research-consent" ).then( ( storedConfig ) => {
        const issues = [];
        const stored = storedConfig || {};
        // Nothing stored yet (first seed): there is no prior text to contradict, so any version is acceptable.
        if ( !stored.version ) {
            return issues;
        }
        const incomingVersion = ( value && value.version ) || "";
        // The version moved — the admin has acknowledged the change, so any text edit is fine.
        if ( incomingVersion !== stored.version ) {
            return issues;
        }
        const incomingText = ( value && value.text ) || {};
        const storedText = stored.text || {};
        for ( const [ locale, entry ] of Object.entries( incomingText ) ) {
            const incomingBody = ( entry && entry.body ) || "";
            const storedEntry = storedText[ locale ];
            // A brand-new locale changes the consent-text set just as much as an edited body would -- the
            // one-version-one-wording-set contract does not distinguish "added" from "changed". Without this, a
            // locale could be added under an existing version with no bump, leaving that version's wording set
            // ambiguous between what a consent record from before the addition saw and what it means now.
            if ( !storedEntry ) {
                issues.push( {
                    path: `.text.${ locale }`,
                    message: `locale '${ locale }' was added but 'version' is still '${ incomingVersion }' — bump the version so the wording set for this version stays fixed`,
                    code: "consent-version"
                } );
                continue;
            }
            const storedBody = storedEntry.body || "";
            if ( incomingBody !== storedBody ) {
                issues.push( {
                    path: `.text.${ locale }.body`,
                    message: `the consent text changed but 'version' is still '${ incomingVersion }' — bump the version so existing consent records stay unambiguous`,
                    code: "consent-version"
                } );
            }
        }
        for ( const locale of Object.keys( storedText ) ) {
            if ( !incomingText[ locale ] ) {
                issues.push( {
                    path: `.text.${ locale }`,
                    message: `locale '${ locale }' was removed but 'version' is still '${ incomingVersion }' — bump the version`,
                    code: "consent-version"
                } );
            }
        }
        return issues;
    } );
}

/**
 * organization-structure: exactly one unit must have no parent. `getTopManagerID` and the symmetry-breaks
 * derivation both assume a single root.
 * <br/>
 * Document-intrinsic, like the other three organization-structure validators below — it reads no sibling document,
 * so (unlike most validators in this file) it does not need the `context` parameter of the general
 * `(value, context)` {@link SemanticValidator} shape.
 *
 * @method
 * @param {Object} value - The pending organization structure being validated.
 * @returns {Promise<Array<ValidationIssue>>}
 * @public
 */
function organizationSingleRoot( value ) {
    const roots = organizationRules.instance.findRootUnits( value );
    if ( roots.length === 1 ) {
        return Promise.resolve( [] );
    }
    return Promise.resolve( [ {
        path: ".",
        message: ( roots.length === 0 )
            ? "no root unit — exactly one unit must have parent: null"
            : `${ roots.length } root units (${ roots.join( ", " ) }) — exactly one unit must have parent: null`,
        code: "single-root"
    } ] );
}

/**
 * organization-structure: the `parent` and `children` links must agree in both directions. The graph builder reads
 * them independently, so a mismatch produces a half-connected tree with no error.
 * <br/>
 * Document-intrinsic — no `context` parameter needed; see {@link organizationSingleRoot}.
 *
 * @method
 * @param {Object} value
 * @returns {Promise<Array<ValidationIssue>>}
 * @public
 */
function organizationParentChildSymmetry( value ) {
    return Promise.resolve( organizationRules.instance.findSymmetryBreaks( value ).map( ( found ) => ( {
        path: `.${ found.unitID }`,
        message: `link to '${ found.relatedID }' is inconsistent (${ found.code })`,
        code: "symmetry"
    } ) ) );
}

/**
 * organization-structure: the parent chain must be acyclic. `RoleResolver#subManagerDepth` recurses with no visited
 * set, so a cycle is a stack overflow at login rather than a diagnosable failure.
 * <br/>
 * Document-intrinsic — no `context` parameter needed; see {@link organizationSingleRoot}.
 *
 * @method
 * @param {Object} value
 * @returns {Promise<Array<ValidationIssue>>}
 * @public
 */
function organizationNoCycles( value ) {
    const cyclic = organizationRules.instance.findCycles( value );
    if ( cyclic.length === 0 ) {
        return Promise.resolve( [] );
    }
    return Promise.resolve( [ {
        path: ".",
        message: `parent cycle through unit(s): ${ cyclic.join( ", " ) }`,
        code: "cycle"
    } ] );
}

/**
 * organization-structure: every unit's `id` must equal its map key. The schema documents this but cannot express
 * it — JSON Schema has no way to say "this property's value equals its property name" — so it was documented and
 * unenforced until now.
 * <br/>
 * It also removes a real ambiguity in the reporting layer: `organizationRules.findCycles` identifies findings by raw
 * map key while the other three rules use `unit.id || rawID`. Those name different things only when the two
 * disagree, so enforcing equality makes every rule report the same identifier by construction — and the map key is
 * what the operator must actually edit, since `parent` and `children` reference keys, not `id` fields.
 *
 * Document-intrinsic — no `context` parameter needed; see {@link organizationSingleRoot}.
 *
 * @method
 * @param {Object} value
 * @returns {Promise<Array<ValidationIssue>>}
 * @public
 */
function organizationIdMatchesKey( value ) {
    const issues = [];
    for ( const [ rawID, unit ] of Object.entries( value || {} ) ) {
        const declared = unit && unit.id;
        if ( declared !== rawID ) {
            issues.push( {
                path: `.${ rawID }`,
                message: `unit id '${ declared === undefined ? "(absent)" : declared }' does not match its key '${ rawID }'`,
                code: "id-key-mismatch"
            } );
        }
    }
    return Promise.resolve( issues );
}

/**
 * work-sites: every site's `id` must equal its map key. Same constraint, and the same reason, as
 * {@link organizationIdMatchesKey}: JSON Schema cannot express "this property's value equals its property name", and
 * the map key is what an operator actually edits — an employee's `personal.workSite` is matched against the key, so
 * a site whose `id` disagrees with it is a site nobody can be assigned to.
 *
 * Document-intrinsic — no `context` parameter needed; see {@link organizationSingleRoot}.
 *
 * @method
 * @param {Object} value
 * @returns {Promise<Array<ValidationIssue>>}
 * @public
 */
function workSiteIdMatchesKey( value ) {
    const issues = [];
    for ( const [ rawID, siteEntry ] of Object.entries( value || {} ) ) {
        const declared = siteEntry && siteEntry.id;
        if ( declared !== rawID ) {
            issues.push( {
                path: `.${ rawID }`,
                message: `work site id '${ declared === undefined ? "(absent)" : declared }' does not match its key '${ rawID }'`,
                code: "id-key-mismatch"
            } );
        }
    }
    return Promise.resolve( issues );
}

/**
 * work-sites: a site may only be removed when no employee is assigned to it. Shares the seam, the fail-closed
 * branch and the de-duplication with {@link roleFamiliesReferentialIntegrity} through
 * {@link withEmployeeReferences}, so the two cannot drift on the part that is easy to get wrong.
 * <br/>
 * This is a *removal* check, which is why it can be a validator at all. CA-107's unresolved-manager rule is a
 * *presence* check — "every unit's managerID must resolve to an employee" — and had to become a startup diagnostic
 * because it fires on a fresh install, where the tree must exist before any employee can reference it. Nothing is
 * removed on a fresh install, so this one never fires there.
 * <br/>
 * No message names an employee: the text reaches an admin screen, and a site code is configuration while a person
 * is not.
 *
 * @method
 * @param {Object} value - The pending work-sites document being validated.
 * @param {ValidatorContext} context
 * @returns {Promise<Array<ValidationIssue>>}
 * @public
 */
function workSitesReferentialIntegrity( value, context ) {
    const sites = value || {};
    return withEmployeeReferences( [], ( employee, collected ) => {
        const workSite = employee && employee.personal && employee.personal.workSite;
        if ( workSite && !sites[ workSite ] ) {
            collected.push( {
                path: `.${ workSite }`,
                message: `work site '${ workSite }' is assigned to an employee and cannot be removed`,
                code: "reference-integrity"
            } );
        }
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
    labelsContentComplete,
    consentTextVersionBumped,
    organizationSingleRoot,
    organizationParentChildSymmetry,
    organizationNoCycles,
    organizationIdMatchesKey,
    workSiteIdMatchesKey,
    workSitesReferentialIntegrity
};
