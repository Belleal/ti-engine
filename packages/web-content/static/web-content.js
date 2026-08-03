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

    /* --------------------------------------------------------- account menu */

    /**
     * Reads a cookie by name. The CSRF token is deliberately taken from the cookie rather than from the markup:
     * the topbar is on every page, including the ones a CDN shares, so a token baked into the HTML would be handed
     * to every other visitor -- breaking their submissions and publishing a value only their own session should know.
     */
    function readCookie( name ) {
        const match = document.cookie.match( new RegExp( "(?:^|; )" + name.replace( /[.*+?^${}()|[\]\\]/g, "\\$&" ) + "=([^;]*)" ) );
        return match ? decodeURIComponent( match[ 1 ] ) : "";
    }

    /**
     * Posts a form to its own action with the CSRF token attached, and reports the HTTP status. Uses the form's own
     * fields, so the markup stays the single description of what is sent.
     */
    function submitForm( form ) {
        const body = new URLSearchParams( new FormData( form ) );
        body.set( "csrfToken", readCookie( "ti-xsrf-token" ) );
        return fetch( form.getAttribute( "action" ), {
            method: "POST",
            credentials: "same-origin",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body: body.toString(),
            // NOT followed. The framework answers a successful sign-in with a 303, and following it makes the
            // outcome depend on whatever the target happens to return -- including failing outright, which is what
            // happens when the CSP carries `upgrade-insecure-requests` and the site is being served over plain HTTP:
            // the POST lands and creates the session, the redirect leg fails, fetch rejects, and the form reports an
            // error for a sign-in that actually worked. The user then presses F5 and finds themselves logged in.
            redirect: "manual"
        } );
    }

    /**
     * Whether the browser is signed in, according to the server.
     *
     * The authoritative question, asked directly, instead of inferring an answer from the status code of a redirect
     * chain. Sign-in is a session fact; the shape of the response that created it is a framework detail.
     */
    function isSignedIn() {
        return fetch( "/session", { credentials: "same-origin", headers: { accept: "application/json" } } )
            .then( function ( response ) { return response.ok ? response.json() : null; } )
            .then( function ( session ) { return !!( session && session.authenticated ); } )
            .catch( function () { return false; } );
    }

    function initAccountMenu( root ) {
        const menu = root.querySelector( ".account-menu" );
        if ( !menu ) {
            return;
        }
        const trigger = menu.querySelector( ".account-trigger" );
        const panel = menu.querySelector( ".account-panel" );
        if ( !trigger || !panel ) {
            return;
        }

        const signedOut = menu.querySelector( ".account-signed-out" );
        const signedIn = menu.querySelector( ".account-signed-in" );
        const identity = menu.querySelector( ".account-identity" );
        const error = menu.querySelector( ".account-error" );
        const loginForm = menu.querySelector( ".account-form" );
        const logoutForm = menu.querySelector( ".account-logout" );
        let loaded = false;

        function close() {
            trigger.setAttribute( "aria-expanded", "false" );
            panel.classList.remove( "account-panel-open" );
        }

        function showError( message ) {
            if ( error ) {
                error.textContent = message;
                error.hidden = !message;
            }
        }

        /*
         * The session is fetched on FIRST OPEN, not on load. The markup ships identical for everyone precisely so
         * pages stay shared-cacheable, which means the state has to come from somewhere -- but a public site is
         * almost entirely anonymous readers who will never touch this control, and making all of them pay an
         * uncacheable request on every page view to render a button they do not use is the wrong trade.
         */
        function loadSession() {
            if ( loaded ) {
                return;
            }
            loaded = true;
            fetch( "/session", { credentials: "same-origin", headers: { accept: "application/json" } } )
                .then( function ( response ) { return response.ok ? response.json() : null; } )
                .then( function ( session ) {
                    const authenticated = !!( session && session.authenticated );
                    if ( signedIn ) {
                        signedIn.hidden = !authenticated;
                    }
                    if ( signedOut ) {
                        signedOut.hidden = authenticated;
                    }
                    if ( authenticated ) {
                        menu.classList.add( "account-menu-authenticated" );
                        if ( identity ) {
                            identity.textContent = session.name || "";
                        }
                    }
                } )
                .catch( function () {
                    // Leave the sign-in form showing: offering the form to someone already signed in is a harmless
                    // wrong guess, whereas hiding it from someone signed out strands them.
                    loaded = false;
                } );
        }

        trigger.addEventListener( "click", function ( event ) {
            event.stopPropagation();
            const open = trigger.getAttribute( "aria-expanded" ) === "true";
            trigger.setAttribute( "aria-expanded", open ? "false" : "true" );
            panel.classList.toggle( "account-panel-open", !open );
            if ( !open ) {
                loadSession();
            }
        } );
        panel.addEventListener( "click", function ( event ) { event.stopPropagation(); } );
        document.addEventListener( "click", function ( event ) {
            if ( !menu.contains( event.target ) ) {
                close();
            }
        } );
        document.addEventListener( "keydown", function ( event ) {
            if ( event.key === "Escape" ) {
                close();
            }
        } );

        if ( loginForm ) {
            loginForm.addEventListener( "submit", function ( event ) {
                event.preventDefault();
                showError( "" );
                const button = loginForm.querySelector( ".account-submit" );
                if ( button ) {
                    button.disabled = true;
                }
                // The POST's own outcome is deliberately ignored -- `.catch` folds a failed redirect leg into the
                // same path as a refused credential, and then the server is asked what actually happened.
                submitForm( loginForm ).catch( function () { /* answered by isSignedIn below */ } ).then( isSignedIn ).then( function ( signedIn ) {
                    if ( signedIn ) {
                        // Reload rather than update in place: what a signed-in viewer may SEE is decided server-side,
                        // so the page has to be rendered again to show it.
                        window.location.reload();
                        return;
                    }
                    // Deliberately one message for every failure. Saying which of the two was wrong tells an
                    // attacker which usernames exist.
                    showError( menu.getAttribute( "data-error" ) || "Sign-in failed. Check your details and try again." );
                    if ( button ) {
                        button.disabled = false;
                    }
                } );
            } );
        }

        if ( logoutForm ) {
            logoutForm.addEventListener( "submit", function ( event ) {
                event.preventDefault();
                // Reloaded either way: signing out is the one outcome where being wrong is safe, because the reload
                // renders whatever the session actually is now.
                submitForm( logoutForm ).catch( function () { /* the reload settles it */ } ).then( function () {
                    window.location.reload();
                } );
            } );
        }
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

            const audio = new Audio();
            // `preload = "none"` BEFORE the src, or the browser starts fetching the moment the source is set. The
            // site ships tens of megabytes of audio; without this, every visit to a page with a player pulls at
            // least metadata for each track before anyone has pressed play.
            audio.preload = "none";
            audio.src = source;
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
        initAccountMenu( root );
        initDictionary( root );
        initAudio( root );
    }

    if ( document.readyState === "loading" ) {
        document.addEventListener( "DOMContentLoaded", init );
    } else {
        init();
    }

} )();
