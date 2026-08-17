/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/**
 * Every decision rule for research-use consent, as a pure frozen singleton: hashing the statement, constructing a
 * record, resolving which record is in force, the submit-gate check, the register, and the export chokepoint.
 * Deliberately performs no I/O — persistence lives in {@link DataManager} and orchestration in the web application —
 * so the rules that carry the legal weight are unit-testable without Redis.
 *
 * @module research-consent
 */

const crypto = require( "node:crypto" );
const tools = require( "@ti-engine/core/tools" );
const exceptions = require( "@ti-engine/core/exceptions" );

const DECISION_GRANTED = "granted";
const DECISION_DECLINED = "declined";
const DECISION_VALUES = [ DECISION_GRANTED, DECISION_DECLINED ];
const SOURCE_VALUES = [ "evaluation-submit", "scores-screen" ];

/**
 * Used to create and/or return a Research Consent singleton instance.
 *
 * @class ResearchConsent
 * @singleton
 * @public
 */
class ResearchConsent {

    static #instance = null;

    /**
     * @constructor
     * @returns {ResearchConsent}
     */
    constructor() {
        if ( !ResearchConsent.#instance ) {
            ResearchConsent.#instance = this;
        }
        return ResearchConsent.#instance;
    }

    /* Public interface */

    /**
     * @returns {"granted"}
     * @public
     */
    get decisionGranted() {
        return DECISION_GRANTED;
    }

    /**
     * @returns {"declined"}
     * @public
     */
    get decisionDeclined() {
        return DECISION_DECLINED;
    }

    /**
     * SHA-256 (hex) of the exact statement shown. This — not a pointer to a config value an admin can later edit — is
     * what makes a stored consent provable, so it is deliberately sensitive to every byte including whitespace.
     *
     * @method
     * @param {string} body
     * @returns {string}
     * @public
     */
    hashText( body ) {
        return crypto.createHash( "sha256" ).update( String( body == null ? "" : body ), "utf8" ).digest( "hex" );
    }

