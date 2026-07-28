/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );

const researchConsent = require( "#research-consent" ).instance;

const BODY = "We would like to use your evaluation information for research.";

function baseInput( overrides ) {
    return Object.assign( {
        employeeID: "7",
        decidedBy: "7",
        decision: "granted",
        body: BODY,
        locale: "en",
        version: "1.0",
        source: "evaluation-submit"
    }, overrides || {} );
}

describe( "ResearchConsent hashing", () => {

    it( "is stable across calls", () => {
        assert.equal( researchConsent.hashText( BODY ), researchConsent.hashText( BODY ) );
    } );

    it( "produces a 64-character hex digest", () => {
        assert.match( researchConsent.hashText( BODY ), /^[0-9a-f]{64}$/ );
    } );

    it( "is sensitive to whitespace — a reformatted statement is a different statement", () => {
        assert.notEqual( researchConsent.hashText( BODY ), researchConsent.hashText( BODY + " " ) );
        assert.notEqual( researchConsent.hashText( "a\n\nb" ), researchConsent.hashText( "a\nb" ) );
    } );

    it( "treats null and empty as the same empty string", () => {
        assert.equal( researchConsent.hashText( null ), researchConsent.hashText( "" ) );
    } );

} );

describe( "ResearchConsent.buildDecisionRecord", () => {

    it( "builds a record carrying the hash of the exact body shown", () => {
        const { record, text } = researchConsent.buildDecisionRecord( baseInput() );
        assert.equal( record.decision, "granted" );
        assert.equal( record.decidedBy, "7" );
        assert.equal( record.textHash, researchConsent.hashText( BODY ) );
        assert.equal( record.textVersion, "1.0" );
        assert.equal( record.locale, "en" );
        assert.equal( record.source, "evaluation-submit" );
        assert.equal( record.supersedes, null );
        assert.match( record.recordID, /^[0-9a-f-]{36}$/ );
        assert.match( record.decidedAt, /^\d{4}-\d{2}-\d{2}T/ );
        assert.equal( text.body, BODY );
        assert.equal( text.firstSeenAt, record.decidedAt );
    } );

    it( "accepts a declined decision", () => {
        const { record } = researchConsent.buildDecisionRecord( baseInput( { decision: "declined" } ) );
        assert.equal( record.decision, "declined" );
    } );

    it( "throws on an unknown decision value", () => {
        assert.throws( () => researchConsent.buildDecisionRecord( baseInput( { decision: "maybe" } ) ) );
    } );

    it( "throws when decidedBy is not the subject — no proxy consent", () => {
        assert.throws( () => researchConsent.buildDecisionRecord( baseInput( { decidedBy: "22" } ) ) );
    } );

    it( "throws on an unrecognized source", () => {
        assert.throws( () => researchConsent.buildDecisionRecord( baseInput( { source: "backfill" } ) ) );
    } );

    it( "throws when the body is empty — there would be nothing to prove", () => {
        assert.throws( () => researchConsent.buildDecisionRecord( baseInput( { body: "" } ) ) );
    } );

    it( "carries a supersedes pointer when one is supplied", () => {
        const { record } = researchConsent.buildDecisionRecord( baseInput( { supersedes: "prior-id" } ) );
        assert.equal( record.supersedes, "prior-id" );
    } );

} );

describe( "ResearchConsent.resolveEffective", () => {

    it( "returns null for an empty or absent chain", () => {
        assert.equal( researchConsent.resolveEffective( [] ), null );
        assert.equal( researchConsent.resolveEffective( null ), null );
        assert.equal( researchConsent.resolveEffective( undefined ), null );
    } );

    it( "returns the newest record by decidedAt regardless of array order", () => {
        const chain = [
            { recordID: "b", decision: "declined", decidedAt: "2026-08-02T10:00:00.000Z" },
            { recordID: "a", decision: "granted", decidedAt: "2026-08-01T10:00:00.000Z" }
        ];
        assert.equal( researchConsent.resolveEffective( chain ).recordID, "b" );
    } );

    it( "breaks a decidedAt tie deterministically on recordID", () => {
        const chain = [
            { recordID: "a", decision: "granted", decidedAt: "2026-08-01T10:00:00.000Z" },
            { recordID: "b", decision: "declined", decidedAt: "2026-08-01T10:00:00.000Z" }
        ];
        assert.equal( researchConsent.resolveEffective( chain ).recordID, "b" );
        assert.equal( researchConsent.resolveEffective( chain.slice().reverse() ).recordID, "b" );
    } );

    it( "ignores malformed records with no timestamp", () => {
        const chain = [
            { recordID: "a", decision: "granted", decidedAt: "2026-08-01T10:00:00.000Z" },
            { recordID: "junk", decision: "granted" }
        ];
        assert.equal( researchConsent.resolveEffective( chain ).recordID, "a" );
    } );

} );

describe( "ResearchConsent.isConsented", () => {

    it( "is false for an empty chain — silence is never consent", () => {
        assert.equal( researchConsent.isConsented( [] ), false );
        assert.equal( researchConsent.isConsented( null ), false );
    } );

    it( "is true only when the newest record is granted", () => {
        const granted = { recordID: "a", decision: "granted", decidedAt: "2026-08-01T10:00:00.000Z" };
        const declined = { recordID: "b", decision: "declined", decidedAt: "2026-08-02T10:00:00.000Z" };
        assert.equal( researchConsent.isConsented( [ granted ] ), true );
        assert.equal( researchConsent.isConsented( [ granted, declined ] ), false );
        // declined is dated 2026-08-02, strictly after granted's 2026-08-01, so it is the newest record in both
        // array orderings (resolveEffective is order-independent — see the "regardless of array order" test above).
        // Both orderings must therefore agree: effective = declined, so isConsented is false either way.
        assert.equal( researchConsent.isConsented( [ declined, granted ] ), false );
    } );

    it( "is false for an unrecognized decision value", () => {
        const odd = { recordID: "a", decision: "probably", decidedAt: "2026-08-01T10:00:00.000Z" };
        assert.equal( researchConsent.isConsented( [ odd ] ), false );
    } );

} );

describe( "ResearchConsent.isNoOpDecision", () => {

    const HASH_A = researchConsent.hashText( "statement A" );
    const HASH_B = researchConsent.hashText( "statement B" );

    it( "is not a no-op when there is no effective record", () => {
        assert.equal( researchConsent.isNoOpDecision( null, "granted", HASH_A ), false );
        assert.equal( researchConsent.isNoOpDecision( undefined, "granted", HASH_A ), false );
    } );

    it( "is a no-op when the decision and text hash both match", () => {
        const effective = { decision: "granted", textHash: HASH_A };
        assert.equal( researchConsent.isNoOpDecision( effective, "granted", HASH_A ), true );
    } );

    it( "is NOT a no-op when the decision matches but the text hash differs — the statement changed since the last answer", () => {
        const effective = { decision: "granted", textHash: HASH_A };
        assert.equal( researchConsent.isNoOpDecision( effective, "granted", HASH_B ), false );
    } );

    it( "is not a no-op when the text hash matches but the decision differs", () => {
        const effective = { decision: "granted", textHash: HASH_A };
        assert.equal( researchConsent.isNoOpDecision( effective, "declined", HASH_A ), false );
    } );

    it( "is not a no-op when both the decision and the text hash differ", () => {
        const effective = { decision: "granted", textHash: HASH_A };
        assert.equal( researchConsent.isNoOpDecision( effective, "declined", HASH_B ), false );
    } );

} );
