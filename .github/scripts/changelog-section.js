"use strict";

/**
 * Prints the `## Version <x.y.z>` section of a package changelog, which the publish workflow uses
 * as the body of the GitHub release it creates for that version.
 *
 * The section is located by its heading rather than by position, because the changelogs in this
 * repository are not consistently ordered — `core` lists the newest version first, `web-content`
 * the oldest.
 *
 * Usage: node .github/scripts/changelog-section.js <package-directory> <version>
 *
 * A missing file or missing section is reported on stderr and replaced with a one-line fallback
 * body. By the time this runs the version is already on the registry, and a gap in a changelog is
 * not worth failing a release over.
 */

const fs = require( "node:fs" );
const path = require( "node:path" );

const REPOSITORY_ROOT = path.resolve( __dirname, "..", ".." );

/**
 * Extracts the lines belonging to one version's section.
 *
 * @param {string} changelog - the full changelog text
 * @param {string} version - the version whose section to return
 * @returns {string|null} the section body, or null when there is no heading for that version
 */
function extractSection( changelog, version ) {
    const lines = changelog.split( /\r?\n/ );
    const heading = new RegExp( `^##\\s+Version\\s+${ version.replace( /\./g, "\\." ) }\\s*$` );
    const start = lines.findIndex( line => heading.test( line ) );

    if ( start < 0 ) {
        return null;
    }

    // Any following level-two heading closes the section — that is the next version, whichever
    // direction the file happens to be ordered in.
    const rest = lines.slice( start + 1 );
    const end = rest.findIndex( line => /^##\s/.test( line ) );
    const body = ( end < 0 ? rest : rest.slice( 0, end ) ).join( "\n" ).trim();

    return body.length > 0 ? body : null;
}

function main() {
    const [ directory, version ] = process.argv.slice( 2 );

    if ( !directory || !version ) {
        console.error( "::error::Usage: changelog-section.js <package-directory> <version>" );
        process.exit( 1 );
    }

    const changelogPath = path.join( REPOSITORY_ROOT, "packages", directory, "CHANGELOG.md" );
    let section = null;

    if ( fs.existsSync( changelogPath ) ) {
        section = extractSection( fs.readFileSync( changelogPath, "utf8" ), version );
    }

    if ( section === null ) {
        console.error( `::warning::No "## Version ${ version }" section in packages/${ directory }/CHANGELOG.md.` );
        section = `See \`packages/${ directory }/CHANGELOG.md\` for the changes in this version.`;
    }

    console.log( section );
}

main();
