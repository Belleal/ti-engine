/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
*/

/**
 * Covers What's new's rules and records (1.56.0, CA-528): which release a deployment runs and which it ran before,
 * which notes a person is shown, the checks on an application's notes, and the per-person marker, kept as a value so
 * erasure can delete it on D1.
 */

const { describe, it, beforeEach } = require( "node:test" );
const assert = require( "node:assert/strict" );

const { installInMemoryCache } = require( "./helpers/in-memory-cache" );
const cacheStub = installInMemoryCache();

const WhatsNew = require( "../components/whats-new.js" );

const MANAGER = 2;
const SUPERVISOR = 3;
const AUDIENCES = { manager: [ MANAGER ], supervisor: [ SUPERVISOR ] };

const NOTES = [
    { version: "2.3.0", notes: [ { id: "unreleased", kind: "new", audience: [ "everyone" ], title: { en: "Not yet" }, text: { en: "Not running." } } ] },
    {
        version: "2.2.0", notes: [
            { id: "for-all", kind: "new", audience: [ "everyone" ], screen: "reports", title: { en: "Reports", bg: "Отчети" }, text: { en: "A new screen.", bg: "Нов екран." } },
            { id: "for-managers", kind: "improved", audience: [ "manager" ], title: { en: "Team view" }, text: { en: "Better." } }
        ]
    },
    { version: "2.1.0", notes: [] },
    { version: "2.0.0", notes: [ { id: "approvals", kind: "new", audience: [ "supervisor", "admin" ], screen: "approvals", title: { en: "Approvals" }, text: { en: "Approve." } } ] },
    { version: "1.9.0", notes: [ { id: "old", kind: "fixed", audience: [ "everyone" ], title: { en: "Old fix" }, text: { en: "Fixed." } } ] }
];

const configured = ( overrides = {} ) => new WhatsNew().configure( Object.assign( { notes: NOTES, baseline: "1.9.0", audiences: AUDIENCES }, overrides ) );

// Arrays and objects compared by value, whatever realm or prototype they were made in.
const plain = ( value ) => JSON.parse( JSON.stringify( value ) );

describe( "WhatsNew — the release record", () => {

    it( "reads no record as the baseline, so the notes after it are new on the first start", () => {
        const { record, changed } = configured().nextRelease( null, "2.2.0", "2026-10-19T10:00:00.000Z" );
        assert.equal( changed, true );
        assert.deepEqual( record, { version: "2.2.0", previous: "1.9.0", since: "2026-10-19T10:00:00.000Z" } );
    } );

    it( "reads no record and no baseline as no previous release, so every note up to the running one is new", () => {
        const { record } = configured( { baseline: null } ).nextRelease( undefined, "2.2.0", "2026-10-19T10:00:00.000Z" );
        assert.equal( record.previous, null );
    } );

    it( "keeps the record on a restart of the same release", () => {
        const stored = { version: "2.2.0", previous: "2.0.0", since: "2026-10-01T00:00:00.000Z" };
        const { record, changed } = configured().nextRelease( stored, "2.2.0", "2026-10-19T10:00:00.000Z" );
        assert.equal( changed, false );
        assert.deepEqual( record, stored );
    } );

    it( "makes the stored version the previous one on an upgrade, however many versions it skips", () => {
        const { record, changed } = configured().nextRelease( { version: "2.0.0", previous: "1.9.0", since: "x" }, "2.2.0", "now" );
        assert.equal( changed, true );
        assert.deepEqual( record, { version: "2.2.0", previous: "2.0.0", since: "now" } );
    } );

    it( "on a rollback keeps the previous version only where it is older than what runs", () => {
        const whatsNew = configured();
        assert.equal( whatsNew.nextRelease( { version: "2.2.0", previous: "2.0.0" }, "2.1.0", "now" ).record.previous, "2.0.0" );
        assert.equal( whatsNew.nextRelease( { version: "2.2.0", previous: "2.1.0" }, "2.0.0", "now" ).record.previous, null );
    } );

    it( "compares versions by number, not by text, and a malformed one sorts first", () => {
        const whatsNew = configured();
        assert.ok( whatsNew.compareVersions( "1.10.0", "1.9.0" ) > 0 );
        assert.equal( whatsNew.compareVersions( "2.0.0", "2.0" ), 0 );
        assert.ok( whatsNew.compareVersions( "garbage", "0.0.1" ) < 0 );
    } );

} );

