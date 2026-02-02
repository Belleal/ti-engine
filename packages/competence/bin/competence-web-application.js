/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2025 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const TiWebAppManager = require( "@ti-engine/web-framework/web-application" );
const exceptions = require( "@ti-engine/core/exceptions" );
const localization = require( "@ti-engine/core/localization" );
const definitions = require( "#definitions" );
const dataLoader = require( "#data-loader" );

/**
 * NOTE: This is still a work in progress.
 *
 * @class CompetenceWebApplication
 * @extends TiWebAppManager
 * @public
 */
class CompetenceWebApplication extends TiWebAppManager {

    /**
     * @constructor
     * @param {string} identifier
     */
    constructor( identifier = "competence" ) {
        super( identifier );

        this.addFragment( "competence-evaluation", {
            title: "Competence Evaluation",
            path: "fragments/frame-competence-evaluation.html"
        } );
    }

    /* Public interface */

    /**
     * Optional HTML transformation hook.
     *
     * @method
     * @param {string} html
     * @param {Object} [options]
     * @param {string} [options.csrfToken] Optional CSRF token to inject into the HTML.
     * @param {boolean} [options.isHome] Optional flag to indicate whether the requested route is the home page.
     * @param {string} [options.nonce] Optional CSP nonce to inject into inline scripts/styles.
     * @param {string} [options.title] Optional title to replace the placeholder in the HTML.
     * @returns {Promise<string>}
     * @override
     * @public
     */
    transformHtml( html, options ) {
        return super.transformHtml( html, options );
    }

    /**
     * Used to process a request for a data resource.
     *
     * @method
     * @override
     * @param {Object} session
     * @param {string} view
     * @param {Object} [options]
     * @returns {Promise<Object>}
     * @public
     */
    processDataRequest( session, view, options = {} ) {
        if ( view === "config" ) {
            return super.processDataRequest( session, view, options ).then( ( result ) => ( {
                ...result,
                grades: definitions.configEvaluationGrades
            } ) );
        }
        if ( view === "load-employee-competences" ) {
            const employeeID = String( options?.query?.employeeID || "" ).trim();
            if ( !employeeID ) {
                return Promise.reject( exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_QUERY ) );
            }
            const employee = dataLoader.instance.fetchEmployee( employeeID );
            if ( !employee ) {
                throw exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { employeeID: employeeID } );
            }
            const evaluations = dataLoader.instance.fetchEvaluations( employeeID );
            const lastEvaluation = ( evaluations && evaluations.length > 0 ) ? evaluations[ 0 ] : {};
            return Promise.resolve( {
                employeeID: employeeID,
                personal: {
                    ...employee.personal,
                    positionName: definitions.organizationPositionCode.name( employee.personal.position )
                },
                evaluation: lastEvaluation,
                competencies: this.#buildCompetenciesTree( definitions.configCompetencies, lastEvaluation.grades || {}, session?.language )
            } );
        }
        return super.processDataRequest( session, view, options );
    }

    /* Private interface */


    #buildCompetenciesTree( competenceConfig, gradesByCode, language ) {
        const categories = competenceConfig?.categories || {};
        const competencies = competenceConfig?.competencies || {};
        const itemsByCategory = {};

        Object.entries( competencies ).forEach( ( [ code, competency ] ) => {
            if ( !competency || !competency.category || !competency.subcategory ) return;
            if ( !itemsByCategory[ competency.category ] ) {
                itemsByCategory[ competency.category ] = {};
            }
            if ( !itemsByCategory[ competency.category ][ competency.subcategory ] ) {
                itemsByCategory[ competency.category ][ competency.subcategory ] = [];
            }

            itemsByCategory[ competency.category ][ competency.subcategory ].push( {
                id: code,
                name: localization.getLabel( competency.name, language ),
                description: localization.getLabel( competency.description, language ),
                grades: this.#normalizeGrades( gradesByCode, code )
            } );
        } );

        Object.values( itemsByCategory ).forEach( ( subcategories ) => {
            Object.values( subcategories ).forEach( ( items ) => {
                items.sort( ( a, b ) => a.id.localeCompare( b.id, undefined, { numeric: true } ) );
            } );
        } );

        return Object.entries( categories ).map( ( [ categoryId, category ] ) => {
            const subcategories = Object.entries( category.subcategories || {} ).map( ( [ subId, subcategory ] ) => {
                return {
                    id: subId,
                    name: localization.getLabel( subcategory.name, language ),
                    description: localization.getLabel( subcategory.description, language ),
                    items: itemsByCategory?.[ categoryId ]?.[ subId ] || []
                };
            } );
            return {
                id: categoryId,
                name: localization.getLabel( category.name, language ),
                description: localization.getLabel( category.description, language ),
                subcategories
            };
        } );
    }

    #normalizeGrades( gradesByCode, code ) {
        const grade = ( gradesByCode && gradesByCode[ code ] ) || {};
        return {
            employee: grade.employee || "",
            manager: grade.manager || "",
            team: grade.team || ""
        };
    }

}

module.exports = CompetenceWebApplication;
