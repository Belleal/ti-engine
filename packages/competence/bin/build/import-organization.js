/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/**
 * Operator CLI for the employee importer. Dry-run by default: writing requires an explicit `--apply`.
 *
 * Usage:
 *   node bin/build/import-organization.js --file employees.csv               # dry run, prints the plan
 *   node bin/build/import-organization.js --file employees.csv --apply       # writes
 *   node bin/build/import-organization.js --template > employees.csv         # emit the header row
 *   node bin/build/import-organization.js --file e.csv --delimiter ";"       # override detection
 *
 * Output names rows by employee_id and line number only — never a name, email, date of birth or grading. This runs
 * against real HR data, and a terminal or CI log is not a place for it.
 *
 * Exits non-zero when any row is rejected, so a run is scriptable.
 */

const fs = require( "node:fs" );

const configurationLoader = require( "#configuration-loader" );
const dataManager = require( "#data-manager" );
const organizationImport = require( "#organization-import" );

function parseArguments( argv ) {
    const args = { file: null, apply: false, template: false, delimiter: null };
    for ( let i = 0; i < argv.length; i++ ) {
        if ( argv[ i ] === "--file" ) args.file = argv[ ++i ];
        else if ( argv[ i ] === "--apply" ) args.apply = true;
        else if ( argv[ i ] === "--template" ) args.template = true;
        else if ( argv[ i ] === "--delimiter" ) args.delimiter = argv[ ++i ];
    }
    return args;
}

function printTemplate() {
    const columns = organizationImport.instance.COLUMNS;
    process.stdout.write( columns.required.concat( columns.optional ).join( "," ) + "\n" );
}

function printPlan( plan, applied ) {
    process.stdout.write( `\n${ applied ? "APPLIED" : "DRY RUN — nothing was written" }\n` );
    process.stdout.write( `  create    ${ plan.create.length }\n` );
    process.stdout.write( `  update    ${ plan.update.length }\n` );
    process.stdout.write( `  unchanged ${ plan.unchanged.length }\n` );
    process.stdout.write( `  rejected  ${ plan.rejected.length }\n` );
    process.stdout.write( `  in store but absent from the file: ${ plan.absent.length } (left untouched)\n` );

    if ( plan.rejected.length > 0 ) {
        process.stdout.write( "\nRejections:\n" );
        for ( const rejection of plan.rejected ) {
            const where = rejection.row ? `line ${ rejection.row }` : "unknown line";
            process.stdout.write( `  ${ where }, employee_id '${ rejection.employeeID }': ${ rejection.code } — ${ rejection.message }\n` );
        }
    }
    if ( plan.absent.length > 0 ) {
        process.stdout.write( `\nAbsent from the file (employee_id): ${ plan.absent.join( ", " ) }\n` );
        process.stdout.write( "A departure is never inferred from an omission — mark a leaver with employment_status=terminated.\n" );
    }
}

function run() {
    const args = parseArguments( process.argv.slice( 2 ) );

    if ( args.template ) {
        printTemplate();
        return Promise.resolve( 0 );
    }
    if ( !args.file ) {
        process.stderr.write( "Missing --file. Use --template to emit the expected header row.\n" );
        return Promise.resolve( 2 );
    }

    let text;
    try {
        // 'utf8' replaces an undecodable byte with U+FFFD rather than throwing, so check for it explicitly: a
        // CP1251 export of Cyrillic names would otherwise be written to the store as mojibake.
        text = fs.readFileSync( args.file, "utf8" );
    } catch ( error ) {
        process.stderr.write( `Unable to read '${ args.file }': ${ error.message }\n` );
        return Promise.resolve( 2 );
    }
    if ( text.includes( "�" ) ) {
        process.stderr.write( "The file is not valid UTF-8. Re-export it as UTF-8 — a Windows-1251 export would store names as mojibake.\n" );
        return Promise.resolve( 2 );
    }

    const rows = organizationImport.instance.parseDelimited( text, args.delimiter ? { delimiter: args.delimiter } : undefined );
    const { header, records } = organizationImport.instance.toRecords( rows );

    const missing = organizationImport.instance.COLUMNS.required.filter( ( column ) => !header.includes( column ) );
    if ( missing.length > 0 ) {
        process.stderr.write( `The header is missing required column(s): ${ missing.join( ", " ) }\n` );
        process.stderr.write( "Run with --template to see the expected header row.\n" );
        return Promise.resolve( 2 );
    }

    // A duplicate header cell is whole-file fatal, not a per-row rejection. `toRecords` keys records by header
    // cell, so two columns normalizing to the same key silently overwrite — the earlier column's data vanishes
    // with no error anywhere. Detect it here rather than in `toRecords`, which has no channel to report it.
    const duplicated = header.filter( ( column, index ) => column.length > 0 && header.indexOf( column ) !== index );
    if ( duplicated.length > 0 ) {
        process.stderr.write( `The header repeats column(s): ${ Array.from( new Set( duplicated ) ).join( ", " ) }\n` );
        process.stderr.write( "Header names are matched case-insensitively after trimming, so 'Note' and 'NOTE' collide.\n" );
        return Promise.resolve( 2 );
    }

    const { employees, errors } = organizationImport.instance.mapRows( records );

    return dataManager.instance.fetchEmployees().then( ( existing ) => {
        const plan = organizationImport.instance.reconcile( employees, existing, {
            roleFamilies: configurationLoader.configRoleFamilies,
            organizationStructure: configurationLoader.configOrganizationStructure
        } );

        // Mapping errors are rejections too — merge them so one list is the whole truth.
        plan.rejected = errors.map( ( error ) => ( {
            employeeID: "(unmapped)",
            row: error.row,
            code: error.code,
            message: `${ error.column }: ${ error.message }`
        } ) ).concat( plan.rejected );

        if ( !args.apply ) {
            printPlan( plan, false );
            return plan.rejected.length > 0 ? 1 : 0;
        }

        return organizationImport.instance.applyPlan( plan, {
            save: ( employee ) => dataManager.instance.saveEmployee( employee ),
            audit: ( entry ) => dataManager.instance.appendAuditEntry( Object.assign( { changedBy: "import-cli" }, entry ) )
        } ).then( () => {
            printPlan( plan, true );
            return plan.rejected.length > 0 ? 1 : 0;
        } );
    } );
}

if ( require.main === module ) {
    run().then( ( code ) => process.exit( code ) ).catch( ( error ) => {
        process.stderr.write( `Import failed: ${ error.message }\n` );
        process.exit( 2 );
    } );
}

module.exports = { run, parseArguments };