describe( "WhatsNew — which notes a person is shown", () => {

    const release = { version: "2.2.0", previous: "2.0.0", since: "now" };

    it( "maps an audience to the roles the application names, and gives everyone and the administrators for free", () => {
        const whatsNew = configured();
        assert.deepEqual( [ ...whatsNew.audiencesOf( [ 1 ] ) ], [ "everyone" ] );
        assert.deepEqual( [ ...whatsNew.audiencesOf( [ MANAGER, "admin" ] ) ].sort(), [ "admin", "everyone", "manager" ] );
        // A role code is matched as it is held: the string "2" is not the role 2.
        assert.deepEqual( [ ...whatsNew.audiencesOf( [ "2" ] ) ], [ "everyone" ] );
    } );

    it( "puts the notes of every version since the previous release first, and never one newer than what runs", () => {
        const { fresh, earlier } = configured().notesFor( { release, roles: [ MANAGER ], language: "en" } );
        assert.deepEqual( fresh.map( ( note ) => note.id ), [ "for-all", "for-managers" ] );
        assert.deepEqual( plain( earlier ).map( ( entry ) => entry.version ), [ "1.9.0" ] );
        assert.ok( !fresh.concat( ...earlier.map( ( entry ) => entry.notes ) ).some( ( note ) => note.id === "unreleased" ) );
    } );

    it( "shows a person only the notes written for an audience they belong to, and leaves out an empty version", () => {
        const { fresh, earlier } = configured().notesFor( { release: { version: "2.2.0", previous: "1.9.0" }, roles: [ SUPERVISOR ], language: "en" } );
        assert.deepEqual( fresh.map( ( note ) => note.id ), [ "for-all", "approvals" ] );
        assert.deepEqual( earlier.map( ( entry ) => entry.version ), [ "1.9.0" ] );
    } );

    it( "writes a note in the reader's language, else English, else the language it has", () => {
        const whatsNew = configured( { notes: [ { version: "2.2.0", notes: [ { id: "only-bg", kind: "new", audience: [ "everyone" ], title: { bg: "Само" }, text: { bg: "Текст" } } ] } ] } );
        assert.equal( configured().notesFor( { release, roles: [], language: "bg" } ).fresh[ 0 ].title, "Отчети" );
        assert.equal( configured().notesFor( { release, roles: [], language: "de" } ).fresh[ 0 ].title, "Reports" );
        assert.equal( whatsNew.notesFor( { release, roles: [], language: "en" } ).fresh[ 0 ].title, "Само" );
    } );

    it( "keeps a note's link only where the reader may open its screen", () => {
        const notes = configured().notesFor( { release, roles: [], language: "en", canOpen: ( screen ) => screen !== "reports" } ).fresh;
        assert.equal( notes[ 0 ].screen, null );
        assert.equal( configured().notesFor( { release, roles: [], language: "en", canOpen: () => true } ).fresh[ 0 ].screen, "reports" );
    } );

    it( "counts a release seen once the marker names it or a newer one", () => {
        const whatsNew = configured();
        assert.equal( whatsNew.hasSeen( null, release ), false );
        assert.equal( whatsNew.hasSeen( { version: "2.0.0" }, release ), false );
        assert.equal( whatsNew.hasSeen( { version: "2.2.0" }, release ), true );
    } );

} );

describe( "WhatsNew — the application's notes", () => {

    it( "accepts well-formed notes", () => {
        assert.deepEqual( WhatsNew.validateNotes( NOTES, [ "manager", "supervisor" ] ), [] );
    } );

    it( "refuses an audience the application does not map, so a typo stops the start", () => {
        const issues = WhatsNew.validateNotes( NOTES, [ "manager" ] );
        assert.ok( issues.length > 0 );
        assert.throws( () => new WhatsNew().configure( { notes: NOTES, audiences: { manager: [ MANAGER ] } } ), ( error ) => {
            assert.equal( error.data.reason, "invalid-whats-new-notes" );
            assert.ok( error.data.issues.length > 0 );
            return true;
        } );
    } );

    it( "refuses versions out of order or repeated, and a note's ID twice in one version", () => {
        const swapped = [ NOTES[ 4 ], NOTES[ 3 ] ];
        assert.match( WhatsNew.validateNotes( swapped, [ "supervisor" ] ).join( " " ), /newest first/ );
        const twice = [ { version: "1.0.0", notes: [ NOTES[ 4 ].notes[ 0 ], NOTES[ 4 ].notes[ 0 ] ] } ];
        assert.match( WhatsNew.validateNotes( twice ).join( " " ), /appears twice/ );
    } );

    it( "refuses a kind it does not know, a note with no text, and anything but a list", () => {
        const badKind = [ { version: "1.0.0", notes: [ Object.assign( {}, NOTES[ 4 ].notes[ 0 ], { kind: "removed" } ) ] } ];
        const noText = [ { version: "1.0.0", notes: [ Object.assign( {}, NOTES[ 4 ].notes[ 0 ], { text: {} } ) ] } ];
        assert.ok( WhatsNew.validateNotes( badKind ).length > 0 );
        assert.ok( WhatsNew.validateNotes( noText ).length > 0 );
        assert.ok( WhatsNew.validateNotes( { releases: [] } ).length > 0 );
    } );

    it( "refuses to map the built-in audiences, a malformed baseline, and an audience with no roles", () => {
        assert.throws( () => new WhatsNew().configure( { notes: [], audiences: { admin: [ 1 ] } } ) );
        assert.throws( () => new WhatsNew().configure( { notes: [], audiences: { team: [] } } ) );
        assert.throws( () => new WhatsNew().configure( { notes: [], baseline: "3.x" } ) );
    } );

    it( "is off until configured", () => {
        assert.equal( new WhatsNew().isEnabled, false );
        assert.equal( configured().isEnabled, true );
    } );

} );

