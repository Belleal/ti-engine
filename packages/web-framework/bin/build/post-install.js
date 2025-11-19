const fs = require( "node:fs" );
const path = require( "node:path" );

function copyLibrary( source, destination ) {
    fs.mkdirSync( path.dirname( destination ), { recursive: true } );
    fs.copyFileSync( source, destination );
    console.log( `Copied ${ source } -> ${ destination }` );
}

const staticDir = path.join( __dirname, "..", "static", "scripts", "lib" );

copyLibrary( require.resolve( "htmx.org/dist/htmx.min.js" ), path.join( staticDir, "htmx.min.js" ) );
copyLibrary( require.resolve( "@alpinejs/csp/dist/cdn.min.js" ), path.join( staticDir, "alpinejs-csp.min.js" ) );