/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const os = require( "node:os" );
const path = require( "node:path" );
const fs = require( "node:fs" );

const { buildApplicationInfo, readApplicationManifest } = require( "../components/application-info.js" );

const MANIFEST = {
    name: "@ti-engine/competence",
    version: "3.18.0",
    description: "HR competency appraisal application.",
    license: "GPL-3.0-or-later",
    author: "Boris Kostadinov <kostadinov.boris@gmail.com>",
    repository: { type: "git", url: "git+https://github.com/Belleal/ti-engine.git", directory: "packages/competence" }
};

describe( "buildApplicationInfo — manifest normalization", () => {

    it( "derives a display name from the package name when none is declared", () => {
        assert.equal( buildApplicationInfo( { manifest: MANIFEST } ).name, "Competence" );
        assert.equal( buildApplicationInfo( { manifest: { name: "@ti-engine/web-framework" } } ).name, "Web Framework" );
    } );

    it( "prefers an explicit displayName over the derived one", () => {
        const info = buildApplicationInfo( { manifest: { ...MANIFEST, displayName: "Competence Appraisals" } } );
        assert.equal( info.name, "Competence Appraisals" );
        assert.equal( info.packageName, "@ti-engine/competence" );
    } );

    it( "carries version, description and license through verbatim", () => {
        const info = buildApplicationInfo( { manifest: MANIFEST } );
        assert.equal( info.version, "3.18.0" );
        assert.equal( info.description, "HR competency appraisal application." );
        assert.equal( info.license, "GPL-3.0-or-later" );
    } );

    it( "strips the contact suffix from a string author", () => {
        assert.equal( buildApplicationInfo( { manifest: MANIFEST } ).author, "Boris Kostadinov" );
    } );

    it( "handles every shape of npm's author string, and cannot leave a partial bracketed span behind", () => {
        // The name is everything before the first `<` or `(` — both contact parts are suffixes, never embedded.
        // The last case is the one that matters: removing `<…>` spans instead would leave a stray `<`, which is
        // what makes that shape an incomplete sanitizer.
        const nameOf = ( author ) => buildApplicationInfo( { manifest: { author } } ).author;
        assert.equal( nameOf( "Boris Kostadinov" ), "Boris Kostadinov" );
        assert.equal( nameOf( "Boris Kostadinov <a@b.c>" ), "Boris Kostadinov" );
        assert.equal( nameOf( "Boris Kostadinov (https://d.e)" ), "Boris Kostadinov" );
        assert.equal( nameOf( "Boris Kostadinov <a@b.c> (https://d.e)" ), "Boris Kostadinov" );
        assert.equal( nameOf( "Boris <<a>b> (x)" ), "Boris" );
    } );

    it( "reads the name out of an object author", () => {
        const info = buildApplicationInfo( { manifest: { author: { name: "Boris Kostadinov", email: "a@b.c" } } } );
        assert.equal( info.author, "Boris Kostadinov" );
    } );

    it( "falls back to the repository URL for the homepage, normalized to a browser-openable form", () => {
        // The `git+https://....git` form is valid in a manifest but is not a URL a user can click.
        assert.equal( buildApplicationInfo( { manifest: MANIFEST } ).homepage, "https://github.com/Belleal/ti-engine" );
    } );

    it( "prefers an explicit homepage over the repository URL", () => {
        const info = buildApplicationInfo( { manifest: { ...MANIFEST, homepage: "https://example.com/app" } } );
        assert.equal( info.homepage, "https://example.com/app" );
    } );

    it( "produces a usable descriptor from an empty manifest instead of throwing", () => {
        const info = buildApplicationInfo();
        assert.equal( info.name, "" );
        assert.equal( info.version, "" );
        assert.equal( info.releaseDate, "" );
        assert.deepEqual( info.components, [] );
        assert.deepEqual( info.sections, [] );
        assert.equal( info.runtime, null );
    } );

    it( "treats a whitespace-only manifest field as absent", () => {
        const info = buildApplicationInfo( { manifest: { name: "app", version: "   ", description: "\t" } } );
        assert.equal( info.version, "" );
        assert.equal( info.description, "" );
    } );

} );

