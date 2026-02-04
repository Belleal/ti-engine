/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const TiWebAppManager = require( "@ti-engine/web-framework/web-application" );
const exceptions = require( "@ti-engine/core/exceptions" );
const localization = require( "@ti-engine/core/localization" );
const configuration = require( "#configuration-loader" );
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
                grades: configuration.configEvaluationGrades
            } ) );
        }
        if ( view === "load-employee-competencies" ) {
            const employeeID = String( options?.query?.employeeID || "" ).trim();
            return this.#loadEmployeeCompetencies( session, employeeID );
        }
        return super.processDataRequest( session, view, options );
    }

    /* Private interface */

    /**
     * Used to load the data for the competence evaluation screen for a specific employee.
     *
     * @method
     * @param {Object} session
     * @param {string} employeeID
     * @returns {Promise<Object>}
     * @private
     */
    #loadEmployeeCompetencies( session, employeeID ) {
        return new Promise( ( resolve, reject ) => {
            let employee = null;
            dataLoader.instance.fetchEmployee( employeeID ).then( ( employeeData ) => {
                employee = employeeData;
                return dataLoader.instance.fetchEvaluations( employee.employeeID );
            } ).then( ( evaluations ) => {
                const lastEvaluation = evaluations.slice()
                    .sort( ( a, b ) =>
                        new Date( b.interviewDate || b.cycleDate ) - new Date( a.interviewDate || a.cycleDate )
                    )[ 0 ] || {};
                const positionKey = String( employee.personal?.position ?? "" ).trim();
                const cycleID = String( lastEvaluation?.cycleID ?? "" ).trim();
                const positionCompetencies = configuration.configEvaluationPositionCompetencies || {};
                const positionEntry = Object.prototype.hasOwnProperty.call( positionCompetencies, positionKey )
                    ? positionCompetencies[ positionKey ]
                    : null;
                let allowedCompetencyCodes = null;
                if ( Array.isArray( positionEntry ) ) {
                    allowedCompetencyCodes = positionEntry;
                } else if ( positionEntry && typeof positionEntry === "object" ) {
                    allowedCompetencyCodes = Object.prototype.hasOwnProperty.call( positionEntry, cycleID )
                        ? positionEntry[ cycleID ]
                        : [];
                }
                for ( const competencyCode of allowedCompetencyCodes || [] ) {
                    lastEvaluation.grades = lastEvaluation.grades || {};
                    lastEvaluation.grades[ competencyCode ] = lastEvaluation.grades[ competencyCode ] || {};
                    lastEvaluation.grades[ competencyCode ] = this.#normalizeGrades( lastEvaluation.grades, competencyCode );
                }
                resolve( {
                    employeeID: employeeID,
                    personal: {
                        ...employee.personal,
                        positionName: configuration.organizationPositionCode.name( employee.personal?.position )
                    },
                    evaluation: lastEvaluation,
                    competencies: this.#buildCompetenciesTree(
                        configuration.configCompetencies,
                        session?.language,
                        allowedCompetencyCodes
                    )
                } );
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }

    /**
     * Used to build a tree of competencies based on the provided configuration.
     * <br/>
     * NOTE: If the 'allowedCompetencyCodes' parameter is provided, only competencies with codes that are present in the array will be included in the tree.
     * Otherwise, all competencies will be included.
     *
     * @method
     * @param {Object} competenceConfig
     * @param {TiLocalizationLanguage} language
     * @param {Array<string>} allowedCompetencyCodes
     * @return {Array<Object>}
     * @private
     */
    #buildCompetenciesTree( competenceConfig, language, allowedCompetencyCodes = null ) {
        const categories = competenceConfig?.categories || {};
        const competencies = competenceConfig?.competencies || {};
        const itemsByCategory = {};
        const filterByPosition = allowedCompetencyCodes !== null;
        const allowedCompetencySet = filterByPosition
            ? new Set( Array.isArray( allowedCompetencyCodes ) ? allowedCompetencyCodes : [] )
            : null;

        Object.entries( competencies ).forEach( ( [ code, competency ] ) => {
            if ( filterByPosition && !allowedCompetencySet.has( code ) ) return;
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
                description: localization.getLabel( competency.description, language )
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
            const filteredSubcategories = filterByPosition
                ? subcategories.filter( ( subcategory ) => subcategory.items.length > 0 )
                : subcategories;
            if ( filterByPosition && filteredSubcategories.length === 0 ) {
                return null;
            }
            return {
                id: categoryId,
                name: localization.getLabel( category.name, language ),
                description: localization.getLabel( category.description, language ),
                subcategories: filteredSubcategories
            };
        } ).filter( Boolean );
    }

    /**
     * Used to normalize the grade data for a specific competency.
     * <br/>
     * NOTE: If the grade data is not present for the specified competency, an empty object will be returned.
     *
     * @method
     * @param {Object} gradesByCode
     * @param {string} competencyCode
     * @returns {Object}
     * @private
     */
    #normalizeGrades( gradesByCode, competencyCode ) {
        const grade = ( gradesByCode && gradesByCode[ competencyCode ] ) || {};
        return {
            employee: grade.employee || "",
            manager: grade.manager || "",
            team: grade.team || ""
        };
    }

}

module.exports = CompetenceWebApplication;