    /**
     * The submit gate's decision logic, kept here (rather than inline in the web application) so it is testable
     * without an HTTP harness. Returns null when the capability is switched off — the caller then skips the gate
     * entirely — the normalized decision when one was supplied, and throws otherwise.
     *
     * @method
     * @param {*} rawValue - The `researchConsent` value from the request body.
     * @param {boolean} enabled - The `enabled` flag from the research-consent config document.
     * @returns {"granted"|"declined"|null}
     * @exception {TiException.E_APP_SERVICE_ERROR} When absent (`error.consent.decision-required`) or unrecognized (`error.consent.invalid-decision`).
     * @public
     */
    requireDecision( rawValue, enabled ) {
        if ( enabled !== true ) {
            return null;
        }
        if ( rawValue === undefined || rawValue === null || rawValue === "" ) {
            throw exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: "error.consent.decision-required" }, exceptions.httpCode.C_422 );
        }
        const decision = String( rawValue ).trim().toLowerCase();
        if ( !DECISION_VALUES.includes( decision ) ) {
            throw exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: "error.consent.invalid-decision" }, exceptions.httpCode.C_422 );
        }
        return decision;
    }

    /**
     * Constructs a consent record plus the text-registry entry it references. Throws rather than returning a partial
     * record: a malformed consent is worse than none.
     *
     * @method
     * @param {Object} input
     * @param {string} input.employeeID - The subject.
     * @param {string} input.decidedBy - Must equal employeeID; there is no proxy path.
     * @param {"granted"|"declined"} input.decision
     * @param {string} input.body - The verbatim statement shown.
     * @param {string} input.locale
     * @param {string} input.version - The config `version` in force.
     * @param {"evaluation-submit"|"scores-screen"} input.source
     * @param {string} [input.decidedAt] - ISO-8601; defaults to now.
     * @param {string|null} [input.supersedes] - recordID this replaces.
     * @returns {{record: ResearchConsentRecord, text: ResearchConsentText}}
     * @exception {TiException.E_WEB_INVALID_REQUEST_PARAMETERS} On missing employeeID/version/body or an unrecognized source.
     * @exception {TiException.E_APP_SERVICE_ERROR} On an unrecognized decision value.
     * @exception {TiException.E_SEC_UNAUTHORIZED_ACCESS} When decidedBy is not the subject.
     * @public
     */
    buildDecisionRecord( input ) {
        const source = input || {};
        const employeeID = String( source.employeeID || "" ).trim();
        const decidedBy = String( source.decidedBy || "" ).trim();
        const decision = String( source.decision || "" ).trim().toLowerCase();
        const body = ( source.body == null ) ? "" : String( source.body );
        const locale = String( source.locale || "" ).trim() || "en";
        const version = String( source.version || "" ).trim();
        const origin = String( source.source || "" ).trim();
        const decidedAt = source.decidedAt || new Date().toISOString();
        const supersedes = source.supersedes || null;

        if ( !employeeID || !version || !body || !SOURCE_VALUES.includes( origin ) ) {
            throw exceptions.raise( exceptions.exceptionCode.E_WEB_INVALID_REQUEST_PARAMETERS, { employeeID, version, source: origin } );
        }
        if ( !DECISION_VALUES.includes( decision ) ) {
            throw exceptions.raise( exceptions.exceptionCode.E_APP_SERVICE_ERROR, { details: "error.consent.invalid-decision" }, exceptions.httpCode.C_422 );
        }
        // Self-attestation is the invariant that carries the legal weight. "Someone else recorded it for them" is the
        // likeliest challenge to an electronic consent, and the cleanest answer is that no such code path exists.
        if ( decidedBy !== employeeID ) {
            throw exceptions.raise( exceptions.exceptionCode.E_SEC_UNAUTHORIZED_ACCESS, { details: "error.consent.not-self" }, exceptions.httpCode.C_403 );
        }

        const textHash = this.hashText( body );
        return {
            record: {
                recordID: tools.getUUID(),
                decision: decision,
                decidedAt: decidedAt,
                decidedBy: decidedBy,
                textHash: textHash,
                textVersion: version,
                locale: locale,
                source: origin,
                supersedes: supersedes
            },
            text: {
                locale: locale,
                version: version,
                body: body,
                firstSeenAt: decidedAt
            }
        };
    }

    /**
     * The record currently in force: newest by `decidedAt`, tie-broken on `recordID` so the result is deterministic
     * regardless of the order the store returned them in. Records without a timestamp are ignored as malformed.
     *
     * @method
     * @param {Array<ResearchConsentRecord>} chain
     * @returns {ResearchConsentRecord|null}
     * @public
     */
    resolveEffective( chain ) {
        if ( !Array.isArray( chain ) || chain.length === 0 ) {
            return null;
        }
        let newest = null;
        for ( const record of chain ) {
            if ( !record || !record.decidedAt ) {
                continue;
            }
            if ( !newest ) {
                newest = record;
                continue;
            }
            const stamp = String( record.decidedAt );
            const newestStamp = String( newest.decidedAt );
            if ( stamp > newestStamp || ( stamp === newestStamp && String( record.recordID || "" ) > String( newest.recordID || "" ) ) ) {
                newest = record;
            }
        }
        return newest;
    }

    /**
     * Whether research use is permitted for this chain. Fail-closed: an empty chain, a declined record, and anything
     * unrecognized all return false. Only an explicit newest-record `granted` returns true.
     *
     * @method
     * @param {Array<ResearchConsentRecord>} chain
     * @returns {boolean}
     * @public
     */
    isConsented( chain ) {
        const effective = this.resolveEffective( chain );
        return !!effective && effective.decision === DECISION_GRANTED;
    }

    /**
     * Whether an incoming decision would be a no-op write against the effective record: both the decision value AND
     * the exact statement text it was given against must match. Matching on decision alone would wrongly skip a
     * write when the statement text has changed since the last answer — the subject would then be left with an
     * on-file consent that predates the version they most recently saw. Kept here (rather than inline in the
     * caller) so this rule — genuinely new business logic — is unit-testable without Redis.
     *
     * @method
     * @param {ResearchConsentRecord|null} effective - The record currently in force, or null when there is none.
     * @param {"granted"|"declined"} decision - The incoming decision.
     * @param {string} textHash - The hash of the statement text currently shown.
     * @returns {boolean}
     * @public
     */
    isNoOpDecision( effective, decision, textHash ) {
        return !!effective && effective.decision === decision && effective.textHash === textHash;
    }

    /**
     * The per-cycle consent register: one row per employee in the supplied population, whether or not they have ever
     * been asked. A not-asked employee is reported with a null decision rather than omitted — the register's purpose
     * is to show who was asked and what they said, and "nobody asked them" is part of that answer.
     *
     * @method
     * @param {Array<string>} employeeIDs - The population to report on.
     * @param {Object.<string, Array<ResearchConsentRecord>>} chains - Consent chains keyed by employeeID.
     * @returns {{rows: Array<Object>, counts: {granted: number, declined: number, notAsked: number}}}
     * @public
     */
    buildConsentRegister( employeeIDs, chains ) {
        const population = Array.isArray( employeeIDs ) ? employeeIDs : [];
        const source = ( chains && typeof chains === "object" ) ? chains : {};
        const counts = { granted: 0, declined: 0, notAsked: 0 };
        const rows = [];

        for ( const employeeID of population ) {
            const effective = this.resolveEffective( source[ employeeID ] );
            if ( !effective ) {
                counts.notAsked++;
                rows.push( { employeeID: employeeID, decision: null, decidedAt: null, textVersion: null, textHash: null } );
                continue;
            }
            if ( effective.decision === DECISION_GRANTED ) {
                counts.granted++;
            } else {
                counts.declined++;
            }
            rows.push( {
                employeeID: employeeID,
                decision: effective.decision,
                decidedAt: effective.decidedAt,
                textVersion: effective.textVersion || null,
                textHash: effective.textHash || null
            } );
        }

        return { rows: rows, counts: counts };
    }

    /**
     * THE CHOKEPOINT. The only sanctioned path from evaluation data to research use — every future research export
     * must go through this function, and its fail-closed rules are what make a refusal consequential.
     *
     * Fail-closed in four ways: a disabled capability yields nothing, an employee with no chain is excluded, a
     * declined record is excluded, and any unrecognized decision is excluded. Only an explicit newest-record
     * `granted` gets in.
     *
     * Consent is resolved at CALL TIME, not at evaluation time, so a withdrawal genuinely takes effect for every
     * subsequent export. The returned `basis` is the provenance manifest an export should persist alongside its
     * dataset to record which consents backed it.
     *
     * @method
     * @param {Array<Object>} evaluations - Candidate evaluations (any cycle; filtered to options.cycleID here).
     * @param {Object.<string, Array<ResearchConsentRecord>>} chains - Consent chains keyed by employeeID, for THIS
     *   SAME cycle as options.cycleID (i.e. the result of dataManager.fetchConsentDecisions( options.cycleID )).
     *   Passing chains resolved for a different cycle silently yields cross-cycle consent from this fail-closed gate.
     * @param {Object} options
     * @param {string} options.cycleID
     * @param {boolean} options.enabled - The research-consent config `enabled` flag.
     * @returns {{included: Array<Object>, consentedCount: number, excludedCount: number, basis: {cycleID: string, resolvedAt: string, textHashes: Array<string>}}}
     * @public
     */
    filterConsentedEvaluations( evaluations, chains, options ) {
        const settings = options || {};
        const cycleID = settings.cycleID;
        const candidates = Array.isArray( evaluations ) ? evaluations.filter( ( evaluation ) => !!evaluation && evaluation.cycleID === cycleID ) : [];
        const basis = { cycleID: cycleID, resolvedAt: new Date().toISOString(), textHashes: [] };

        if ( settings.enabled !== true ) {
            return { included: [], consentedCount: 0, excludedCount: candidates.length, basis: basis };
        }

        const source = ( chains && typeof chains === "object" ) ? chains : {};
        const included = [];
        const hashes = new Set();

        for ( const evaluation of candidates ) {
            const chain = source[ evaluation.employeeID ];
            const effective = this.resolveEffective( chain );
            if ( !effective || effective.decision !== DECISION_GRANTED ) {
                continue;
            }
            included.push( evaluation );
            if ( effective.textHash ) {
                hashes.add( effective.textHash );
            }
        }

        basis.textHashes = Array.from( hashes ).sort();
        return {
            included: included,
            consentedCount: included.length,
            excludedCount: candidates.length - included.length,
            basis: basis
        };
    }

}

const instance = new ResearchConsent();
module.exports.instance = Object.freeze( instance );