describe( "buildApplicationInfo — environment overrides", () => {

    it( "lets TI_WEB_APP_NAME / _VERSION / _RELEASE_DATE win over the manifest", () => {
        const info = buildApplicationInfo( {
            manifest: { ...MANIFEST, releaseDate: "2026-01-01" },
            env: {
                TI_WEB_APP_NAME: "Competence (staging)",
                TI_WEB_APP_VERSION: "3.18.0-rc.2",
                TI_WEB_APP_RELEASE_DATE: "2026-08-13"
            }
        } );
        assert.equal( info.name, "Competence (staging)" );
        assert.equal( info.version, "3.18.0-rc.2" );
        assert.equal( info.releaseDate, "2026-08-13" );
    } );

    it( "keeps the manifest value when the override is absent or blank", () => {
        const info = buildApplicationInfo( {
            manifest: { ...MANIFEST, releaseDate: "2026-01-01" },
            env: { TI_WEB_APP_VERSION: "" }
        } );
        assert.equal( info.version, "3.18.0" );
        assert.equal( info.releaseDate, "2026-01-01" );
    } );

    it( "supplies the release date the manifest has no standard field for", () => {
        // The container case: the image stamps its build date, the baked manifest cannot know it.
        const info = buildApplicationInfo( { manifest: MANIFEST, env: { TI_WEB_APP_RELEASE_DATE: "2026-08-13" } } );
        assert.equal( info.releaseDate, "2026-08-13" );
    } );

} );

describe( "buildApplicationInfo — components and runtime", () => {

    it( "normalizes the component list and drops nameless entries", () => {
        const info = buildApplicationInfo( {
            manifest: MANIFEST,
            components: [ { name: "@ti-engine/core", version: "1.9.1" }, { version: "0.0.0" }, { name: " ", version: "x" } ]
        } );
        assert.deepEqual( info.components, [ { name: "@ti-engine/core", version: "1.9.1" } ] );
    } );

    it( "includes runtime facts verbatim when the caller supplies them", () => {
        const info = buildApplicationInfo( { manifest: MANIFEST, runtime: { node: "v22.11.0", platform: "linux" } } );
        assert.deepEqual( info.runtime, { node: "v22.11.0", platform: "linux" } );
    } );

    it( "copies the runtime object rather than aliasing the caller's", () => {
        const runtime = { node: "v22.11.0" };
        const info = buildApplicationInfo( { manifest: MANIFEST, runtime } );
        runtime.node = "mutated";
        assert.equal( info.runtime.node, "v22.11.0" );
    } );

    it( "withholds runtime facts by default — the caller opts in per session", () => {
        assert.equal( buildApplicationInfo( { manifest: MANIFEST } ).runtime, null );
    } );

} );

describe( "readApplicationManifest", () => {

    it( "reads and parses a manifest from the given directory", () => {
        const directory = fs.mkdtempSync( path.join( os.tmpdir(), "ti-app-info-" ) );
        try {
            fs.writeFileSync( path.join( directory, "package.json" ), JSON.stringify( { name: "x", version: "1.2.3" } ) );
            assert.equal( readApplicationManifest( directory ).version, "1.2.3" );
        } finally {
            fs.rmSync( directory, { recursive: true, force: true } );
        }
    } );

    it( "returns an empty object when the manifest is missing", () => {
        const directory = fs.mkdtempSync( path.join( os.tmpdir(), "ti-app-info-" ) );
        try {
            assert.deepEqual( readApplicationManifest( directory ), {} );
        } finally {
            fs.rmSync( directory, { recursive: true, force: true } );
        }
    } );

    it( "returns an empty object when the manifest is malformed rather than throwing", () => {
        // An informational screen must never be the reason a request 500s.
        const directory = fs.mkdtempSync( path.join( os.tmpdir(), "ti-app-info-" ) );
        try {
            fs.writeFileSync( path.join( directory, "package.json" ), "{ not json" );
            assert.deepEqual( readApplicationManifest( directory ), {} );
        } finally {
            fs.rmSync( directory, { recursive: true, force: true } );
        }
    } );

} );
