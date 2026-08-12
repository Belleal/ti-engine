"use strict";

/**
 * Decides which workspace packages carry a version that is not yet on the npm registry, so a merge
 * into `master` publishes exactly the bumps it introduced and nothing else.
 *
 * The registry — not a `git diff` of `package.json` — is the source of truth here. A cancelled run,
 * a merge that lands two bumps at once, a version published by hand, and a re-run of the workflow
 * all leave the registry right where a diff of the merge commit would be wrong.
 *
 * Usage:
 *   node .github/scripts/npm-publish-plan.js               plan every publishable package
 *   node .github/scripts/npm-publish-plan.js --json        print the plan as JSON on stdout
 *   node .github/scripts/npm-publish-plan.js --package X   plan only the package in `packages/X`
 *
 * With `GITHUB_OUTPUT` set the plan also writes the step outputs the workflow consumes: `packages`
 * (a JSON array of the entries still to publish) and `any` ("true"/"false"); in `--package` mode it
 * writes `published`, `name`, `version` and `tag` for that one package instead.
 */

const fs = require( "node:fs" );
const path = require( "node:path" );
const { execFileSync } = require( "node:child_process" );
const { readSection } = require( "./changelog-section.js" );

/**
 * The packages this repository publishes to npm, in dependency order — a dependent is never
 * published before the package it depends on. `competence` is deliberately absent: it is the
 * application, shipped as a container image by `cd.yml`, and must never reach the registry.
 *
 * @type {string[]}
 */
const PUBLISHABLE_PACKAGES = [ "core", "web-framework", "web-content", "tester" ];

const REGISTRY_URL = process.env.NPM_REGISTRY_URL || "https://registry.npmjs.org";
const REPOSITORY_ROOT = path.resolve( __dirname, "..", ".." );
const FETCH_ATTEMPTS = 3;

/**
 * Reads the name and version a package declares locally.
 *
 * @param {string} directory - the package directory under `packages/`
 * @returns {{ name: string, version: string }}
 */
function readPackageManifest( directory ) {
    const manifestPath = path.join( REPOSITORY_ROOT, "packages", directory, "package.json" );
    const manifest = JSON.parse( fs.readFileSync( manifestPath, "utf8" ) );

    if ( !manifest.name || !manifest.version ) {
        throw new Error( `${ manifestPath } declares no name or no version.` );
    }

    return { name: manifest.name, version: manifest.version };
}

/**
 * Fetches the versions already on the registry.
 *
 * @param {string} packageName - the scoped package name
 * @returns {Promise<{ versions: string[], latest: string|undefined }|null>} null when the package
 *          has never been published at all
 */
async function fetchPublishedVersions( packageName ) {
    // The abbreviated packument is a fraction of the size of the full document and still carries
    // both the version map and the dist-tags. The whole name is one path segment, so it is encoded
    // as one — `encodeURIComponent` rather than a hand-rolled swap of the scope separator, which
    // only ever escaped the first `/` and nothing else.
    const url = `${ REGISTRY_URL }/${ encodeURIComponent( packageName ) }`;
    const headers = { accept: "application/vnd.npm.install-v1+json" };
    let lastError;

    for ( let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt++ ) {
        try {
            const response = await fetch( url, { headers } );

            // A 404 is an answer, not a failure — the package simply is not on the registry.
            if ( response.status === 404 ) {
                return null;
            }
            if ( !response.ok ) {
                throw new Error( `the registry responded ${ response.status } ${ response.statusText }` );
            }

            const packument = await response.json();
            return {
                versions: Object.keys( packument.versions || {} ),
                latest: ( packument[ "dist-tags" ] || {} ).latest
            };
        } catch ( error ) {
            lastError = error;
            if ( attempt < FETCH_ATTEMPTS ) {
                await new Promise( resolve => setTimeout( resolve, attempt * 1000 ) );
            }
        }
    }

    // Never guess on a network failure: an unreachable registry must fail the run rather than be
    // read as "this version is missing", which would send an already-published version back up.
    throw new Error( `Could not read ${ packageName } from ${ REGISTRY_URL }: ${ lastError.message }` );
}

/**
 * Reads the tags present in the checkout.
 *
 * Publishing and tagging are two steps against two different systems, and the npm half is the
 * irreversible one. Knowing which versions are already tagged is what lets a re-run finish a
 * release that published but did not get as far as its tag, instead of skipping it forever on the
 * grounds that the registry already has it.
 *
 * @returns {Set<string>}
 */
function readExistingTags() {
    try {
        const output = execFileSync( "git", [ "tag", "--list" ], { cwd: REPOSITORY_ROOT, encoding: "utf8" } );
        return new Set( output.split( /\r?\n/ ).map( line => line.trim() ).filter( Boolean ) );
    } catch ( error ) {
        // Refuse to guess. An empty set here would read as "nothing is tagged" and re-tag versions
        // that are already released; the workflow checks out with `fetch-tags`, so a failure means
        // something is wrong that a human should see.
        throw new Error( `Could not read the existing tags: ${ error.message }`, { cause: error } );
    }
}

/**
 * Builds the plan entry for a single package.
 *
 * @param {string} directory - the package directory under `packages/`
 * @param {Set<string>} existingTags - the tags present in the checkout
 * @returns {Promise<Object>}
 */
async function planPackage( directory, existingTags ) {
    const { name, version } = readPackageManifest( directory );
    const registry = await fetchPublishedVersions( name );
    const tag = `${ directory }-v${ version }`;

    return {
        directory: directory,
        name: name,
        version: version,
        tag: tag,
        latest: ( registry && registry.latest ) || "—",
        published: registry !== null && registry.versions.includes( version ),
        tagged: existingTags.has( tag ),
        neverPublished: registry === null
    };
}

