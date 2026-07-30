/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * The site behaviour script -- vanilla, dependency-free, and loaded with the CSP nonce (under `strict-dynamic` a
 * nonce-less script simply never executes).
 *
 * Everything here is PROGRESSIVE ENHANCEMENT. Each feature detects its own markup and does nothing when absent, so
 * one missing section can never break another, and a page that ships without this file still reads: the dictionary
 * renders every entry expanded-by-default markup aside, the language menu is a normal list of links, and the
 * reveal choreography is defeated by the stylesheet rather than hiding content.
 *
 * Two rules from the markup contract shape the DOM work:
 *   - State is a CLASS or an ARIA attribute, never an inline style. A value that genuinely varies at runtime (the
 *     audio progress) is written to a CSS custom property, which is the sanctioned escape.
 *   - The dictionary toggle's visual state is derived from `aria-expanded`, so the announced state and the caret can
 *     never drift apart -- there is no separate open class to forget.
 */

"use strict";

( function () {

    /* ---------------------------------------------------------------- reveal */

    /**
     * Adds `.reveal-in` as each `.reveal` element enters the viewport. When IntersectionObserver is unavailable the
     * elements are revealed immediately -- the choreography is decoration, never a visibility gate.
     */
    function initReveal( root ) {
        const targets = root.querySelectorAll( ".reveal" );
        if ( !targets.length ) {
            return;
        }
        if ( typeof IntersectionObserver !== "function" ) {
            targets.forEach( function ( target ) { target.classList.add( "reveal-in" ); } );
            return;
        }
        const observer = new IntersectionObserver( function ( entries ) {
            entries.forEach( function ( entry ) {
                if ( entry.isIntersecting ) {
                    entry.target.classList.add( "reveal-in" );
                    observer.unobserve( entry.target );
                }
            } );
        }, { rootMargin: "0px 0px -12% 0px" } );
        targets.forEach( function ( target ) { observer.observe( target ); } );
    }

    /* --------------------------------------------------------------- topbar */

    function initTopbar( root ) {
        const toggle = root.querySelector( ".topbar-toggle" );
        const nav = root.querySelector( ".topbar-nav" );
        if ( !toggle || !nav ) {
            return;
        }
        toggle.setAttribute( "aria-expanded", "false" );
        toggle.addEventListener( "click", function () {
            const open = toggle.getAttribute( "aria-expanded" ) === "true";
            toggle.setAttribute( "aria-expanded", open ? "false" : "true" );
            nav.classList.toggle( "topbar-nav-open", !open );
        } );
    }

    /* ---------------------------------------------------------- lang select */

    function initLangSelect( root ) {
        const select = root.querySelector( ".lang-select" );
        if ( !select ) {
            return;
        }
        const trigger = select.querySelector( ".lang-select-trigger" );
        const menu = select.querySelector( ".lang-select-menu" );
        if ( !trigger || !menu ) {
            return;
        }

        function close() {
            trigger.setAttribute( "aria-expanded", "false" );
            menu.classList.remove( "lang-select-menu-open" );
        }

        trigger.addEventListener( "click", function ( event ) {
            event.stopPropagation();
            const open = trigger.getAttribute( "aria-expanded" ) === "true";
            trigger.setAttribute( "aria-expanded", open ? "false" : "true" );
            menu.classList.toggle( "lang-select-menu-open", !open );
        } );
        document.addEventListener( "click", function ( event ) {
            if ( !select.contains( event.target ) ) {
                close();
            }
        } );
        document.addEventListener( "keydown", function ( event ) {
            if ( event.key === "Escape" ) {
                close();
            }
        } );
    }

    /* ----------------------------------------------------------- dictionary */

    function initDictionary( root ) {
        const section = root.querySelector( ".section-dictionary" );
        if ( !section ) {
            return;
        }

        // Each header bar is the toggle. The caret is rotated off [aria-expanded], so state cannot drift.
        section.querySelectorAll( ".dictionary-entry-toggle" ).forEach( function ( toggle ) {
            toggle.addEventListener( "click", function () {
                const open = toggle.getAttribute( "aria-expanded" ) === "true";
                toggle.setAttribute( "aria-expanded", open ? "false" : "true" );
                const detail = document.getElementById( toggle.getAttribute( "aria-controls" ) );
                if ( detail ) {
                    detail.hidden = open;
                }
            } );
        } );

        const search = section.querySelector( ".dictionary-search" );
        const roleSelect = section.querySelector( ".dictionary-select" );
        const count = section.querySelector( ".dictionary-count" );
        const empty = section.querySelector( ".state-panel" );
        const entries = Array.prototype.slice.call( section.querySelectorAll( ".dictionary-entry" ) );
        const groups = Array.prototype.slice.call( section.querySelectorAll( ".dictionary-group" ) );
        const indexLinks = Array.prototype.slice.call( section.querySelectorAll( ".dictionary-index-link" ) );
        const totalLabel = count ? count.textContent : "";

        function apply() {
            const term = search ? search.value.trim().toLowerCase() : "";
            const role = roleSelect ? roleSelect.value : "";
            let visible = 0;

            entries.forEach( function ( entry ) {
                const matchesRole = !role || entry.getAttribute( "data-role" ) === role;
                const matchesTerm = !term || entry.textContent.toLowerCase().indexOf( term ) !== -1;
                const show = matchesRole && matchesTerm;
                entry.hidden = !show;
                if ( show ) {
                    visible++;
                }
            } );

            const lettersWithMatches = {};
            groups.forEach( function ( group ) {
                const shown = group.querySelectorAll( ".dictionary-entry:not([hidden])" ).length;
                group.hidden = shown === 0;
                if ( shown > 0 ) {
                    lettersWithMatches[ group.getAttribute( "data-letter" ) ] = true;
                }
            } );

            // Filtering toggles `hidden` and the empty-link class -- never a style.
            indexLinks.forEach( function ( link ) {
                link.classList.toggle( "dictionary-index-link-empty", !lettersWithMatches[ link.getAttribute( "data-letter" ) ] );
            } );

            if ( count ) {
                // With no filter active the count reports the whole lexicon, not the rows currently in the DOM.
                const filtering = !!term || !!role;
                count.textContent = filtering ? visible + " / " + totalLabel : totalLabel;
            }
            if ( empty ) {
                empty.hidden = visible !== 0;
            }
        }

        if ( search ) {
            search.addEventListener( "input", apply );
        }
        if ( roleSelect ) {
            roleSelect.addEventListener( "change", apply );
        }
    }

    /* ---------------------------------------------------------------- audio */

    function initAudio( root ) {
        root.querySelectorAll( ".audio-player" ).forEach( function ( player ) {
            const source = player.getAttribute( "data-src" );
            const button = player.querySelector( ".audio-play" );
            const progress = player.querySelector( ".audio-rail-progress" );
            const time = player.querySelector( ".audio-time" );
            if ( !source || !button ) {
                return;
            }

            const audio = new Audio( source );
            const originalLabel = button.getAttribute( "aria-label" ) || "Play";

            button.addEventListener( "click", function () {
                if ( audio.paused ) {
                    audio.play();
                } else {
                    audio.pause();
                }
            } );

            audio.addEventListener( "play", function () {
                button.textContent = "❚❚";
                button.setAttribute( "aria-label", "Pause" );
                player.classList.add( "audio-playing" );
            } );
            [ "pause", "ended" ].forEach( function ( name ) {
                audio.addEventListener( name, function () {
                    button.textContent = "▶";
                    button.setAttribute( "aria-label", originalLabel );
                    player.classList.remove( "audio-playing" );
                } );
            } );

            audio.addEventListener( "timeupdate", function () {
                if ( progress && audio.duration ) {
                    // A custom property, not an inline width: the contract routes a runtime percentage through a token.
                    progress.style.setProperty( "--audio-progress", ( audio.currentTime / audio.duration * 100 ).toFixed( 2 ) + "%" );
                }
                if ( time && audio.duration ) {
                    time.textContent = formatTime( audio.currentTime ) + " / " + formatTime( audio.duration );
                }
            } );
        } );
    }

    function formatTime( seconds ) {
        const whole = Math.floor( seconds || 0 );
        const minutes = Math.floor( whole / 60 );
        const rest = whole % 60;
        return minutes + ":" + ( rest < 10 ? "0" : "" ) + rest;
    }

    /* ----------------------------------------------------------------- boot */

    function init() {
        const root = document;
        initReveal( root );
        initTopbar( root );
        initLangSelect( root );
        initDictionary( root );
        initAudio( root );
    }

    if ( document.readyState === "loading" ) {
        document.addEventListener( "DOMContentLoaded", init );
    } else {
        init();
    }

} )();
