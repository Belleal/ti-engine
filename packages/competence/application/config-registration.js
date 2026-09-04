/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/**
 * Registers the competence application's configuration documents (and their schemas, semantic validators, defaults,
 * and editor metadata) plus its composite (entity) editors with the framework's config registry/service via the
 * {@link TiWebAppManager} registration API. Called during web-application initialization; the `/admin/config/*`
 * endpoints then serve these documents and editors.
 *
 * Editable: the dictionary, its localization, the relevancy archetypes, the active competency sets, the role
 * families (the nine disciplines are fixed by schema; their text and their specializations are editable), the
 * research-consent statement (guarded by the consentTextVersionBumped validator so its text can't change without a
 * version bump), the organization structure (guarded by the four structural validators — single root, parent/child
 * symmetry, acyclicity, and id/key agreement — from {@link module:config-validators}), and the work sites (guarded
 * by id/key agreement and a referential-integrity check that blocks removing a site an employee is assigned to).
 * The role-family competency pool and the stage levels are registered read-only — versioned, validated, restorable,
 * and exportable, but not exposed for inline editing yet.
 * <br/>
 * The organization structure and the work sites are also registered with `metadata.driftTracked: false`: unlike
 * the other documents, which hold vendor-shipped product content, these two hold this deployment's own operational
 * data — its actual org chart and its actual list of physical sites — which differ from the shipped demo values by
 * definition and forever, so including them in the drift report would drown the signal for documents where a
 * difference genuinely means "a release changed something this deployment is not serving".
 *
 * @module config-registration
 */

const configurationLoader = require( "#configuration-loader" );
const validators = require( "./config-validators" );
const { registerCompetenceEditors } = require( "./config-editors" );

const competenciesSchema = require( "../bin/data/schemas/competencies.schema.json" );
const activeCompetencySetsSchema = require( "../bin/data/schemas/active-competency-sets.schema.json" );
const relevancyArchetypesSchema = require( "../bin/data/schemas/relevancy-archetypes.schema.json" );
const roleFamiliesSchema = require( "../bin/data/schemas/role-families.schema.json" );
const roleFamilyCompetenciesSchema = require( "../bin/data/schemas/role-family-competencies.schema.json" );
const stageLevelsSchema = require( "../bin/data/schemas/stage-levels.schema.json" );
const researchConsentSchema = require( "../bin/data/schemas/research-consent.schema.json" );
const organizationStructureSchema = require( "../bin/data/schemas/organization-structure.schema.json" );
const workSitesSchema = require( "../bin/data/schemas/work-sites.schema.json" );
const competenceLabels = require( "../bin/localization/competence-labels.json" );

// competence-labels.json has no dedicated JSON Schema (its structure is large and open-ended). Structural validity is
// covered by a permissive schema; content correctness is enforced by the labelsContentComplete semantic validator.
const LABELS_SCHEMA = { $id: "https://ti-engine.dev/schemas/competence/competence-labels.json", type: "object" };

/**
 * @method
 * @param {TiWebAppManager} app
 * @returns {TiWebAppManager} app (chainable)
 * @public
 */
function registerCompetenceConfig( app ) {
    app.registerConfigDocument( "competencies", {
        schema: competenciesSchema,
        validators: [ validators.competenciesArchetypeResolves ],
        defaultValue: configurationLoader.fileDefaults[ "competencies" ],
        metadata: { path: "bin/config/config.competencies.json", label: "competency.dictionary", editable: true }
    } );
    app.registerConfigDocument( "competence-labels", {
        schema: LABELS_SCHEMA,
        validators: [ validators.labelsContentComplete ],
        defaultValue: competenceLabels,
        metadata: { path: "bin/localization/competence-labels.json", label: "competency.labels", editable: true }
    } );
    app.registerConfigDocument( "relevancy-archetypes", {
        schema: relevancyArchetypesSchema,
        validators: [ validators.archetypesReferentialIntegrity ],
        defaultValue: configurationLoader.fileDefaults[ "relevancy-archetypes" ],
        metadata: { path: "bin/config/config.relevancy-archetypes.json", label: "relevancy.archetypes", editable: true }
    } );
    app.registerConfigDocument( "active-competency-sets", {
        schema: activeCompetencySetsSchema,
        validators: [ validators.activeSetsReferenceIntegrity, validators.activeSetsFloorCoverage, validators.activeSetsCap, validators.activeSetsWithinPool ],
        defaultValue: configurationLoader.fileDefaults[ "active-competency-sets" ],
        // Read-only for the same reason as `role-family-competencies`: the runtime baselines an operator actually
        // edits live in the `ti:competence:data:active-competency-sets` collection behind the Cycle Setup screen,
        // and no composite editor writes this document. Claiming `editable: true` for a document with no write path
        // is what left the organization structure unchangeable for three releases; it stays exportable and
        // restorable either way.
        metadata: { path: "bin/config/config.active-competency-sets.json", label: "active.competency.sets", editable: false }
    } );
    app.registerConfigDocument( "role-families", {
        schema: roleFamiliesSchema,
        validators: [ validators.roleFamiliesReferentialIntegrity ],
        defaultValue: configurationLoader.fileDefaults[ "role-families" ],
        metadata: { path: "bin/config/config.role-families.json", label: "role.families", editable: true }
    } );
    app.registerConfigDocument( "role-family-competencies", {
        schema: roleFamilyCompetenciesSchema,
        validators: [ validators.poolReferenceIntegrity ],
        defaultValue: configurationLoader.fileDefaults[ "role-family-competencies" ],
        metadata: { path: "bin/config/config.role-family-competencies.json", label: "role.family.competencies", editable: false }
    } );
    app.registerConfigDocument( "stage-levels", {
        schema: stageLevelsSchema,
        validators: [],
        defaultValue: configurationLoader.fileDefaults[ "stage-levels" ],
        metadata: { path: "bin/config/config.stage-levels.json", label: "stage.levels", editable: false }
    } );
    app.registerConfigDocument( "research-consent", {
        schema: researchConsentSchema,
        validators: [ validators.consentTextVersionBumped ],
        defaultValue: configurationLoader.fileDefaults[ "research-consent" ],
        metadata: { path: "bin/config/config.research-consent.json", label: "consent.research", editable: true }
    } );
    app.registerConfigDocument( "organization-structure", {
        schema: organizationStructureSchema,
        validators: [ validators.organizationSingleRoot, validators.organizationParentChildSymmetry, validators.organizationNoCycles, validators.organizationIdMatchesKey, validators.organizationSafeUnitIDs ],
        defaultValue: configurationLoader.fileDefaults[ "organization-structure" ],
        metadata: { path: "bin/config/config.organization-structure.json", label: "organization.structure", editable: true, driftTracked: false }
    } );
    app.registerConfigDocument( "work-sites", {
        schema: workSitesSchema,
        validators: [ validators.workSiteIdMatchesKey, validators.workSiteSafeCodes, validators.workSitesReferentialIntegrity ],
        defaultValue: configurationLoader.fileDefaults[ "work-sites" ],
        metadata: { path: "bin/config/config.work-sites.json", label: "work.sites", editable: true, driftTracked: false }
    } );

    // Composite (entity) editors — e.g. the competency-text editor that the BG-review screen edits.
    registerCompetenceEditors( app );

    return app;
}

module.exports = { registerCompetenceConfig };