/**
 * Describes what a plan entry still needs.
 *
 * @param {Object} entry
 * @returns {string}
 */
function outstandingWork( entry ) {
    if ( entry.neverPublished ) {
        return "never published";
    }
    if ( !entry.published ) {
        return "publish";
    }
    return entry.tagged ? "up to date" : "tag + release";
}

/**
 * Appends step outputs for the workflow to consume. No value here can contain a newline, so the
 * plain `key=value` form is safe.
 *
 * @param {Object} outputs
 */
function writeStepOutputs( outputs ) {
    if ( !process.env.GITHUB_OUTPUT ) {
        return;
    }

    const lines = Object.entries( outputs ).map( ( [ key, value ] ) => `${ key }=${ value }` );
    fs.appendFileSync( process.env.GITHUB_OUTPUT, lines.join( "\n" ) + "\n" );
}

/**
 * Renders the plan as a markdown table, on stdout and — when running in Actions — in the job
 * summary, so the decision this script made is visible without reading the log.
 *
 * @param {Object[]} plan
 */
function reportPlan( plan ) {
    const rows = plan.map( entry => {
        const work = outstandingWork( entry );
        const action = ( work === "up to date" ) ? work : `**${ work }**`;
        const tagged = entry.tagged ? entry.tag : "—";
        return `| \`${ entry.name }\` | ${ entry.version } | ${ entry.latest } | ${ tagged } | ${ action } |`;
    } );
    const table = [
        "| Package | Local | On npm | Tag | Action |",
        "| --- | --- | --- | --- | --- |",
        ...rows
    ].join( "\n" );

    console.log( table );

    if ( process.env.GITHUB_STEP_SUMMARY ) {
        fs.appendFileSync( process.env.GITHUB_STEP_SUMMARY, `### npm publish plan\n\n${ table }\n` );
    }
}

/**
 * Builds the plan and reports it, in whichever of the three shapes was asked for: the workflow
 * matrix, a single package's state, or a table for a human.
 *
 * @returns {Promise<void>}
 */
async function main() {
    const args = process.argv.slice( 2 );
    const asJSON = args.includes( "--json" );
    const packageIndex = args.indexOf( "--package" );
    const singleDirectory = ( packageIndex >= 0 ) ? args[ packageIndex + 1 ] : undefined;

    if ( packageIndex >= 0 && !PUBLISHABLE_PACKAGES.includes( singleDirectory ) ) {
        // The guard is the point: it is what stops `competence`, or a typo, from being handed to
        // `npm publish` by a workflow input.
        throw new Error( `"${ singleDirectory }" is not a publishable package. Publishable: ${ PUBLISHABLE_PACKAGES.join( ", " ) }.` );
    }

    const existingTags = readExistingTags();
    const plan = [];
    for ( const directory of ( singleDirectory ? [ singleDirectory ] : PUBLISHABLE_PACKAGES ) ) {
        plan.push( await planPackage( directory, existingTags ) );
    }

    if ( singleDirectory ) {
        const entry = plan[ 0 ];
        writeStepOutputs( {
            published: String( entry.published ),
            name: entry.name,
            version: entry.version,
            tag: entry.tag
        } );
        console.log( `${ entry.name }@${ entry.version } is ${ entry.published ? "already on" : "not yet on" } the registry.` );
        return;
    }

    if ( asJSON ) {
        console.log( JSON.stringify( plan, null, 4 ) );
        return;
    }

    reportPlan( plan );

    // Trusted publishing cannot create a package: the first version has to be published with a
    // token, and a trusted publisher can only be configured on npmjs.com once the package exists.
    // That is a human step, so say so plainly instead of letting `npm publish` fail on ENEEDAUTH.
    const missing = plan.filter( entry => entry.neverPublished );
    if ( missing.length > 0 ) {
        const names = missing.map( entry => entry.name ).join( ", " );
        throw new Error(
            `${ names } has never been published, and OIDC cannot publish a package's first version. ` +
            `Publish it once by hand, then add a trusted publisher for it on npmjs.com ` +
            `(repository Belleal/ti-engine, workflow npm-publish.yml) before this workflow can take over.`
        );
    }

    // A release is a version on the registry *and* the tag and GitHub release that point at the
    // commit it came from. Those are two systems and only the npm half is irreversible, so a
    // version that published but never got its tag is unfinished, not done: it stays in the plan
    // until both halves exist. Without this a run that died between the two steps would leave the
    // package permanently untagged, since every later run would see it on the registry and skip it.
    const outstanding = plan.filter( entry => !entry.published || !entry.tagged );

    // Every version in the plan needs the changelog section that becomes its release body. Checked
    // here, before anything is published, because this is the last point at which failing costs
    // nothing: after `npm publish` the version is permanent, and refusing to tag it would only add
    // a missing release to a missing changelog entry.
    const undocumented = outstanding.filter( entry => readSection( entry.directory, entry.version ) === null );
    if ( undocumented.length > 0 ) {
        const names = undocumented.map( entry => `${ entry.name }@${ entry.version }` ).join( ", " );
        throw new Error(
            `No "## Version" section for ${ names }. Add it to the package's CHANGELOG.md — the ` +
            `release notes are built from it, and a version bump without one is an unfinished release.`
        );
    }

    writeStepOutputs( {
        packages: JSON.stringify( outstanding ),
        any: String( outstanding.length > 0 )
    } );
}

main().catch( error => {
    console.error( `::error::${ error.message }` );
    process.exit( 1 );
} );
