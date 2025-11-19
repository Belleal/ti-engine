const fs = require( "node:fs" );
const path = require( "node:path" );

function copyLibrary( source, destination ) {
    try {
        fs.mkdirSync( path.dirname( destination ), { recursive: true } );
        fs.copyFileSync( source, destination );
        console.log( `Copied ${ source } -> ${ destination }` );
    } catch ( error ) {
        console.error( `Failed to copy ${ source } -> ${ destination }:`, error.message );
        process.exit( 1 );
    }
}

const staticDir = path.join( __dirname, "..", "static", "scripts", "lib" );

copyLibrary( require.resolve( "htmx.org/dist/htmx.min.js" ), path.join( staticDir, "htmx.min.js" ) );
copyLibrary( require.resolve( "@alpinejs/csp/dist/cdn.min.js" ), path.join( staticDir, "alpinejs-csp.min.js" ) );