describe( "WhatsNew — the records it keeps", () => {

    beforeEach( () => {
        cacheStub.storage = {};
        cacheStub.values = {};
    } );

    it( "writes the release record once, as a value, and reads it back on the next start", async () => {
        const first = configured();
        const release = await first.currentRelease( "2.2.0" );
        assert.deepEqual( { version: release.version, previous: release.previous }, { version: "2.2.0", previous: "1.9.0" } );
        assert.ok( await cacheStub.getValue( "ti:whats-new:release" ), "kept as a value, which D1 can replace and delete" );
        assert.deepEqual( Object.keys( cacheStub.storage ), [], "never a JSON document" );

        const restarted = configured();
        const again = await restarted.currentRelease( "2.2.0" );
        assert.equal( again.since, release.since, "a restart keeps when the release began" );

        const upgraded = await configured().currentRelease( "2.3.0" );
        assert.equal( upgraded.previous, "2.2.0" );
    } );

    it( "works from the running version alone while the store fails, and tries again on the next call", async ( t ) => {
        const whatsNew = configured();
        t.mock.method( cacheStub, "getValue", () => Promise.reject( new Error( "store down" ) ) );
        const release = await whatsNew.currentRelease( "2.2.0" );
        assert.equal( release.previous, "1.9.0" );
        t.mock.restoreAll();
        await whatsNew.currentRelease( "2.2.0" );
        assert.ok( await cacheStub.getValue( "ti:whats-new:release" ), "the next call wrote the record" );
    } );

    it( "keeps a person's marker under a digest of their ID, and forgets it for their erasure", async () => {
        const whatsNew = configured();
        const key = WhatsNew.seenKeyOf( "jane@example.com" );
        assert.match( key, /^ti:whats-new:seen:[0-9a-f]{16}$/ );
        assert.ok( !key.includes( "@" ) );

        assert.equal( await whatsNew.markerOf( "jane@example.com" ), null );
        await whatsNew.markSeen( "2.2.0", "jane@example.com" );
        assert.equal( ( await whatsNew.markerOf( "jane@example.com" ) ).version, "2.2.0" );

        assert.equal( await whatsNew.forget( "jane@example.com" ), true );
        assert.equal( await whatsNew.markerOf( "jane@example.com" ), null );
        assert.equal( await whatsNew.forget( "jane@example.com" ), false );
    } );

    it( "refuses an empty subject ID, which would put everyone's marker under one key", () => {
        assert.throws( () => WhatsNew.seenKeyOf( "" ) );
        assert.throws( () => WhatsNew.seenKeyOf( null ) );
    } );

    it( "reports the notes unseen until the person marks the release, and none after", async () => {
        const whatsNew = configured();
        const reader = { running: "2.2.0", subjectID: "TD1", roles: [ MANAGER ], language: "en" };
        assert.deepEqual( plain( await whatsNew.status( reader ) ), { version: "2.2.0", unseen: 2, first: "Reports" } );
        await whatsNew.markSeen( "2.2.0", "TD1" );
        assert.deepEqual( plain( await whatsNew.status( reader ) ), { version: "2.2.0", unseen: 0, first: "" } );
        assert.equal( ( await whatsNew.view( reader ) ).seen, true );
    } );

} );
