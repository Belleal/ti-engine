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
 * Covers `tiToolbox.generateAvatarStyle`: an avatar takes one of seven tones its theme defines, chosen by the person,
 * and keeps the gradient every avatar had before when the theme defines none (CA-326).
 * <br/>
 * Up to 1.42.5 the colour was a gradient of three saturated hues set inline per person, so no theme could tone it down:
 * under a muted brand palette the avatars stayed bright green, magenta and blue.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );

const { loadTiFramework } = require( "./helpers/ti-framework-sandbox.js" );

const tiToolbox = loadTiFramework().stores.tiToolbox;

// The pre-1.43 gradient, recomputed here rather than read back from the code under test, so the fallback is pinned.
const djb2 = ( s ) => {
    let h = 5381;
    for ( let i = 0; i < s.length; i++ ) {
        h = ( ( h << 5 ) + h + s.charCodeAt( i ) ) | 0;
    }
    return Math.abs( h );
};
const gradientBefore = ( id, name ) => {
    const seed = String( id ) + "\x00" + String( name );
    const [ h0, h1, h2 ] = [ "A", "B", "C" ].map( ( suffix ) => djb2( seed + suffix ) % 360 );
    return `linear-gradient( 135deg, hsl( ${ h0 }, 70%, 48% ) 0%, hsl( ${ h1 }, 62%, 54% ) 50%, hsl( ${ h2 }, 65%, 44% ) 100% )`;
};
const toneOf = ( style ) => {
    const match = /^var\( --avatar-tone-(\d+), /.exec( style[ "--avatar-bg" ] );
    assert.ok( match, `not a theme tone: ${ style[ "--avatar-bg" ] }` );
    return Number( match[ 1 ] );
};

describe( "tiToolbox.generateAvatarStyle — a theme tone per person, the old gradient as the fallback", () => {

    it( "names one of seven tones, with the gradient every avatar had before as the fallback", () => {
        const style = tiToolbox.generateAvatarStyle( "8", "Boris Kostadinov" );
        const tone = toneOf( style );

        assert.equal( Object.keys( style ).join(), "--avatar-bg", "one custom property, which the framework's .ti-avatar reads" );
        assert.ok( tone >= 1 && tone <= 7 );
        assert.equal( style[ "--avatar-bg" ], `var( --avatar-tone-${ tone }, ${ gradientBefore( "8", "Boris Kostadinov" ) } )` );
    } );

    it( "gives a person the same tone on every call, and takes a missing id or name", () => {
        const first = tiToolbox.generateAvatarStyle( "17", "Maria Ivanova" );
        assert.equal( tiToolbox.generateAvatarStyle( "17", "Maria Ivanova" )[ "--avatar-bg" ], first[ "--avatar-bg" ] );

        for ( const [ id, name ] of [ [ undefined, "No ID" ], [ "5", undefined ], [ null, null ] ] ) {
            assert.ok( toneOf( tiToolbox.generateAvatarStyle( id, name ) ) >= 1 );
        }
    } );

    it( "spreads 300 people over all seven tones, none with more than twice its share or less than half", () => {
        const first = [ "Ivan", "Maria", "Georgi", "Elena", "Petar", "Desislava", "Nikolay", "Teodora", "Dimitar", "Yana", "Stefan", "Kalina", "Boris", "Vesela", "Martin" ];
        const last = [ "Petrov", "Ivanova", "Georgiev", "Dimitrova", "Stoyanov", "Nikolova", "Todorov", "Angelova", "Kolev", "Marinova", "Popov", "Hristova", "Iliev", "Vasileva", "Atanasov", "Pavlova", "Mihaylov", "Koleva", "Yordanov", "Petkova" ];
        const counts = new Array( 8 ).fill( 0 );
        for ( let i = 0; i < 300; i++ ) {
            counts[ toneOf( tiToolbox.generateAvatarStyle( String( i + 1 ), `${ first[ i % first.length ] } ${ last[ ( i * 7 ) % last.length ] }` ) ) ] += 1;
        }

        // 42.9 each by chance; measured 31 to 54. A count of 8 tones would follow only the sum of the characters.
        counts.slice( 1 ).forEach( ( count, index ) => {
            assert.ok( count >= 21 && count <= 86, `tone ${ index + 1 } took ${ count } of 300` );
        } );
    } );

} );
