/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/**
 * Registers the competence application's configuration documents (and their schemas, semantic validators, defaults,
 * and editor metadata) plus its composite (entity) editors with the framework's config registry/service via the
 * {@link TiWebAppManager} registration API. Called during web-application initialization; the `/admin/config/*`
 * endpoints then serve these documents and editors.
 *
 * Editable in v1: the dictionary, its localization, the relevancy archetypes, and the active competency sets.
 * Structural configs (role families, stage levels) are registered read-only so semantic validators and the store can
 * resolve them, but are not exposed for editing.
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
const stageLevelsSchema = require( "../bin/data/schemas/stage-levels.schema.json" );
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
        defaultValue: configurationLoader.configCompetencies,
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
        defaultValue: configurationLoader.configRelevancyArchetypes,
        metadata: { path: "bin/config/config.relevancy-archetypes.json", label: "relevancy.archetypes", editable: true }
    } );
    app.registerConfigDocument( "active-competency-sets", {
        schema: activeCompetencySetsSchema,
        validators: [ validators.activeSetsReferenceIntegrity, validators.activeSetsFloorCoverage, validators.activeSetsCap ],
        defaultValue: configurationLoader.configActiveCompetencySets,
        metadata: { path: "bin/config/config.active-competency-sets.json", label: "active.competency.sets", editable: true }
    } );
    app.registerConfigDocument( "role-families", {
        schema: roleFamiliesSchema,
        validators: [],
        defaultValue: configurationLoader.configRoleFamilies,
        metadata: { path: "bin/config/config.role-families.json", label: "role.families", editable: false }
    } );
    app.registerConfigDocument( "stage-levels", {
        schema: stageLevelsSchema,
        validators: [],
        defaultValue: configurationLoader.configStageLevels,
        metadata: { path: "bin/config/config.stage-levels.json", label: "stage.levels", editable: false }
    } );

    // Composite (entity) editors — e.g. the competency-text editor that the BG-review screen edits.
    registerCompetenceEditors( app );

    return app;
}

module.exports = { registerCompetenceConfig };
