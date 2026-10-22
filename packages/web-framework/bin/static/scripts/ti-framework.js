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
 * @typedef {Object} SidebarFlyoutConfig
 * @property {string} menuTitle
 * @property {number} [offset]
 * @property {string} [icon]
 * @property {string} [placement]
 * @property {boolean} [fixed]
 * @property {Array<SidebarFlyoutButtonConfig>} [buttonConfigs]
 */

/**
 * @typedef {Object} SidebarFlyoutButtonConfig
 * @property {string} title
 * @property {string} icon
 * @property {Object} action
 * @property {string} action.href
 * @property {string} [action.method]
 * @property {string} action.target
 * @property {string} action.swap
 */

/**
 * Default configuration applied as a base when an application-supplied flyout config is merged into the store.
 *
 * @constant
 * @type {SidebarFlyoutConfig}
 */
const defaultSidebarFlyoutConfig = {
    menuTitle: "Menu",
    placement: "right-start",
    offset: 10,
    fixed: true,
    buttonConfigs: []
};

/**
 * How many avatar tones a theme may define, as `--avatar-tone-1` up to this number. See `generateAvatarStyle`.
 *
 * @type {number}
 */
const AVATAR_TONE_COUNT = 7;

/**
 * Returns a configuration object for the toolbox.
 *
 * @method
 * @returns {Object}
 * @public
 */
const configureToolbox = () => {
    /**
     * @typedef {Object} TiToolbox
     */
    return {

        /**
         * Used to clamp a position to a box.
         *
         * @method
         * @param {number} x
         * @param {number} y
         * @param {number} w
         * @param {number} h
         * @param {Object} box
         * @param {number} [edgePadding=0]
         * @returns {{x: number, y: number}}
         * @public
         */
        clampToBox( x, y, w, h, box, edgePadding = 0 ) {
            // If the box has an offset (visualViewport on some platforms), normalize appropriately.
            // For fixed elements, x/y are in viewport coordinates; for absolute, in page coordinates.
            const minX = box.left + edgePadding;
            const minY = box.top + edgePadding;
            const maxX = box.left + box.width - w - edgePadding;
            const maxY = box.top + box.height - h - edgePadding;
            return {
                x: Math.min( Math.max( x, minX ), Math.max( minX, maxX ) ),
                y: Math.min( Math.max( y, minY ), Math.max( minY, maxY ) )
            };
        },

        /**
         * Used to deep-freeze an object.
         *
         * @method
         * @param {Object} object
         * @param {WeakSet} [seen]
         * @returns {Object}
         * @public
         */
        deepFreeze( object, seen = new WeakSet() ) {
            if ( object === null || typeof object !== "object" || seen.has( object ) ) {
                return object;
            } else {
                seen.add( object );
                Object.keys( object ).forEach( ( key ) => {
                    this.deepFreeze( object[ key ], seen );
                } );
                return Object.freeze( object );
            }
        },

        /**
         * Used to perform a deep merge of two objects. 'base' is the object that will be modified.
         * <br/>
         * NOTE: If 'structuredClone' is not available, fall back to JSON.parse/JSON.stringify. The later will not preserve non-JSON-serializable
         * values (functions, undefined, symbols) and will convert Dates to strings, RegExp to empty objects, etc.
         *
         * @method
         * @param {Object} base
         * @param {Object} source
         * @returns {Object}
         * @public
         */
        deepMerge( base, source ) {
            if ( !this.isPlainObject( base ) || !this.isPlainObject( source ) ) {
                return this.structuredClone( source );
            } else {
                const out = { ...base };
                for ( const key of Object.keys( source ) ) {
                    const b = base[ key ];
                    const s = source[ key ];

                    if ( Array.isArray( s ) ) {
                        out[ key ] = s.slice();
                    } else if ( this.isPlainObject( s ) && this.isPlainObject( b ) ) {
                        out[ key ] = this.deepMerge( b, s );
                    } else if ( this.isPlainObject( s ) ) {
                        out[ key ] = this.deepMerge( {}, s );
                    } else {
                        out[ key ] = s;
                    }
                }
                return out;
            }
        },

        /**
         * Used to format a system string date value into a display string, in the page's own language.
         * <br/>
         * The locale is the document's `<html lang>`, never the browser's. Up to 1.43.0 this called
         * `toLocaleDateString()` with no locale, so the browser chose: a Bulgarian interface opened in an en-US browser
         * wrote "7/1/2026" between Bulgarian words, and two people reading the same screen saw the same date in two
         * orders. The month is written as a word ("1 Jul 2026", "1.07.2026 г."), so no reader can take 07/08 for the
         * 8th of July or for the 7th of August. A page that declares no language keeps the browser's (CA-333).
         *
         * @method
         * @param {string} value
         * @param {string} placeholder
         * @returns {string}
         * @public
         */
        formatDate( value, placeholder = "" ) {
            if ( !value ) return placeholder;
            const normalized = /^\d{4}-\d{2}-\d{2}$/.test( value )
                ? `${ value }T00:00:00`
                : value;
            const date = new Date( normalized );
            if ( !this.isValidDate( date ) ) {
                return placeholder;
            }
            try {
                return date.toLocaleDateString( document.documentElement.lang || undefined, { day: "numeric", month: "short", year: "numeric" } );
            } catch {
                // A `lang` that is not a well-formed language tag makes Intl throw a RangeError. The date still shows,
                // written the way it was before.
                return date.toLocaleDateString();
            }
        },

        /**
         * Used to get a cookie value by name.
         *
         * @method
         * @param {string} name
         * @returns {string}
         * @public
         */
        getCookie( name ) {
            const cookie = document.cookie.match( new RegExp( "(?:^|; )" + name.replace( /[$()*+.?[\]\\^{}|]/g, "\\$&" ) + "=([^;]*)" ) );
            return cookie ? decodeURIComponent( cookie[ 1 ] ) : "";
        },

        /**
         * Used to get the Monday of the week for a given date.
         *
         * @method
         * @param {Date} date
         * @returns {Date}
         * @public
         */
        getMonday( date ) {
            const d = new Date( date );
            const day = d.getDay();
            d.setDate( d.getDate() + ( day === 0 ? -6 : 1 - day ) );
            d.setHours( 0, 0, 0, 0 );
            return d;
        },

        /**
         * Used to get a URL query parameter value by name.
         *
         * @method
         * @param {string} name
         * @returns {string|null}
         * @public
         */
        getUrlParam( name ) {
            return new URLSearchParams( window.location.search ).get( name );
        },

        /**
         * Removes a query parameter from the address bar without reloading or adding a history entry.
         * <br/>
         * For a parameter that carries a one-time message: once it has been read and shown, it has done its job, and
         * leaving it in the URL means a refresh or a bookmark replays a failure that is no longer happening.
         * `replaceState` rather than `pushState`, so the back button is not left stepping through states the visitor
         * never navigated to.
         *
         * @method
         * @param {string} name
         * @public
         */
        clearUrlParam( name ) {
            if ( !window.history || typeof window.history.replaceState !== "function" ) {
                return;
            }
            const url = new URL( window.location.href );
            if ( !url.searchParams.has( name ) ) {
                return;
            }
            url.searchParams.delete( name );
            // Keep a bare "?" off the end when the last parameter goes.
            const search = url.searchParams.toString();
            window.history.replaceState( null, "", url.pathname + ( search ? "?" + search : "" ) + url.hash );
        },

        /**
         * Used to get the visible box of the document.
         *
         * @method
         * @param {boolean} isFixed
         * @returns {Object}
         * @public
         */
        getVisibleBox( isFixed ) {
            // Fixed coordinates are viewport-based (top/left = 0/0):
            if ( isFixed ) {
                if ( window.visualViewport ) {
                    const viewport = window.visualViewport;
                    return {
                        left: viewport.offsetLeft, // CSS px, where the viewport begins relative to a layout viewport
                        top: viewport.offsetTop,
                        width: viewport.width,
                        height: viewport.height,
                        pageLeft: viewport.pageLeft, // document coords
                        pageTop: viewport.pageTop
                    };
                } else {
                    return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight, pageLeft: window.scrollX, pageTop: window.scrollY };
                }
            } else {
                // Absolute coordinates are document-based (top/left = scroll position):
                return {
                    left: window.scrollX,
                    top: window.scrollY,
                    width: document.documentElement.clientWidth,
                    height: document.documentElement.clientHeight,
                    pageLeft: window.scrollX,
                    pageTop: window.scrollY
                };
            }
        },

        /**
         * Used to check if a value is a plain object.
         *
         * @method
         * @param {*} value
         * @returns {boolean}
         * @public
         */
        isPlainObject( value ) {
            return Object.prototype.toString.call( value ) === "[object Object]";
        },

        /**
         * Used to check if a value is a valid Date object.
         *
         * @method
         * @param {*} value
         * @returns {boolean}
         * @public
         */
        isValidDate( value ) {
            return value instanceof Date && !isNaN( value );
        },

        /**
         * Used to perform a structured clone operation.
         * <br/>
         * NOTE: If 'structuredClone' is not available — or throws DataCloneError on a reactive Proxy
         * (Alpine/Vue reactivity wraps assigned objects in Proxies that the browser's structured-clone
         * algorithm can refuse) — fall back to JSON.parse/JSON.stringify. The fallback will not preserve
         * non-JSON-serializable values (functions, undefined, symbols, Dates, RegExp).
         *
         * @method
         * @param {Object} value
         * @param {Object} [options]
         * @returns {Object}
         * @public
         */
        structuredClone( value, options ) {
            if ( typeof structuredClone === "function" ) {
                try {
                    return structuredClone( value, options );
                } catch {
                    return JSON.parse( JSON.stringify( value ) );
                }
            }
            return JSON.parse( JSON.stringify( value ) );
        },

        /**
         * Used to convert a Date object to an ISO date string (YYYY-MM-DD).
         *
         * @method
         * @param {Date} date
         * @returns {string}
         * @public
         */
        toDateString( date ) {
            const y = date.getFullYear();
            const m = String( date.getMonth() + 1 ).padStart( 2, "0" );
            const d = String( date.getDate() ).padStart( 2, "0" );
            return `${ y }-${ m }-${ d }`;
        },

        /**
         * Used to give a person's avatar its background, the same for that person on every screen and in every session,
         * and different from the people listed around them.
         * <br/>
         * A theme that defines `--avatar-tone-1` to `--avatar-tone-7` gets one of its own seven tones per person. One
         * that defines none keeps the three-hue gradient every avatar had before, as the fallback of the same value.
         * The gradient's saturated hues were set inline, so no theme could tone them down. That is why the tones are
         * the theme's to define and the choice of tone is the framework's (1.43.0, CA-326).
         * <br/>
         * Seven, because a prime spreads this hash evenly. djb2 multiplies by 33, which is 1 mod 8, so a count of 8 would
         * depend only on the sum of the characters and give every anagram one colour.
         *
         * @method
         * @param {string|number} id
         * @param {string} name
         * @returns {Object} The `--avatar-bg` custom property for an `x-bind:style`.
         * @public
         */
        generateAvatarStyle( id, name ) {
            const seed = String( id ?? "" ) + "\x00" + String( name ?? "" );
            const djb2 = ( s ) => {
                let h = 5381;
                for ( let i = 0; i < s.length; i++ ) {
                    h = ( ( h << 5 ) + h + s.charCodeAt( i ) ) | 0;
                }
                return Math.abs( h );
            };
            const first = djb2( seed + "A" );
            const h0 = first % 360;
            const h1 = djb2( seed + "B" ) % 360;
            const h2 = djb2( seed + "C" ) % 360;
            const gradient = `linear-gradient( 135deg, hsl( ${ h0 }, 70%, 48% ) 0%, hsl( ${ h1 }, 62%, 54% ) 50%, hsl( ${ h2 }, 65%, 44% ) 100% )`;
            const tone = ( first % AVATAR_TONE_COUNT ) + 1;
            return {
                "--avatar-bg": `var( --avatar-tone-${ tone }, ${ gradient } )`
            };
        }

    };
};

/**
 * Returns a configuration object for the sidebar flyout component "component-sidebar-flyout.html".
 * <br/>
 * The component looks up its menu definition from the "tiComponentsConfig" Alpine store using the supplied
 * configuration key. This allows each application to register its own flyout menus via the application
 * configuration response without modifying the framework.
 *
 * @method
 * @param {string} configKey Key into the "tiComponentsConfig" store identifying the flyout configuration to use.
 * @returns {Object}
 * @public
 */
const configureComponentSidebarFlyout = ( configKey ) => {
    const tiToolbox = Alpine.store( "tiToolbox" );
    const TI_EVENT_CLOSE_ALL_FLYOUT = "ti-close-all-flyout";

    /**
     * @typedef {Object} TiSidebarFlyout
     */
    return {
        configKey: configKey || "",
        isOpen: false,

        get config() {
            const store = Alpine.store( "tiComponentsConfig" ) || {};
            return store[ this.configKey ] || defaultSidebarFlyoutConfig;
        },
        get menuTitle() {
            return this.config.menuTitle || "";
        },
        get placement() {
            return this.config.placement || "right-start";
        },
        get side() {
            if ( this.config.side ) return this.config.side;
            return this.placement.split( "-" )[ 0 ] || "right";
        },
        get align() {
            if ( this.config.align ) return this.config.align;
            return this.placement.split( "-" )[ 1 ] || "start";
        },
        get offset() {
            return ( typeof this.config.offset === "number" ) ? this.config.offset : 10;
        },
        get fixed() {
            return ( typeof this.config.fixed === "boolean" ) ? this.config.fixed : true;
        },
        get icon() {
            return this.config.icon || "";
        },
        get buttonConfigs() {
            return Array.isArray( this.config.buttonConfigs ) ? this.config.buttonConfigs : [];
        },

        /**
         * Used to initialize the sidebar flyout component.
         *
         * @method
         * @public
         */
        init() {
            this._reflow = this.reposition.bind( this );
            this._close = this.close.bind( this );
            window.addEventListener( "resize", this._reflow, { passive: true } );
            window.addEventListener( "scroll", this._reflow, { passive: true } );
            window.addEventListener( TI_EVENT_CLOSE_ALL_FLYOUT, this._close );
            // Placed again whenever the panel's size changes, and that includes the moment it appears (CA-408). Alpine's
            // x-show reveals an element on the next animation frame, after the `$nextTick` that `open` positions it in,
            // so that first measurement is of a panel still `display: none`: 0x0, which the clamp to the window cannot
            // hold. The user menu sits at the bottom of the sidebar and opens upward from its button's bottom edge, so it
            // opened below the window with sign-out in it: at 1280x844 112px of its 124px were off the page.
            // A tick later because `init` runs before Alpine has walked into the component, so the panel's ref does
            // not exist yet.
            this.$nextTick( () => {
                if ( typeof ResizeObserver === "function" && this.$refs.flyoutPanel && !this._resizeObserver ) {
                    this._resizeObserver = new ResizeObserver( this._reflow );
                    this._resizeObserver.observe( this.$refs.flyoutPanel );
                }
            } );
        },

        /**
         * Used to destroy the sidebar flyout component.
         *
         * @method
         * @public
         */
        destroy() {
            window.removeEventListener( "resize", this._reflow );
            window.removeEventListener( "scroll", this._reflow );
            window.removeEventListener( TI_EVENT_CLOSE_ALL_FLYOUT, this._close );
            if ( this._resizeObserver ) {
                this._resizeObserver.disconnect();
            }
        },

        /**
         * Used to toggle the sidebar flyout panel.
         *
         * @method
         * @public
         */
        toggle() {
            this.isOpen ? this.close() : this.open();
        },

        /**
         * Used to open the sidebar flyout panel.
         *
         * @method
         * @public
         */
        open() {
            if ( !this.isOpen ) {
                window.dispatchEvent( new CustomEvent( TI_EVENT_CLOSE_ALL_FLYOUT ) );
                this.isOpen = true;
                this.$nextTick( () => {
                    this.setAria();
                    this.reposition();
                    // Without a ResizeObserver nothing places the panel again once x-show reveals it, and this placement
                    // measured it hidden: measured in Chromium at 1280x844, the user menu then opened at y=832 with 12px
                    // showing (CA-408). x-show reveals in a requestAnimationFrame asked for before this tick ran, so a
                    // frame asked for now runs after the reveal, in the same frame.
                    if ( !this._resizeObserver ) {
                        if ( typeof window.requestAnimationFrame === "function" ) {
                            window.requestAnimationFrame( () => this.reposition() );
                        } else {
                            window.setTimeout( () => this.reposition(), 0 );
                        }
                    }
                    // The menu items bind their hx-* attributes via Alpine (x-bind), which HTMX does not pick up on its
                    // initial document scan — so without this the buttons close the flyout but never fire the request.
                    // Processing the panel attaches HTMX behaviour to the now-rendered buttons (idempotent on re-open).
                    if ( window.htmx && this.$refs.flyoutPanel ) {
                        window.htmx.process( this.$refs.flyoutPanel );
                    }
                } );
            }
        },

        /**
         * Used to close the flyout panel.
         *
         * @method
         * @public
         */
        close() {
            if ( this.isOpen ) {
                this.isOpen = false;
                this.$nextTick( () => this.setAria() );
            }
        },

        /**
         * Used to set the ARIA attributes for the flyout button.
         *
         * @method
         * @public
         */
        setAria() {
            if ( !this.$refs.flyoutButton ) return;
            this.$refs.flyoutButton.setAttribute( "aria-expanded", String( this.isOpen ) );
        },

        /**
         * Used to reposition the flyout panel.
         *
         * @method
         * @public
         */
        reposition() {
            if ( !this.isOpen || !this.$refs.flyoutButton || !this.$refs.flyoutPanel ) return;

            const flyoutButton = this.$refs.flyoutButton;
            const flyoutPanel = this.$refs.flyoutPanel;

            const rect = flyoutButton.getBoundingClientRect();
            const scrollX = window.scrollX;
            const scrollY = window.scrollY;

            const pw = flyoutPanel.scrollWidth;
            const ph = flyoutPanel.scrollHeight;

            let top = rect.top + ( this.fixed ? 0 : scrollY );
            let left = rect.left + ( this.fixed ? 0 : scrollX );

            const side = this.side;
            const align = this.align;
            if ( side === "right" ) {
                left = rect.right + ( this.fixed ? 0 : scrollX ) + this.offset;
            } else if ( side === "left" ) {
                left = rect.left + ( this.fixed ? 0 : scrollX ) - pw - this.offset;
            } else if ( side === "bottom" ) {
                top = rect.bottom + ( this.fixed ? 0 : scrollY ) + this.offset;
            } else if ( side === "top" ) {
                top = rect.top + ( this.fixed ? 0 : scrollY ) - ph - this.offset;
            }
            // Alignment for horizontal sides (left/right) adjusts the vertical position:
            if ( side === "left" || side === "right" ) {
                if ( align === "start" ) {
                    top = rect.top + ( this.fixed ? 0 : scrollY );
                } else if ( align === "center" ) {
                    top = rect.top + ( this.fixed ? 0 : scrollY ) + ( rect.height - ph ) / 2;
                } else if ( align === "end" ) {
                    top = rect.bottom + ( this.fixed ? 0 : scrollY ) - ph;
                }
            }
            // Alignment for vertical sides (top/bottom) adjusts the horizontal position:
            else if ( side === "top" || side === "bottom" ) {
                if ( align === "start" ) {
                    left = rect.left + ( this.fixed ? 0 : scrollX );
                } else if ( align === "center" ) {
                    left = rect.left + ( this.fixed ? 0 : scrollX ) + ( rect.width - pw ) / 2;
                } else if ( align === "end" ) {
                    left = rect.right + ( this.fixed ? 0 : scrollX ) - pw;
                }
            }

            // The panel is drawn its own `margin-left` further right than `left`, so the clamp has to hold that too. Beside
            // a desktop sidebar there is room to spare; inside the drawer on a phone the menu overran the window by 12px.
            const marginLeft = parseFloat( window.getComputedStyle( flyoutPanel ).marginLeft ) || 0;
            const box = tiToolbox.getVisibleBox( this.fixed );
            const coords = tiToolbox.clampToBox( left, top, pw + marginLeft, ph, box, 10 );

            flyoutPanel.style.position = this.fixed ? "fixed" : "absolute";
            flyoutPanel.style.top = Math.round( coords.y ) + "px";
            flyoutPanel.style.left = Math.round( coords.x ) + "px";
        }

    };
};

/**
 * Returns a configuration object for the sidebar navigation component.
 * The screen-to-active-key mapping is read at runtime from tiApplication.configuration.sidebarNavMapping,
 * allowing each application to define its own mapping without changing the framework.
 *
 * @method
 * @returns {Object}
 * @public
 */
const configureSidebarNav = () => {
    const tiApplication = Alpine.store( "tiApplication" );

    const getActiveFromScreen = ( screen ) => {
        const mapping = ( tiApplication.configuration && tiApplication.configuration.sidebarNavMapping ) || {};
        return mapping[ screen ] || "";
    };

    const getActiveFromUrl = () => {
        const match = window.location.pathname.match( /^\/app\/([\w-]+)/ );
        return match ? getActiveFromScreen( match[ 1 ] ) : "";
    };

    return {
        active: "",

        init() {
            this.$watch( () => tiApplication.isInitialized, ( isInitialized ) => {
                if ( isInitialized ) {
                    const fromUrl = getActiveFromUrl();
                    if ( fromUrl ) {
                        this.active = fromUrl;
                    }
                }
            } );
            this.$watch( () => tiApplication.currentScreen, ( screen ) => {
                const mapped = getActiveFromScreen( screen );
                if ( mapped ) {
                    this.active = mapped;
                }
            } );
            if ( tiApplication.isInitialized ) {
                const fromUrl = getActiveFromUrl();
                if ( fromUrl ) {
                    this.active = fromUrl;
                }
            }
        },

        navigate( activeKey, screen ) {
            this.active = activeKey;
            tiApplication.openScreen( screen );
        }
    };
};

/**
 * Returns a configuration object for the topbar component "component-topbar.html".
 *
 * @method
 * @returns {Object}
 * @public
 */
const configureComponentTopbar = () => {
    /**
     * @typedef {Object} TiTopbar
     */
    return {

        screenTitle: "",

        // Whether the title is a catalogue label: the screen's own, or one an application set and declared a label. Only
        // then does a picture sent with feedback keep it, since an application's own title may name a person (CA-551).
        titleIsLabel: false,

        init() {
            const tiApplication = Alpine.store( "tiApplication" );
            // The application's name, from its <meta name="application-name">, follows the screen's in the browser
            // tab. Without it every tab read as a bare screen name ("Dashboard"), so a row of tabs never said which
            // application they belonged to. An application that declares no name keeps the bare screen name (CA-326).
            const applicationMeta = document.querySelector( "meta[name=\"application-name\"]" );
            const applicationName = applicationMeta ? String( applicationMeta.getAttribute( "content" ) || "" ).trim() : "";

            const updateTitle = () => {
                const screen = ( tiApplication && tiApplication.currentScreen ) || "";
                const override = ( tiApplication && tiApplication.screenTitleOverride ) || "";
                const title = override || ( screen ? tiApplication.getLabel( `interface.topbar.${ screen }`, "" ) : "" );
                this.screenTitle = title;
                this.titleIsLabel = ( title !== "" && ( override === "" || tiApplication.screenTitleIsLabel === true ) );
                if ( title ) {
                    // A screen whose own title already names the application ("About Competence@Work") keeps it once.
                    document.title = ( applicationName && !title.includes( applicationName ) ) ? `${ title } · ${ applicationName }` : title;
                }
            };

            // If the htmx:afterSwap listener was registered after the initial swap already fired,
            // currentScreen won't be set yet — fall back to reading the URL that hx-push-url already updated:
            if ( tiApplication && !tiApplication.currentScreen ) {
                const match = window.location.pathname.match( /^\/app\/([\w-]+)/ );
                if ( match ) {
                    tiApplication.setCurrentScreen( match[ 1 ] );
                }
            }

            updateTitle();
            this.$watch( () => tiApplication.currentScreen, updateTitle );
            this.$watch( () => tiApplication.screenTitleOverride, updateTitle );
            this.$watch( () => tiApplication.screenTitleIsLabel, updateTitle );
            this.$watch( () => tiApplication.isInitialized, updateTitle );
        }

    };
};

/**
 * Returns a configuration object for the busy indicator component "component-busy-indicator.html" (CA-345).
 * <br/>
 * The hourglass is drawn by the stylesheet, off `ti-busy` on `<html>`. What the component adds is the status line a
 * screen reader announces. The line is written only while the shell is busy, because a live region announces text
 * added to it, not text that was there all along.
 *
 * @method
 * @returns {Object}
 * @public
 */
const configureComponentBusyIndicator = () => {
    /**
     * @typedef {Object} TiBusyIndicator
     */
    return {

        /**
         * Whether the shell is waiting on a request it has been waiting on long enough to say so.
         *
         * @type {boolean}
         * @public
         */
        get busy() {
            return Alpine.store( "tiApplication" ).busy === true;
        }

    };
};

/**
 * The media query below which the sidebar is a drawer (CA-406). The stylesheet's drawer block names the same width,
 * and `test/ti-framework.navigation-drawer.test.js` holds the two together: with the stylesheet drawing a drawer at
 * one width while this script still treated the sidebar as a column, a visitor who had collapsed it would get a drawer
 * of bare icons, and the other way round a column stripped of its collapsed state.
 *
 * @constant
 * @type {string}
 * @private
 */
const NAVIGATION_DRAWER_QUERY = "(max-width: 900px)";

/**
 * What the open drawer covers, made `inert` while it is open (CA-406): `#ti-content-wrapper`, which holds the topbar
 * and the screen in the framework's frame, and `#ti-content` on its own for a frame without that wrapper. The topbar
 * counts as much as the screen. With the screen alone inert, Tab from the drawer's last entry went on to the menu
 * button, which the drawer itself covers (measured in Chromium at 390x844).
 *
 * @constant
 * @type {string[]}
 * @private
 */
const NAVIGATION_COVERED_IDS = [ "ti-content-wrapper", "ti-content" ];

/**
 * Makes everything the open drawer covers inert, or usable again (CA-406). See {@link NAVIGATION_COVERED_IDS}.
 *
 * @method
 * @param {boolean} inert
 * @private
 */
const setNavigationCoveredInert = ( inert ) => {
    NAVIGATION_COVERED_IDS.forEach( ( id ) => {
        const element = document.getElementById( id );
        if ( element ) {
            element.inert = inert;
        }
    } );
};

/**
 * Returns a configuration object for the navigation toggle component "component-navigation-toggle.html" (CA-406).
 * <br/>
 * The toggle opens and closes the sidebar drawer, and it is also what tells the shell whether there is a drawer at
 * all: it watches the breakpoint, and the stylesheet makes the sidebar a drawer only in a page that holds it. The
 * drawer closes on Escape, on its scrim and on any navigation into the screen; the last of those is the HTMX listener
 * below and `openScreen`, so it holds for a screen opened from anywhere.
 *
 * @method
 * @returns {Object}
 * @public
 */
const configureComponentNavigationToggle = () => {
    const tiApplication = Alpine.store( "tiApplication" );

    /**
     * @typedef {Object} TiNavigationToggle
     */
    return {

        /**
         * Whether the drawer is open, for the button's `aria-expanded`.
         *
         * @type {boolean}
         * @public
         */
        get open() {
            return tiApplication.navigationOpen === true;
        },

        /**
         * Used to initialize the navigation toggle component.
         *
         * @method
         * @public
         */
        init() {
            const query = ( typeof window.matchMedia === "function" ) ? window.matchMedia( NAVIGATION_DRAWER_QUERY ) : null;
            const follow = () => {
                tiApplication.navigationDrawer = Boolean( query && query.matches );
                if ( !tiApplication.navigationDrawer ) {
                    // A window widened past the breakpoint with the drawer open would otherwise keep the screen inert
                    // under a sidebar that is a column again.
                    tiApplication.closeNavigation();
                }
            };
            follow();
            if ( query && typeof query.addEventListener === "function" ) {
                query.addEventListener( "change", follow );
            }
            document.addEventListener( "keydown", ( event ) => {
                if ( event.key === "Escape" && tiApplication.navigationOpen ) {
                    this.dismiss();
                }
            } );
        },

        /**
         * Used to open the drawer, or close it when it is open. Opening moves the focus into it: to the screen's own
         * entry when the sidebar marks one active, otherwise to its first.
         *
         * @method
         * @public
         */
        toggle() {
            if ( tiApplication.navigationOpen ) {
                tiApplication.closeNavigation();
                return;
            }
            tiApplication.openNavigation();
            if ( tiApplication.navigationOpen ) {
                const entry = document.querySelector( ".ti-sidebar .ti-sidebar-item.active" ) ||
                    document.querySelector( ".ti-sidebar a[href], .ti-sidebar button:not([disabled])" );
                if ( entry && typeof entry.focus === "function" ) {
                    entry.focus();
                }
            }
        },

        /**
         * Used to close the drawer without navigating (Escape, the scrim). The focus returns to the toggle, since the
         * entry that held it is hidden with the drawer.
         *
         * @method
         * @public
         */
        dismiss() {
            tiApplication.closeNavigation();
            if ( this.$refs.toggle && typeof this.$refs.toggle.focus === "function" ) {
                this.$refs.toggle.focus();
            }
        }

    };
};

/**
 * Returns a configuration object for the notification component "component-notification-bar.html".
 *
 * @method
 * @returns {Object}
 * @public
 */
const configureComponentNotificationBar = () => {
    /**
     * @typedef {Object} TiNotificationBar
     */
    return {
        notifications: [],
        timers: {},

        /**
         * Used to add a notification to the notification bar.
         *
         * @method
         * @param {Object} notification
         * @public
         */
        add( notification ) {
            if ( notification && notification.id ) {
                this.remove( notification.id );
                this.notifications.push( notification );
                if ( typeof notification.timeout === "number" && notification.timeout > 0 ) {
                    this.timers[ notification.id ] = setTimeout( () => this.remove( notification.id ), notification.timeout );
                }
            }
        },

        /**
         * Used to remove a notification by its ID.
         *
         * @method
         * @param {string} id
         * @public
         */
        remove( id ) {
            if ( id ) {
                this.notifications = this.notifications.filter( notification => notification.id !== id );
                if ( this.timers[ id ] ) {
                    clearTimeout( this.timers[ id ] );
                    delete this.timers[ id ];
                }
            }
        },

        /**
         * Used to clear all notifications.
         *
         * @method
         * @public
         */
        destroy() {
            Object.keys( this.timers ).forEach( ( id ) => clearTimeout( this.timers[ id ] ) );
            this.timers = {};
            this.notifications = [];
        }

    };
};

/**
 * Returns a configuration object for the tooltip component "component-tooltip.html".
 *
 * @method
 * @returns {Object}
 * @public
 */
const configureComponentTooltip = () => {
    /**
     * @typedef {Object} TiTooltip
     */
    return {
        isVisible: false,
        text: "This is a default tooltip. To change that, define a 'x-bind:data-ti-tooltip' attribute in the target element to set the tooltip text.",

        /**
         * Used to get the tooltip message from the target element.
         *
         * @method
         * @param {HTMLElement} target
         * @returns {string}
         * @public
         */
        getTooltipMessage( target ) {
            if ( !target || typeof target.closest !== "function" ) return "";
            const selector = "[data-ti-tooltip], [data-tooltip]";
            const element = target.closest( selector );
            if ( !element || !this.$el.contains( element ) ) return "";
            return element.getAttribute( "data-ti-tooltip" ) || element.getAttribute( "data-tooltip" ) || "";
        },

        /**
         * Used to handle mouse enter events on the target element.
         *
         * @method
         * @param {MouseEvent} event
         * @public
         */
        handleEnter( event ) {
            const message = this.getTooltipMessage( event?.target );
            if ( message ) {
                this.showTooltip( message );
            }
        },

        /**
         * Used to handle mouse leave events on the target element.
         *
         * @method
         * @param {MouseEvent} event
         * @public
         */
        handleLeave( event ) {
            const related = event?.relatedTarget;
            if ( related && this.$el.contains( related ) ) return;
            this.hideTooltip();
        },

        /**
         * Used to show the tooltip.
         *
         * @method
         * @param {string} message
         * @public
         */
        showTooltip( message ) {
            this.text = message;
            this.isVisible = true;
        },

        /**
         * Used to hide the tooltip.
         *
         * @method
         * @public
         */
        hideTooltip() {
            this.isVisible = false;
        }

    };
}

/**
 * Returns a configuration object for the application management instance.
 *
 * @method
 * @returns {Object}
 * @public
 */
const configureApplication = () => {
    const STORAGE_KEY_COLLAPSED = "ti-sidebar-collapsed";
    const STORAGE_KEY_THEME = "ti-theme";
    // Per tab, until the link is spent or declined: see `_stashSignInLink`.
    const STORAGE_KEY_SIGN_IN_LINK = "ti-sign-in-link";
    const DEFAULT_THEME = "daylight";

    /**
     * How long a request may be outstanding before the shell shows that it is waiting on it (CA-345). A request that
     * answers inside it shows nothing, so neither the cursor nor the hourglass flickers on every click. A container
     * scaled to zero takes a second or two to answer the first request after it wakes, which is the wait this is for.
     *
     * @constant
     * @type {number}
     * @private
     */
    const BUSY_DELAY_MS = 400;

    /**
     * Requests counted by `_beginRequest` and not yet settled, and the timer that turns the busy state on once the
     * oldest of them has waited {@link BUSY_DELAY_MS}. Kept out of the store so that neither is reactive.
     */
    let pendingRequests = 0;
    let busyTimer = null;

    const tiToolbox = Alpine.store( "tiToolbox" );

    /**
     * Marker returned by {@link resolveLabel} when a key is not present in the labels object. A dedicated sentinel
     * rather than `undefined` so that backtracking can never be confused by a stored value.
     *
     * @constant
     * @private
     */
    const LABEL_NOT_FOUND = Object.freeze( {} );

    /**
     * Resolves a label key against a labels object, trying the longest literal key that matches at each level and
     * shortening on a miss.
     * <br/>
     * A labels catalogue is not always purely nested: a group may store flat keys that themselves contain a dot,
     * because the key IS a dotted path in the application's own domain — competence keys its audit-log field labels
     * by employee field path ("personal.workSite", "career.roleFamily"). Descending exactly one object level per dot
     * can never reach those, and the miss is silent: the caller's fallback renders instead. So each level tries the
     * whole remaining key first, shortens a segment at a time, and backtracks whenever a matched branch turns out
     * not to hold the rest of the key.
     *
     * @method
     * @param {Object} labels
     * @param {String[]} keys
     * @returns {String|Object} The resolved value, or {@link LABEL_NOT_FOUND}.
     * @private
     */
    const resolveLabel = ( labels, keys ) => {
        if ( !labels || typeof labels !== "object" || keys.length === 0 ) {
            return LABEL_NOT_FOUND;
        }
        for ( let length = keys.length; length > 0; length-- ) {
            const key = keys.slice( 0, length ).join( "." );
            if ( !Object.prototype.hasOwnProperty.call( labels, key ) ) {
                continue;
            }
            const value = labels[ key ];
            const remainder = keys.slice( length );
            if ( typeof value === "string" ) {
                if ( remainder.length === 0 ) {
                    return value;
                }
            } else if ( value && typeof value === "object" ) {
                const resolved = resolveLabel( value, remainder );
                if ( resolved !== LABEL_NOT_FOUND ) {
                    return resolved;
                }
            }
        }
        return LABEL_NOT_FOUND;
    };

    /**
     * Used to extract a label from a nested labels object.
     *
     * @method
     * @param {Object} labels
     * @param {String[]} keys
     * @param {String} fallback
     * @returns {String}
     * @private
     */
    const extractLabel = ( labels, keys, fallback ) => {
        const resolved = resolveLabel( labels, keys );
        return ( typeof resolved === "string" ) ? resolved : fallback;
    };

    /**
     * @typedef {Object} TiApplication
     */
    return {
        isInitialized: false,
        user: null,
        configuration: {},
        currentScreen: "",
        topbarSubtitle: "",
        screenTitleOverride: "",
        // Whether the override is a catalogue label, which a picture sent with feedback may keep (CA-551).
        screenTitleIsLabel: false,
        topbarPrimaryCta: null,
        notificationIDCounter: 1,
        requestControllers: new Map(),
        collapsed: false,
        theme: DEFAULT_THEME,
        busy: false,

        /**
         * Whether the sidebar is a drawer rather than a column: the screen is narrower than the drawer's breakpoint and
         * the topbar carries the navigation toggle (CA-406). Set by that toggle, the one part of the shell that knows
         * both.
         *
         * @type {boolean}
         * @public
         */
        navigationDrawer: false,

        /**
         * Whether the drawer is open. Always false while {@link navigationDrawer} is.
         *
         * @type {boolean}
         * @public
         */
        navigationOpen: false,
        // A sign-in link's token, taken out of the address bar as the shell starts (CA-537); see `takeSignInLink`.
        signInLink: null,

        /**
         * Used to initialize the web application.
         */
        init() {
            // First, before any frame can push another address over the one holding the token.
            this._stashSignInLink();
            // A link opened in a tab already showing the page changes only the fragment, which loads nothing: load the
            // page again, so it starts with the link as it would in a new tab.
            window.addEventListener( "hashchange", () => {
                if ( this._signInLinkInAddress() ) {
                    window.location.reload();
                }
            } );

            document.addEventListener( "ti:error", ( event ) => {
                this.notify( this.formatException( event.detail ) );
            } );

            try {
                const savedCollapsed = localStorage.getItem( STORAGE_KEY_COLLAPSED );
                if ( savedCollapsed !== null ) this.collapsed = savedCollapsed === "true";

                const savedTheme = localStorage.getItem( STORAGE_KEY_THEME );
                if ( savedTheme ) this.theme = savedTheme;
            } catch {
                // localStorage may be unavailable (private browsing, security policy).
            }
            this._applyTheme( this.theme );

            // Use application settings to configure the application at load-time:
            this.sendRequest( "/app/config" ).then( ( result ) => {
                const configuration = result?.data || {};
                return this._loadLabels( configuration ).then( ( labels ) => {
                    configuration.labels = labels;
                    return configuration;
                } );
            } ).then( ( configuration ) => {
                this.configuration = configuration;
                this._mergeComponentsConfig( this.configuration?.componentsConfig );
                return ( this.configuration?.auth?.isAuthenticated ) ? this.sendRequest( "/me" ) : {};
            } ).then( ( result ) => {
                this.user = result?.data?.user || null;
                this.isInitialized = true;
                if ( this.user ) {
                    this._explainSignInLink();
                    this.forgetSignInLink();
                }
            } ).catch( ( error ) => {
                if ( error?.name === "AbortError" || error?.isAborted ) {
                    return;
                }

                this.user = null;
                this.isInitialized = false;
                const formatted = this.formatException( error );
                this.notify( { message: this.getLabel( "error.application.init-failed" ) + " " + formatted.message, details: formatted.details } );
            } );
        },

        /**
         * Takes a sign-in link's token out of the address bar and keeps it here, for the sign-in page to take with
         * {@link takeSignInLink} (CA-537). It runs as the shell starts, before anything can push another address: the
         * application's first screen pushes its own, and a token still in the address then stayed in the history behind
         * it for as long as the link worked.
         *
         * @method
         * @private
         */
        _stashSignInLink() {
            const token = this._signInLinkInAddress();
            if ( !token ) {
                return;
            }
            this.signInLink = token;
            if ( window.history && typeof window.history.replaceState === "function" ) {
                window.history.replaceState( null, "", window.location.pathname + window.location.search );
            }
            // Kept for this tab too, until the link is spent or declined: a reload of the Continue step, or the sign-in
            // page's own language switch, starts the page again with nothing in the address, and the link that still
            // works would be lost without a word.
            try {
                sessionStorage.setItem( STORAGE_KEY_SIGN_IN_LINK, token );
            } catch {
                // sessionStorage may be unavailable (private browsing, security policy): the link lasts the page.
            }
        },

        /**
         * The token in the address bar's `#email-link=`, or `null`.
         *
         * @method
         * @returns {string|null}
         * @private
         */
        _signInLinkInAddress() {
            const hash = String( window.location.hash || "" ).replace( /^#/, "" );
            return ( hash ? new URLSearchParams( hash ).get( "email-link" ) : null ) || null;
        },

        /**
         * The sign-in link's token the page was opened with, or that this tab kept from an earlier load, until
         * {@link forgetSignInLink}: the sign-in page's e-mail link block takes it.
         *
         * @method
         * @returns {string|null}
         * @public
         */
        takeSignInLink() {
            // The shell's init has normally done this already; again here, it only finds nothing to take.
            this._stashSignInLink();
            let token = this.signInLink;
            this.signInLink = null;
            if ( !token ) {
                try {
                    token = sessionStorage.getItem( STORAGE_KEY_SIGN_IN_LINK );
                } catch {
                    token = null;
                }
            }
            return token || null;
        },

        /**
         * Drops the sign-in link's token this tab kept: it was posted, declined, or can no longer sign anybody in.
         *
         * @method
         * @public
         */
        forgetSignInLink() {
            this.signInLink = null;
            try {
                sessionStorage.removeItem( STORAGE_KEY_SIGN_IN_LINK );
            } catch {
                // Nothing was kept.
            }
        },

        /**
         * Tells a person who opened a sign-in link in a browser that is already signed in how to use it. `/` shows the
         * application then, not the sign-in page, so nothing takes the link, and without a word they were left looking
         * at whoever was signed in.
         *
         * @method
         * @private
         */
        _explainSignInLink() {
            if ( !this.signInLink ) {
                return;
            }
            this.signInLink = null;
            this._notifyWhenShown( this.getLabel( "interface.default.login.email-link-signed-in-already", "This browser is already signed in. To use the sign-in link, sign out, then open the link from your e-mail again." ) );
        },

        /**
         * Notifies once the notification bar is on the page. It arrives with the shell's first frame, which may land after
         * the answer that prompted the message, and {@link notify} drops a message with no bar to put it in.
         *
         * @method
         * @param {string} message
         * @private
         */
        _notifyWhenShown( message ) {
            if ( document.querySelector( "#ti-notifications" ) ) {
                this.notify( message );
                return;
            }
            let delivered = false;
            const deliver = () => {
                if ( delivered || !document.querySelector( "#ti-notifications" ) ) {
                    return;
                }
                delivered = true;
                if ( typeof document.removeEventListener === "function" ) {
                    document.removeEventListener( "htmx:afterSettle", deliver );
                }
                // After Alpine has started the bar's component, which it does as the swapped markup settles.
                setTimeout( () => this.notify( message ), 0 );
            };
            document.addEventListener( "htmx:afterSettle", deliver );
        },

        /**
         * Resolves the label catalogue a configuration points to.
         * <br/>
         * `/app/config` carries the catalogue's address, not the catalogue: `labelsBundle.url` ends in the hash of its
         * bytes and is served `immutable`, so after the first load of a release the browser answers this from its own
         * cache without a request. It is fetched with the browser's default cache mode on purpose - `sendRequest` asks
         * for `no-store`, which would download the catalogue on every page load and undo the whole arrangement. A
         * configuration that still carries `labels` itself (an application override, an older server) is used as-is.
         *
         * @method
         * @param {Object} configuration The `/app/config` payload.
         * @returns {Promise<Object>} The label tree.
         * @private
         */
        _loadLabels( configuration ) {
            if ( configuration && configuration.labels && typeof configuration.labels === "object" ) {
                return Promise.resolve( configuration.labels );
            }
            const url = configuration && configuration.labelsBundle && configuration.labelsBundle.url;
            if ( typeof url !== "string" || url.length === 0 ) {
                return Promise.resolve( {} );
            }
            return fetch( url, {
                method: "GET",
                headers: { "Accept": "application/json" },
                credentials: "same-origin"
            } ).then( ( response ) => {
                if ( !response.ok ) {
                    return Promise.reject( { isSuccessful: false, message: response.statusText } );
                }
                return response.json();
            } );
        },

        /**
         * Used to send a request to the application server.
         *
         * @method
         * @param {string} url
         * @param {"POST"|"GET"|"PUT"|"DELETE"} [method="GET"]
         * @param {Object} [data=null]
         * @returns {Promise<Object>}
         * @public
         */
        sendRequest( url, method = "GET", data = null ) {
            return new Promise( ( resolve, reject ) => {
                const xsrf = tiToolbox.getCookie( "ti-xsrf-token" ) || "";
                const normalizedMethod = String( method || "GET" ).toUpperCase();
                const requestKey = `${ normalizedMethod } ${ String( url || "" ).split( "?" )[ 0 ] }`;
                const abortController = ( typeof AbortController === "function" ) ? new AbortController() : null;

                if ( abortController && normalizedMethod === "GET" ) {
                    const existing = this.requestControllers.get( requestKey );
                    if ( existing ) {
                        existing.abort();
                    }
                    this.requestControllers.set( requestKey, abortController );
                }

                const cleanup = () => {
                    if ( !abortController || normalizedMethod !== "GET" ) return;
                    const active = this.requestControllers.get( requestKey );
                    if ( active === abortController ) {
                        this.requestControllers.delete( requestKey );
                    }
                };

                const options = {
                    method: normalizedMethod,
                    headers: {
                        "Accept": "application/json",
                        "x-xsrf-token": xsrf
                    },
                    credentials: "same-origin",
                    cache: "no-store",
                    signal: abortController?.signal,
                };

                if ( data ) {
                    options.headers[ "Content-Type" ] = "application/json";
                    options.body = JSON.stringify( data );
                }

                this._beginRequest();
                fetch( url, options ).then( ( response ) => {
                    const contentType = ( response.headers.get( "content-type" ) || "" ).toLowerCase();
                    if ( contentType.includes( "application/json" ) ) {
                        return response.json().then( ( body ) => ( {
                            isSuccessful: response.ok,
                            ...body
                        } ) );
                    } else {
                        return { isSuccessful: response.ok, message: response.statusText };
                    }
                } ).then( ( result ) => {
                    if ( !result || result.isSuccessful === false ) {
                        reject( result || {} );
                    } else {
                        resolve( result );
                    }
                } ).catch( ( error ) => {
                    reject( error );
                } ).finally( () => {
                    cleanup();
                    this._endRequest();
                } );
            } );
        },

        /**
         * Counts a request the user is waiting on, from the moment it is sent (CA-345). `busy` turns on once a request
         * has been outstanding for {@link BUSY_DELAY_MS}, and stays on until the last outstanding one settles. Pair
         * every call with exactly one {@link _endRequest}: an unpaired begin leaves the shell busy for good.
         *
         * @method
         * @private
         */
        _beginRequest() {
            pendingRequests += 1;
            if ( busyTimer === null && !this.busy ) {
                busyTimer = setTimeout( () => {
                    busyTimer = null;
                    if ( pendingRequests > 0 ) {
                        this._setBusy( true );
                    }
                }, BUSY_DELAY_MS );
            }
        },

        /**
         * Settles a request counted by {@link _beginRequest}. The last one to settle ends the busy state, and cancels
         * a delay still running, so a request that answers in time never shows at all.
         *
         * @method
         * @private
         */
        _endRequest() {
            pendingRequests = Math.max( 0, pendingRequests - 1 );
            if ( pendingRequests === 0 ) {
                if ( busyTimer !== null ) {
                    clearTimeout( busyTimer );
                    busyTimer = null;
                }
                this._setBusy( false );
            }
        },

        /**
         * Sets the busy state, and mirrors it as `ti-busy` on `<html>`. The stylesheet keys the progress cursor and the
         * hourglass off that class: the cursor has to change over every element, the button just clicked above all,
         * and no binding inside a component reaches that far.
         *
         * @method
         * @param {boolean} busy
         * @private
         */
        _setBusy( busy ) {
            if ( this.busy !== busy ) {
                this.busy = busy;
                document.documentElement.classList.toggle( "ti-busy", busy );
            }
        },

        /**
         * Redirect the user to the specified screen.
         *
         * @method
         * @param {string} screen
         * @public
         */
        openScreen( screen ) {
            // Read before closing: whether the sidebar is a drawer is the layout's, not whether it is open.
            const drawer = this.navigationDrawer === true;
            // A screen opened from the drawer replaces the page under it, so the drawer has done its job (CA-406).
            this.closeNavigation();
            const basePath = ( screen || "" ).split( "?" )[ 0 ];
            const trail = Alpine.store( "tiScreenTrail" );
            if ( basePath === "send-feedback" && window.htmx && trail && trail.wantsPicture() ) {
                // The picture first: below, the new screen is named and its URL pushed before its request starts, and
                // the screen drawn would be half Send Feedback's (CA-544, the review pass).
                trail.holdFor( () => this.openScreenNow( screen ), drawer );
                return;
            }
            this.openScreenNow( screen );
        },

        /**
         * Opens a screen at once: {@link openScreen} past the picture of the screen being left.
         *
         * @method
         * @param {string} screen
         * @private
         */
        openScreenNow( screen ) {
            const [ basePath, ...queryParts ] = ( screen || "" ).split( "?" );
            const query = queryParts.length ? "?" + queryParts.join( "?" ) : "";
            if ( !basePath || !/^[\w-]+$/.test( basePath ) || !window.htmx ) {
                window.location.href = "/";
            } else {
                const screenUrl = "/app/" + basePath + query;
                // Before the URL, so that nothing still on its way can land after it (CA-463). A screen opened before
                // the landing Dashboard arrived started under `/app/dashboard`, which that fragment pushes; and HTMX
                // queues a second `openScreen` behind the first, which then started under the second's URL.
                supersedeContentRequests( null );
                // Push the URL before the HTMX swap so that any Alpine component initialized
                // during the swap (via MutationObserver microtask) already sees the correct URL.
                window.history.pushState( null, "", screenUrl );
                this.screenTitleOverride = "";
                this.screenTitleIsLabel = false;
                this.currentScreen = basePath;
                const answer = window.htmx.ajax( "get", screenUrl, { target: "#ti-content", swap: "innerHTML" } );
                // HTMX sends the request before `ajax` returns, so the newest request is now this screen's own.
                const request = newestContentRequest;
                answer.catch( () => {
                    // HTMX rejects a request it aborted as it does one that failed, and a newer screen aborts this
                    // one's (CA-463). Leaving for the start page then would throw away the screen opened since.
                    if ( newestContentRequest === request ) {
                        window.location.href = "/";
                    }
                } );
            }
        },

        /**
         * Used to update the current screen name and push the URL to history.
         *
         * @method
         * @param {string} screen
         * @public
         */
        setCurrentScreen( screen ) {
            if ( screen ) {
                this.currentScreen = screen;
                this.topbarSubtitle = "";
                this.screenTitleOverride = "";
                this.screenTitleIsLabel = false;
                this.topbarPrimaryCta = null;
            }
        },

        /**
         * Used to override the topbar/document title for the current screen, replacing the default
         * `interface.topbar.<screen>` label. Pass an empty string to clear it and fall back to the label.
         * Automatically cleared on screen navigation.
         * <br/>
         * A picture sent with feedback blanks such a title, since it may name a person ("Evaluation of Jane Doe"),
         * unless `options.isLabel` says it is a catalogue label, the same for everyone (CA-551).
         *
         * @method
         * @param {string} title
         * @param {{isLabel: boolean}} [options]
         * @public
         */
        setScreenTitle( title, options = {} ) {
            this.screenTitleOverride = String( title || "" ).trim();
            this.screenTitleIsLabel = ( options && options.isLabel === true );
        },

        /**
         * Used to set a per-screen subtitle in the topbar, overriding the default cycle name.
         * Automatically cleared on screen navigation.
         *
         * @method
         * @param {string} subtitle
         * @public
         */
        setTopbarSubtitle( subtitle ) {
            this.topbarSubtitle = String( subtitle || "" ).trim();
        },

        /**
         * Used to register a primary call-to-action button in the topbar for the current screen. The CTA is
         * automatically cleared on screen navigation so each screen owns its own slot. Pass {@link null} to remove
         * the CTA without leaving the screen.
         *
         * @typedef {Object} TiTopbarPrimaryCta
         * @property {string} labelKey Localization key for the button text.
         * @property {string} [icon] Optional icon class name (e.g. "plus", "send"); rendered as a leading glyph.
         * @property {string} [tone] Button tone class — "primary" (default), "danger", "ghost".
         * @property {Function} handler Click handler invoked when the button is activated.
         * @property {boolean} [disabled] Optional disabled flag.
         *
         * @method
         * @param {TiTopbarPrimaryCta|null} cta
         * @public
         */
        setTopbarPrimaryCta( cta ) {
            this.topbarPrimaryCta = ( cta && typeof cta === "object" ) ? cta : null;
        },

        /**
         * Used to mutate just the disabled flag of the active topbar CTA without re-registering the full object.
         * Useful when validation state changes while the screen is open (e.g. cycle setup becoming lockable).
         *
         * @method
         * @param {boolean} disabled
         * @public
         */
        setTopbarPrimaryCtaDisabled( disabled ) {
            if ( this.topbarPrimaryCta ) {
                this.topbarPrimaryCta = { ...this.topbarPrimaryCta, disabled: disabled === true };
            }
        },

        /**
         * Used to format an exception into a notification payload: a generic localized `message` plus optional, more
         * specific `details`. The returned object stringifies to its `message`, so existing string usages
         * (concatenation, `x-text`) keep working, while {@link notify} can surface the `details` on a second line.
         *
         * @method
         * @param {Object} error
         * @returns {{message: string, details: string, toString: function(): string}}
         * @public
         */
        formatException( error ) {
            const exception = error && error.exception;
            const message = ( error && error.message ) || this.getLabel( exception && exception.label );
            const rawDetails = exception && exception.data && exception.data.details;
            // Resolve the details as a label when it is a known label key; otherwise show the raw text (using it as its
            // own fallback so dynamic, non-localized messages pass through unchanged).
            const details = rawDetails ? this.getLabel( rawDetails, rawDetails ) : "";
            return {
                message: message, details: details, toString() {
                    return this.message;
                }
            };
        },

        /**
         * Used to display a notification in the notification bar. Accepts either a plain message string or a payload
         * object `{ message, details }` (e.g. the result of {@link formatException}); the optional `details` render on
         * a smaller second line.
         *
         * @method
         * @param {string|{message: string, details?: string}} message
         * @param {number} [timeout=6000]
         * @public
         */
        notify( message, timeout = 6000 ) {
            const notificationBar = document.querySelector( "#ti-notifications" );
            if ( notificationBar ) {
                const payload = ( message && typeof message === "object" ) ? message : { message: message };
                Alpine.$data( notificationBar ).add( {
                    id: this.notificationIDCounter++,
                    message: payload.message || this.getLabel( "error.application.unexpected" ),
                    details: payload.details || "",
                    timeout: timeout
                } );
            }
        },

        /**
         * Used to extract a label from the application configuration.
         *
         * @method
         * @param {string} label
         * @param {string} fallback
         * @returns {string}
         * @public
         */
        getLabel( label, fallback = "LABEL NOT FOUND" ) {
            if ( !label ) {
                return fallback;
            } else {
                return extractLabel( this.configuration.labels || {}, label.split( "." ).filter( Boolean ), fallback );
            }
        },

        /**
         * Returns true when the current session user holds the given role code. Safe to call before the session has
         * loaded (returns false). Provided as a helper because the Alpine CSP evaluator does not expose `Array`, so
         * `Array.isArray( ... )` cannot be written inline in templates.
         *
         * @method
         * @param {number|string} roleCode
         * @returns {boolean}
         * @public
         */
        hasRole( roleCode ) {
            const roles = this.user && this.user.roles;
            if ( !roles || typeof roles.indexOf !== "function" ) {
                return false;
            }
            return roles.indexOf( roleCode ) >= 0;
        },

        /**
         * Toggle the sidebar between expanded and collapsed states.
         *
         * @method
         * @public
         */
        toggleCollapse() {
            this.collapsed = !this.collapsed;
            try {
                localStorage.setItem( STORAGE_KEY_COLLAPSED, String( this.collapsed ) );
            } catch { /* ignore */
            }
        },

        /**
         * Opens the sidebar drawer over the screen (CA-406). Does nothing while the sidebar is a column.
         * <br/>
         * The state is mirrored as `ti-navigation-open` on `<html>`, which is what the stylesheet draws the drawer and
         * its scrim from. That keeps the drawer working in an application whose own shell frame binds none of this.
         * The topbar and the screen under the drawer are made `inert` while it is open ({@link NAVIGATION_COVERED_IDS}),
         * so neither a keyboard nor a screen reader can wander into the page the scrim covers.
         *
         * @method
         * @public
         */
        openNavigation() {
            if ( !this.navigationDrawer || this.navigationOpen ) {
                return;
            }
            this.navigationOpen = true;
            document.documentElement.classList.add( "ti-navigation-open" );
            setNavigationCoveredInert( true );
        },

        /**
         * Closes the sidebar drawer, if it is open (CA-406). When the focus was in the drawer, it moves to the menu
         * button.
         *
         * @method
         * @public
         */
        closeNavigation() {
            if ( !this.navigationOpen ) {
                return;
            }
            this.navigationOpen = false;
            document.documentElement.classList.remove( "ti-navigation-open" );
            setNavigationCoveredInert( false );
            // A screen chosen from the drawer hides the entry that held the focus, and the browser drops the focus to
            // <body>: measured in Chromium, a keyboard user who opened a screen from the drawer was left there. The menu
            // button takes it instead, the control that opens the drawer again, as Escape and the scrim already give
            // it. Not when the window has widened past the breakpoint (`navigationDrawer` is false by then): the
            // sidebar is a visible column again, its entry keeps the focus, and the button is hidden.
            const sidebar = document.querySelector( ".ti-sidebar" );
            const toggle = document.querySelector( ".ti-navigation-toggle" );
            const focused = document.activeElement;
            if ( this.navigationDrawer && sidebar && toggle && focused && sidebar.contains( focused ) && typeof toggle.focus === "function" ) {
                toggle.focus();
            }
        },

        /**
         * Toggle between daylight and glass themes.
         *
         * @method
         * @public
         */
        toggleTheme() {
            this.theme = ( this.theme === "daylight" ) ? "glass" : "daylight";
            this._applyTheme( this.theme );
            try {
                localStorage.setItem( STORAGE_KEY_THEME, this.theme );
            } catch { /* ignore */
            }
        },

        /**
         * Apply a theme by setting the data-theme attribute on <html>.
         *
         * @method
         * @param {string} theme
         * @private
         */
        _applyTheme( theme ) {
            document.documentElement.dataset.theme = theme;
        },

        /**
         * Merges app-supplied component configurations into the "tiComponentsConfig" Alpine store.
         * Each entry is deep-merged on top of the framework's default flyout config, so apps only need
         * to supply the differences.
         *
         * @method
         * @param {Object} [componentsConfig]
         * @private
         */
        _mergeComponentsConfig( componentsConfig ) {
            if ( !componentsConfig || typeof componentsConfig !== "object" ) {
                return;
            }
            const store = Alpine.store( "tiComponentsConfig" );
            Object.keys( componentsConfig ).forEach( ( key ) => {
                store[ key ] = tiToolbox.deepMerge( defaultSidebarFlyoutConfig, componentsConfig[ key ] || {} );
            } );
        }

    };
};

/**
 * Returns a callback function for the Alpine.js "text-label" directive.
 * This directive can be used to localize the text content of an element or its attributes.
 *
 * Usage instructions:
 * - To localize text content:
 *   `<span x-text-label="translation.key">Fallback Text</span>`
 * - To localize an element attribute (e.g., aria-label, placeholder, title):
 *   `<button x-text-label:aria-label="translation.key" aria-label="Fallback Text">...</button>`
 *
 * @method
 * @returns {Function}
 * @public
 */
const configureDirectiveTextLabel = () => {
    return ( element, { value, expression }, { effect } ) => {
        const targetAttribute = value;
        const fallback = targetAttribute ? ( element.getAttribute( targetAttribute ) || "" ) : ( element.textContent || "" );

        effect( () => {
            const tiApplication = Alpine.store( "tiApplication" );
            if ( !tiApplication || typeof tiApplication.getLabel !== "function" ) {
                return;
            }
            let path = ( expression || "" ).trim();
            if (
                ( path.startsWith( "'" ) && path.endsWith( "'" ) ) ||
                ( path.startsWith( "\"" ) && path.endsWith( "\"" ) )
            ) {
                path = path.slice( 1, -1 );
            }
            const translatedText = tiApplication.getLabel( path, fallback );
            if ( targetAttribute ) {
                element.setAttribute( targetAttribute, translatedText );
            } else {
                element.textContent = translatedText;
            }
        } );
    };
};

/**
 * Returns a callback for the Alpine.js "ti-chart" directive. Renders a themeable SVG chart from a
 * reactive spec property path into the host <figure class="ti-chart"> element.
 *
 * Usage (CSP-legal — the expression is a bare reactive property path or a registered method call):
 *   <figure class="ti-chart" x-ti-chart="coverageSpec"
 *           role="img" x-bind:aria-label="coverageSpec.a11yLabel"></figure>
 *
 * The geometry/format math and the SVG assembly live in ti-charts.js (window.TiCharts); this
 * directive only wires the reactive spec to TiCharts.renderChart.
 *
 * @method
 * @returns {Function}
 * @public
 */
const configureDirectiveTiChart = () => {
    return ( element, { expression }, { effect, evaluateLater } ) => {
        const getSpec = evaluateLater( expression );
        effect( () => {
            getSpec( ( spec ) => {
                if ( typeof window !== "undefined" && window.TiCharts && typeof window.TiCharts.renderChart === "function" ) {
                    window.TiCharts.renderChart( element, spec );
                }
            } );
        } );
    };
};

/**
 * Perform a one-time configuration of the HTMX framework.
 */
document.addEventListener( "htmx:configRequest", ( event ) => {
    const tiToolbox = Alpine.store( "tiToolbox" );
    event.detail.headers[ 'x-xsrf-token' ] = tiToolbox?.getCookie( "ti-xsrf-token" ) || "";
    // Reuse the existing nonce from the active document:
    const styleNonce = ( htmx?.config?.inlineStyleNonce ) || "";
    const scriptNonce = ( htmx?.config?.inlineScriptNonce ) || "";
    event.detail.headers[ 'x-csp-nonce' ] = styleNonce || scriptNonce || "";
} );

/**
 * Add a custom event listener to the HTMX framework.
 */
document.addEventListener( "htmx:afterSwap", ( event ) => {
    const target = event.detail.target;
    if ( target.id !== "ti-content" && target.tagName !== "TI-NESTED-FRAME-PLACEHOLDER" ) return;
    const path = ( event.detail.pathInfo && event.detail.pathInfo.requestPath ) || "";
    const match = path.match( /^\/app\/([\w-]+)/ );
    if ( match ) {
        const tiApplication = Alpine.store( "tiApplication" );
        if ( tiApplication ) {
            tiApplication.setCurrentScreen( match[ 1 ] );
        }
    }
} );

/**
 * Counts every HTMX request as one the user is waiting on, for the shell's busy state (CA-345). Screens are swapped in
 * through HTMX, so this is the request behind most clicks; `sendRequest` counts the rest.
 * <br/>
 * The end is the XHR's own `loadend`, which fires exactly once per request whether it loaded, failed, was aborted or
 * timed out (measured in Chromium on HTMX 2.0.10, the copy committed here, and on 2.0.11, the version the postinstall
 * step refreshes it to). `htmx:afterRequest` is dispatched on the element that made the request: when the answer has
 * replaced that element, HTMX dispatches it again on the nearest ancestor still in the document, and when none is left
 * no listener on the document hears it, which would leave the shell busy for good.
 */
document.addEventListener( "htmx:beforeSend", ( event ) => {
    const xhr = event.detail && event.detail.xhr;
    const tiApplication = Alpine.store( "tiApplication" );
    if ( !xhr || typeof xhr.addEventListener !== "function" || !tiApplication ) {
        return;
    }
    tiApplication._beginRequest();
    xhr.addEventListener( "loadend", () => tiApplication._endRequest(), { once: true } );
} );

/**
 * The HTMX requests in flight, by the element that made each one: its request, where its answer lands, and its verb
 * (CA-463).
 * <br/>
 * HTMX keeps no order between requests made by different elements, and an answer lands whenever it arrives. So a
 * screen's answer still on its way when a newer one was opened used to land after it, measured in Chromium on HTMX
 * 2.0.11:
 * - the landing placeholder's `/app/dashboard` pushed its URL over the screen opened before it arrived. That screen
 *   started under the Dashboard's URL, and the address bar kept it even when the screen had landed first;
 * - of two sidebar entries clicked in a row, the slower answer won.
 * <br/>
 * An entry ends on its XHR's own `loadend`, as the busy state's does, and for the same reason: `htmx:afterRequest`
 * stops reaching the document once the element that made the request has been replaced.
 *
 * @type {Map<Element, {xhr: XMLHttpRequest, target: Element, verb: string}>}
 * @private
 */
const contentRequests = new Map();

/**
 * The newest request aimed at `#ti-content`, which every older one still on its way there was aborted for (CA-463). A
 * screen whose request fails once it is no longer the newest has been replaced, not lost: HTMX reports the abort as it
 * does a failure.
 *
 * @type {XMLHttpRequest|null}
 * @private
 */
let newestContentRequest = null;

/**
 * Aborts every GET still in flight whose answer would land in `#ti-content`, other than the newest screen's: those aimed
 * at it, and those made from inside it, which belong to the content it is about to replace (CA-463). A POST is left to
 * finish.
 *
 * @method
 * @param {Element|null} requester - The element making the newest request, which is spared; `null` when none is made
 *     yet.
 * @private
 */
const supersedeContentRequests = ( requester ) => {
    const content = document.getElementById( "ti-content" );
    if ( !content || !window.htmx ) {
        return;
    }
    for ( const [ element, request ] of contentRequests ) {
        if ( element !== requester && request.verb === "get" && ( request.target === content || content.contains( element ) ) ) {
            window.htmx.trigger( element, "htmx:abort" );
        }
    }
};

/**
 * Lets only the newest screen land: a request aimed at `#ti-content` supersedes every other one still on its way there
 * before it is sent, and becomes the newest; every request is recorded until its XHR ends (CA-463).
 */
document.addEventListener( "htmx:beforeSend", ( event ) => {
    const detail = event.detail || {};
    const xhr = detail.xhr;
    if ( !xhr || typeof xhr.addEventListener !== "function" || !detail.elt ) {
        return;
    }
    const content = document.getElementById( "ti-content" );
    if ( content && detail.target === content ) {
        supersedeContentRequests( detail.elt );
        newestContentRequest = xhr;
    }
    const verb = String( ( detail.requestConfig && detail.requestConfig.verb ) || "" ).toLowerCase();
    contentRequests.set( detail.elt, { xhr: xhr, target: detail.target, verb: verb } );
    xhr.addEventListener( "loadend", () => {
        // A newer request from the same element keeps its entry.
        const request = contentRequests.get( detail.elt );
        if ( request && request.xhr === xhr ) {
            contentRequests.delete( detail.elt );
        }
    }, { once: true } );
} );

/**
 * Closes the sidebar drawer when a request for the screen starts (CA-406). The sidebar's own entries load their screen
 * through HTMX, straight into `#ti-content`, so this is where a tap on one is heard; closing on the request rather than
 * the swap means the drawer is not left over the old screen while a sleeping container wakes.
 */
document.addEventListener( "htmx:beforeRequest", ( event ) => {
    const target = event.detail && event.detail.target;
    const tiApplication = Alpine.store( "tiApplication" );
    if ( target && target.id === "ti-content" && tiApplication ) {
        tiApplication.closeNavigation();
    }
} );

document.addEventListener( "htmx:responseError", ( event ) => {
    // If the server sent HX-Trigger with our payload, it will also emit a separate event,
    // But here we parse body as fallback when body is JSON
    try {
        const xhr = event.detail.xhr;
        const contentType = xhr.getResponseHeader( "Content-Type" ) || "";
        if ( contentType.includes( "application/json" ) && xhr.responseText ) {
            const data = JSON.parse( xhr.responseText );
            const tiApplication = Alpine.store( "tiApplication" );
            if ( tiApplication && tiApplication.isInitialized ) {
                tiApplication.notify( tiApplication.formatException( data ) );
            }
        }
    } catch {
        // Do nothing here...
    }
} );

/* ============================================================================================================
   Read-only "facts" screens — Profile and About.

   Both render the same descriptor shape: an identity header plus an ordered list of titled sections, each
   holding label/value items. The server decides the content (see TiWebAppManager#getProfileInfo /
   #getApplicationInfo); everything below only shapes it for the template, so the fragments stay free of
   formatting logic — which is also what keeps them within Alpine's CSP expression subset.
   ============================================================================================================ */

/**
 * Rendered in place of an item value the server left empty. Keeping it here rather than in each fragment means a
 * section never has to be conditionally assembled just to avoid a blank cell.
 *
 * @type {string}
 */
const INFO_VALUE_PLACEHOLDER = "—";

/**
 * URL schemes an info item may link to. Descriptor content is server-authored, but an `href` becomes a live
 * navigation target, so the set is an allowlist rather than a `javascript:` denylist.
 *
 * @type {string[]}
 */
const INFO_LINK_SCHEMES = [ "http:", "https:", "mailto:" ];

/**
 * Returns the href for an info item, or an empty string when it has none or names a scheme that is not in
 * {@link INFO_LINK_SCHEMES}. A rejected href degrades the item to plain text rather than dropping it.
 *
 * @method
 * @param {Object} item
 * @returns {string}
 * @private
 */
const sanitizeInfoHref = ( item ) => {
    const href = String( ( item && item.href ) || "" ).trim();
    if ( !href ) {
        return "";
    }
    try {
        return INFO_LINK_SCHEMES.includes( new URL( href, window.location.origin ).protocol ) ? href : "";
    } catch {
        return "";
    }
};

/**
 * Normalizes one label/value item: fills in the placeholder for an absent value, collapses the presentational
 * flags into a single class string, and vets any link target.
 *
 * @method
 * @param {Object} item
 * @returns {Object}
 * @private
 */
const normalizeInfoItem = ( item ) => {
    const source = ( item && typeof item === "object" ) ? item : {};
    const value = String( source.value === undefined || source.value === null ? "" : source.value ).trim();
    const classes = [];
    if ( source.mono ) classes.push( "mono" );
    if ( source.muted || !value ) classes.push( "muted" );

    return {
        label: String( source.label || "" ),
        value: value || INFO_VALUE_PLACEHOLDER,
        valueClass: classes.join( " " ),
        wide: source.wide === true,
        href: value ? sanitizeInfoHref( source ) : ""
    };
};

/**
 * Normalizes a descriptor's section list so the template can iterate it without guarding for missing keys.
 * A section carrying no items at all is dropped — an empty panel is noise, not information.
 *
 * @method
 * @param {Array} sections
 * @returns {Array}
 * @private
 */
const normalizeInfoSections = ( sections ) => {
    return ( Array.isArray( sections ) ? sections : [] )
        .filter( ( section ) => section && Array.isArray( section.items ) && section.items.length > 0 )
        .map( ( section ) => ( {
            title: String( section.title || "" ),
            description: String( section.description || "" ),
            icon: String( section.icon || "info-circle" ),
            wide: section.wide === true,
            items: section.items.map( normalizeInfoItem )
        } ) );
};

/**
 * Normalizes an identity tag into a ready-to-bind pill.
 *
 * @method
 * @param {Object} tag
 * @returns {Object}
 * @private
 */
const normalizeInfoTag = ( tag ) => {
    const source = ( tag && typeof tag === "object" ) ? tag : {};
    const classes = [ source.mono ? "ti-tag mono" : "ti-status-pill" ];
    if ( source.tone ) classes.push( String( source.tone ) );
    return {
        text: String( source.text || "" ),
        dot: source.dot === true && !source.mono,
        pillClass: classes.join( " " )
    };
};

/**
 * Runs `load` once the application store has finished initializing — the descriptor endpoints are session-scoped,
 * so requesting them before `/app/config` has resolved would race the session bootstrap.
 *
 * @method
 * @param {Object} component The Alpine component (for `$watch`).
 * @param {Function} load
 * @private
 */
const loadWhenInitialized = ( component, load ) => {
    const tiApplication = Alpine.store( "tiApplication" );
    if ( tiApplication.isInitialized ) {
        load();
    } else {
        component.$watch( () => tiApplication.isInitialized, ( isInitialized ) => {
            if ( isInitialized ) {
                load();
            }
        } );
    }
};

/**
 * Returns a configuration object for the Profile screen "frame-profile.html".
 * <br/>
 * The descriptor comes from `GET /app/profile` (JSON), which the application's web app manager builds — this
 * component only shapes it for the template and never decides what a profile contains.
 *
 * @method
 * @returns {Object}
 * @public
 */
const configureScreenProfile = () => {
    const tiToolbox = Alpine.store( "tiToolbox" );
    const tiApplication = Alpine.store( "tiApplication" );

    return {

        profile: null,
        busy: true,

        init() {
            loadWhenInitialized( this, () => this.load() );
        },

        load() {
            this.busy = true;
            tiApplication.sendRequest( "/app/profile" ).then( ( result ) => {
                const data = ( result && result.data && typeof result.data === "object" ) ? result.data : {};
                const identity = ( data.identity && typeof data.identity === "object" ) ? data.identity : {};
                this.profile = {
                    identity: {
                        name: String( identity.name || "" ),
                        subtitle: String( identity.subtitle || "" ),
                        caption: String( identity.caption || "" ),
                        avatarSeed: String( identity.avatarSeed || identity.name || "" ),
                        badge: identity.badge ? { text: String( identity.badge.text || "" ), tone: String( identity.badge.tone || "" ) } : null,
                        tags: ( Array.isArray( identity.tags ) ? identity.tags : [] ).map( normalizeInfoTag )
                    },
                    sections: normalizeInfoSections( data.sections )
                };
                this.busy = false;
            } ).catch( ( error ) => {
                this.busy = false;
                if ( error && ( error.name === "AbortError" || error.isAborted ) ) return;
                tiApplication.notify( tiApplication.formatException( error ) );
            } );
        },

        avatarStyle() {
            const identity = this.profile ? this.profile.identity : {};
            return tiToolbox.generateAvatarStyle( identity.avatarSeed, identity.name );
        },

        avatarInitial() {
            const identity = this.profile ? this.profile.identity : {};
            return String( identity.name || "?" ).charAt( 0 ).toUpperCase();
        }

    };
};

/**
 * Returns a configuration object for the About screen "frame-about.html".
 * <br/>
 * The server descriptor carries the application's identity as flat fields; the release, component and runtime
 * sections are assembled here rather than server-side, because their labels are fixed framework chrome and the
 * client's `getLabel` takes a fallback — which is what keeps the screen readable inside a consuming application
 * that loads only its own label catalogue.
 *
 * @method
 * @returns {Object}
 * @public
 */
const configureScreenAbout = () => {
    const tiToolbox = Alpine.store( "tiToolbox" );
    const tiApplication = Alpine.store( "tiApplication" );

    // Runtime keys the framework itself supplies; anything else an application adds falls back to its own key.
    const RUNTIME_LABELS = {
        node: [ "interface.about.runtime-node", "Node.js" ],
        platform: [ "interface.about.runtime-platform", "Platform" ],
        application: [ "interface.about.runtime-application", "Application ID" ]
    };

    const label = ( key, fallback ) => tiApplication.getLabel( key, fallback );

    return {

        application: null,
        sections: [],
        busy: true,

        init() {
            loadWhenInitialized( this, () => this.load() );
        },

        load() {
            this.busy = true;
            tiApplication.sendRequest( "/app/about" ).then( ( result ) => {
                const data = ( result && result.data && typeof result.data === "object" ) ? result.data : {};
                this.application = {
                    name: String( data.name || "" ),
                    version: String( data.version || "" ),
                    releaseDate: String( data.releaseDate || "" ),
                    description: String( data.description || "" )
                };
                this.sections = normalizeInfoSections( [
                    this._releaseSection( data ),
                    this._componentsSection( data ),
                    this._runtimeSection( data )
                ].concat( Array.isArray( data.sections ) ? data.sections : [] ) );
                this.busy = false;
            } ).catch( ( error ) => {
                this.busy = false;
                if ( error && ( error.name === "AbortError" || error.isAborted ) ) return;
                tiApplication.notify( tiApplication.formatException( error ) );
            } );
        },

        applicationInitial() {
            return String( ( this.application && this.application.name ) || "?" ).charAt( 0 ).toUpperCase();
        },

        versionTag() {
            return "v" + ( ( this.application && this.application.version ) || "" );
        },

        releaseDateText() {
            const released = label( "interface.about.released", "Released" );
            return released + " " + tiToolbox.formatDate( ( this.application && this.application.releaseDate ) || "" );
        },

        _releaseSection( data ) {
            return {
                title: label( "interface.about.section-release", "Release" ),
                icon: "info-circle",
                items: [
                    { label: label( "interface.about.field-version", "Version" ), value: data.version, mono: true },
                    { label: label( "interface.about.field-release-date", "Release date" ), value: tiToolbox.formatDate( data.releaseDate ) },
                    { label: label( "interface.about.field-license", "License" ), value: data.license },
                    { label: label( "interface.about.field-author", "Author" ), value: data.author },
                    { label: label( "interface.about.field-package", "Package" ), value: data.packageName, mono: true, wide: true },
                    { label: label( "interface.about.field-homepage", "Homepage" ), value: data.homepage, href: data.homepage, wide: true }
                ]
            };
        },

        _componentsSection( data ) {
            const components = Array.isArray( data.components ) ? data.components : [];
            return {
                title: label( "interface.about.section-components", "Framework components" ),
                description: label( "interface.about.section-components-desc", "The ti-engine packages this application is built on." ),
                icon: "folder",
                items: components.map( ( component ) => ( {
                    label: String( component.name || "" ),
                    value: String( component.version || "" ),
                    mono: true
                } ) )
            };
        },

        _runtimeSection( data ) {
            // Present only for an admin session — the server withholds `runtime` from everyone else.
            const runtime = ( data.runtime && typeof data.runtime === "object" ) ? data.runtime : {};
            return {
                title: label( "interface.about.section-runtime", "Runtime" ),
                description: label( "interface.about.section-runtime-desc", "Visible to administrators only." ),
                icon: "settings",
                items: Object.keys( runtime ).map( ( key ) => {
                    const known = RUNTIME_LABELS[ key ];
                    return {
                        label: known ? label( known[ 0 ], known[ 1 ] ) : key,
                        value: String( runtime[ key ] || "" ),
                        mono: true
                    };
                } )
            };
        }

    };
};

/**
 * Splits a page title's label at the part it marks `*so*`, for a title that renders that part in an `<em>`: a theme
 * styles the emphasis, and a label that marks none is the plain title. The framework's own labels mark none.
 *
 * @method
 * @param {string} text
 * @returns {{before: string, em: string, after: string}}
 * @public
 */
const splitTitleEmphasis = ( text ) => {
    const value = ( typeof text === "string" ) ? text : "";
    const match = /^([^*]*)\*([^*]+)\*([^*]*)$/.exec( value );
    return match ? { before: match[ 1 ], em: match[ 2 ], after: match[ 3 ] } : { before: value, em: "", after: "" };
};

/**
 * Returns the store behind What's new's reminders, `tiWhatsNew`: how many notes are new for the signed-in person and not
 * yet seen, and the first one's title. An application binds its dashboard notice or a sidebar count to it. Opening
 * What's new or dismissing a notice marks the release seen and empties it.
 * <br/>
 * It loads once the shell is initialized for someone signed in, and only where the application turned What's new on.
 * A status that cannot load is no reminder, so a failure leaves it empty and says nothing: the screen itself still
 * opens from the menu and says what went wrong.
 *
 * @method
 * @returns {Object}
 * @public
 */
const configureStoreWhatsNew = () => ( {
    unseen: 0,
    first: "",
    requested: false,
    marked: false,

    // The sign-in page initializes the shell too, with no user, and a request from there was answered 401 into the
    // console (measured in Chromium, CA-526).
    init() {
        Alpine.effect( () => {
            const tiApplication = Alpine.store( "tiApplication" );
            const features = ( tiApplication.configuration && tiApplication.configuration.features ) || {};
            if ( tiApplication.isInitialized && tiApplication.user && features.whatsNew === true && !this.requested ) {
                this.requested = true;
                this.load();
            }
        } );
    },

    load() {
        return Alpine.store( "tiApplication" ).sendRequest( "/app/whats-new-status" ).then( ( result ) => {
            // A deep link to the screen asks for the status and the notes together, and the screen marks the release
            // seen once the notes arrive: a status answered after that brought the count back beside notes just read.
            if ( this.marked ) {
                return;
            }
            const data = ( result && result.data && typeof result.data === "object" ) ? result.data : {};
            this.unseen = Math.max( 0, Number( data.unseen ) || 0 );
            this.first = ( typeof data.first === "string" ) ? data.first : "";
        } ).catch( () => {
            this.unseen = 0;
            this.first = "";
        } );
    },

    // The rest of a notice's sentence, after the first note's title: how many more there are, or nothing.
    get moreText() {
        const more = this.unseen - 1;
        return ( more > 0 )
            ? " " + Alpine.store( "tiApplication" ).getLabel( "interface.dashboard.whats-new.more", "and {n} more for you" ).replace( "{n}", String( more ) )
            : "";
    },

    // A sidebar entry's name, with the count while there is one: it is the accessible name, so the count is read out
    // with the entry.
    get label() {
        const tiApplication = Alpine.store( "tiApplication" );
        const name = tiApplication.getLabel( "interface.topbar.whats-new", "What's New" );
        return ( this.unseen > 0 )
            ? `${ name }, ${ tiApplication.getLabel( "interface.navigation.whats-new-unseen", "{n} new" ).replace( "{n}", String( this.unseen ) ) }`
            : name;
    },

    // Records the release as seen, and empties the reminders at once rather than after the answer.
    markSeen() {
        this.marked = true;
        this.unseen = 0;
        this.first = "";
        return Alpine.store( "tiApplication" ).sendRequest( "/app/whats-new-seen", "POST", {} ).catch( () => undefined );
    },

    open() {
        Alpine.store( "tiApplication" ).openScreen( "whats-new" );
    },

    dismiss() {
        return this.markSeen();
    }
} );

/**
 * The longest side of a picture of the screen, in pixels (CA-544). The server refuses a larger one.
 *
 * @type {number}
 */
const PICTURE_MAX_SIDE = 1600;

/**
 * The largest picture of the screen, in bytes. The server refuses a larger one.
 *
 * @type {number}
 */
const PICTURE_MAX_BYTES = 1000000;

/**
 * How long Send Feedback waits for the picture before it opens without one, in milliseconds.
 *
 * @type {number}
 */
const PICTURE_TIME_LIMIT_MS = 4000;

/**
 * The library that draws the picture from a copy of the page, loaded only when one is taken: nobody who never opens
 * Send Feedback downloads it. A script a trusted script inserts runs under `'strict-dynamic'` without a nonce of its own.
 *
 * @type {string}
 */
const PICTURE_LIBRARY = "/static/scripts/lib/modern-screenshot.min.js";

/**
 * The qualities a picture is written at, best first, until it is small enough.
 *
 * @type {ReadonlyArray<number>}
 */
const PICTURE_QUALITIES = Object.freeze( [ 0.82, 0.7, 0.55 ] );

// What the picture leaves out altogether: the menu used to reach Send Feedback is not part of the screen being reported.
const PICTURE_EXCLUDED = ".ti-sidebar-flyout";
// Left out too on a narrow screen, where the sidebar is a drawer laid over the screen rather than a column of it: the
// person opened it to reach Send Feedback, and it was still sliding shut as the copy was made (measured at 390px).
const PICTURE_EXCLUDED_DRAWER = ".ti-sidebar, .ti-navigation-scrim";
// Text the picture keeps: a catalogue label, whose expression is a key and never data, or what an application marked.
const PICTURE_KEPT = "[x-text-label], [data-ti-keep]";
// Blanked whatever it holds, a kept label included.
const PICTURE_REDACTED = "[data-ti-redact]";
// Elements that draw their value in their own box, so a mark on one hides it rather than greying it.
const PICTURE_UNBOXED = Object.freeze( [ "INPUT", "SELECT", "TEXTAREA", "PROGRESS", "METER", "IMG", "CANVAS", "VIDEO", "IFRAME", "OBJECT", "EMBED" ] );
// What the picture blanks as a whole, unless kept: anything that draws an image of its own.
const PICTURE_MEDIA = Object.freeze( [ "IMG", "CANVAS", "VIDEO", "IFRAME", "OBJECT", "EMBED" ] );
// The inputs that show what was typed. A checkbox or a radio button shows only its state, and keeps it.
const PICTURE_TYPED_INPUTS = /^(|text|email|search|tel|url|number|password|date|datetime-local|month|time|week)$/;
// Never walked: their text is not drawn.
const PICTURE_UNDRAWN = Object.freeze( [ "STYLE", "SCRIPT", "TEMPLATE", "NOSCRIPT" ] );
// The attribute names XML reads: a plain name, or one of the prefixes it knows. Anything else, Alpine's `x-bind:class`,
// its shorthands `:class` and `@click`, is enough for the browser to refuse the whole drawing, and the picture comes out
// empty (measured on a real screen with `x-bind:class`).
const PICTURE_PLAIN_ATTRIBUTE = /^(?:(?:xmlns|xlink|xml):)?[A-Za-z_][\w.-]*$/;
// An image of nothing, the size of whatever it replaces.
const PICTURE_EMPTY_IMAGE = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

/**
 * Whether the picture leaves a node out altogether: the menu used to reach Send Feedback, a template, and anything not
 * displayed. Drawing what is not shown cost a real screen of 1,053 elements half of them, and seconds.
 * `display: contents` draws its children, so only `none` counts.
 *
 * @method
 * @param {Node} node An element of the page, or a text.
 * @param {boolean} [drawer] Whether the sidebar is a drawer, which the picture then leaves out with its scrim.
 * @returns {boolean}
 */
const isLeftOutOfPicture = ( node, drawer = false ) => {
    if ( !node || node.nodeType !== 1 ) {
        return false;
    }
    if ( String( node.tagName ).toUpperCase() === "TEMPLATE" || ( typeof node.matches === "function"
        && ( node.matches( PICTURE_EXCLUDED ) || ( drawer && node.matches( PICTURE_EXCLUDED_DRAWER ) ) ) ) ) {
        return true;
    }
    return window.getComputedStyle( node ).display === "none";
};

/**
 * Whether an element is a mark `data-ti-redact` with no mark around it: the one drawn as a grey box, while everything
 * inside it, a mark within included, is not drawn at all.
 *
 * @method
 * @param {Element} element An element of the copy.
 * @returns {boolean}
 * @private
 */
const isOutermostRedacted = ( element ) => {
    if ( typeof element.matches !== "function" || !element.matches( PICTURE_REDACTED ) ) {
        return false;
    }
    const parent = element.parentNode;
    return !( parent && parent.nodeType === 1 && typeof parent.closest === "function" && parent.closest( PICTURE_REDACTED ) );
};

/**
 * Blanks personal information in a copy of the page before it is drawn as a picture of the screen (CA-544). It changes
 * the copy only, never the screen. Text is blanked unless it is known not to be data: only a catalogue label
 * (`x-text-label`) and what an application marked `data-ti-keep` are kept. So what `x-text`, `x-html` or an
 * application's own directive wrote, and anything a server put into a fragment, is blanked by default. A blanked text
 * keeps its length, each character a grey `x`, so the layout still reads and no character of it remains. Typed values
 * become bullets, images grey boxes; chart text goes, chart shapes stay. What an application marked `data-ti-redact`
 * is one grey box of its size, with nothing in it drawn: no text, colour, checked state or shape. It also drops every
 * attribute with a prefix XML cannot resolve, which would otherwise leave the picture empty.
 *
 * @method
 * @param {Node} root The copy of the page.
 * @returns {Node} The same copy.
 * @public
 */
const redactPicture = ( root ) => {
    const isKept = ( node ) => {
        const element = ( node.nodeType === 1 ) ? node : node.parentNode;
        if ( !element || element.nodeType !== 1 || typeof element.closest !== "function" ) {
            return false;
        }
        return !element.closest( PICTURE_REDACTED ) && element.closest( PICTURE_KEPT ) !== null;
    };
    const texts = [];
    const elements = [];
    // Collected first and changed after: changing a tree while walking it skips nodes.
    const walk = ( node ) => {
        Array.from( node.childNodes || [] ).forEach( ( child ) => {
            if ( child.nodeType === 3 ) {
                texts.push( child );
            } else if ( child.nodeType === 1 && !PICTURE_UNDRAWN.includes( String( child.tagName ).toUpperCase() ) ) {
                elements.push( child );
                walk( child );
            }
        } );
    };
    if ( root && root.nodeType === 1 ) {
        elements.push( root );
    }
    walk( root );
    const owner = root.ownerDocument;
    texts.forEach( ( text ) => {
        const parent = text.parentNode;
        if ( !parent || String( text.data || "" ).trim() === "" || isKept( text ) ) {
            return;
        }
        const tag = String( parent.tagName || "" ).toUpperCase();
        if ( tag === "TEXTAREA" ) {
            // Its value, below.
            return;
        }
        const blanked = String( text.data ).replace( /\S/g, "x" );
        if ( parent.namespaceURI === SVG_NAMESPACE || tag === "OPTION" ) {
            // Nothing can be put around text in SVG or an option: a chart's label goes, an option's reads as x.
            text.data = ( parent.namespaceURI === SVG_NAMESPACE ) ? "" : blanked;
            return;
        }
        const bar = owner.createElement( "span" );
        bar.textContent = blanked;
        bar.style.setProperty( "color", "transparent" );
        // The library copies each element's computed fill colour, which paints text over `color`: without this the bar
        // showed its x's (measured).
        bar.style.setProperty( "-webkit-text-fill-color", "transparent" );
        bar.style.setProperty( "background-color", "rgba( 128, 128, 128, 0.35 )" );
        bar.style.setProperty( "border-radius", "3px" );
        if ( typeof parent.closest === "function" && parent.closest( PICTURE_REDACTED ) ) {
            // Inside a mark the bar is made after the elements were listed, so it is hidden here: its length is the text's.
            bar.style.setProperty( "visibility", "hidden", "important" );
        }
        parent.replaceChild( bar, text );
    } );
    elements.forEach( ( element ) => {
        const tag = String( element.tagName || "" ).toUpperCase();
        Array.from( element.attributes || [] ).map( ( attribute ) => attribute.name ).filter( ( name ) => !PICTURE_PLAIN_ATTRIBUTE.test( name ) )
            .forEach( ( name ) => element.removeAttribute( name ) );
        if ( typeof element.closest === "function" && element.closest( PICTURE_REDACTED ) ) {
            // What an application marked shows something the rules above cannot see: a photo set as a CSS background, a
            // grade by its colour, an answer by its checked state, a score by a bar's length. So it is one grey box of
            // its own size, and nothing in it is drawn. 1.58.0 blanked only the text and the background images in it,
            // which left a grade's colour and a checked answer readable (1.58.1). No background image anywhere in it,
            // drawn or not: the library fetches and embeds each one it finds. Grey on the outermost mark alone: on every
            // element in it too, the layers darkened with the markup's depth.
            element.style.setProperty( "background-image", "none", "important" );
            if ( isOutermostRedacted( element ) && !PICTURE_UNBOXED.includes( tag ) && element.namespaceURI !== SVG_NAMESPACE ) {
                element.style.setProperty( "background-color", "rgba( 128, 128, 128, 0.35 )", "important" );
                element.style.setProperty( "background-clip", "border-box", "important" );
                element.style.setProperty( "border-color", "transparent", "important" );
                element.style.setProperty( "border-image", "none", "important" );
                element.style.setProperty( "box-shadow", "none", "important" );
                element.style.setProperty( "outline", "none", "important" );
            } else {
                // Inside a mark; or a control or a shape marked itself, which draws its value in its own box (a checked
                // dot, a progress bar, a shape's fill) and so cannot be a plain one: hidden, its size kept.
                element.style.setProperty( "visibility", "hidden", "important" );
            }
        }
        if ( isKept( element ) ) {
            return;
        }
        if ( tag === "INPUT" && PICTURE_TYPED_INPUTS.test( String( element.getAttribute( "type" ) || "" ).toLowerCase() ) ) {
            const masked = String( element.value || element.getAttribute( "value" ) || "" ).replace( /\S/g, "•" );
            element.value = masked;
            element.setAttribute( "value", masked );
        } else if ( tag === "TEXTAREA" ) {
            const masked = String( element.value || element.textContent || "" ).replace( /\S/g, "•" );
            element.value = masked;
            element.textContent = masked;
        } else if ( tag === "IMG" ) {
            element.removeAttribute( "srcset" );
            element.setAttribute( "src", PICTURE_EMPTY_IMAGE );
            element.style.setProperty( "background-color", "rgba( 128, 128, 128, 0.35 )" );
        } else if ( PICTURE_MEDIA.includes( tag ) ) {
            element.style.setProperty( "visibility", "hidden" );
        } else if ( element.namespaceURI === SVG_NAMESPACE && String( element.tagName ).toLowerCase() === "image" ) {
            element.removeAttribute( "href" );
            element.removeAttribute( "xlink:href" );
        }
    } );
    return root;
};

/**
 * The blank for a pseudo-element's `content` value: kept when it is `none`, `normal` or a single string with no letter
 * and no digit (a mark such as "›" or "•"); a single string with words keeps its length as x's; anything else,
 * `attr()`, a counter, an escape or several parts, is "xxx".
 *
 * @method
 * @param {string} value The value as written, without the property name.
 * @returns {string} The value to write in its place.
 */
const blankContentValue = ( value ) => {
    const trimmed = String( value ).trim();
    if ( trimmed === "none" || trimmed === "normal" ) {
        return value;
    }
    const quote = trimmed.charAt( 0 );
    const inner = trimmed.slice( 1, -1 );
    const literal = ( trimmed.length >= 2 && ( quote === "\"" || quote === "'" ) && trimmed.charAt( trimmed.length - 1 ) === quote
        && !inner.includes( quote ) && !inner.includes( "\\" ) ) ? inner : null;
    if ( literal !== null && !/[\p{L}\p{N}]/u.test( literal ) ) {
        return value;
    }
    return ` "${ ( literal === null ) ? "xxx" : literal.replace( /[\p{L}\p{N}]/gu, "x" ) }"`;
};

/**
 * Rewrites every `content` declaration in a stylesheet with {@link blankContentValue}. A scanner, not a pattern: the
 * property is found only where a declaration starts (never inside `justify-content`), and its value is read up to the
 * `;` or `}` that ends it outside quotes, so a `;` in a string cuts nothing (the second review pass).
 *
 * @method
 * @param {string} css
 * @returns {string}
 */
const blankPseudoContent = ( css ) => {
    let out = "";
    let from = 0;
    let at = css.indexOf( "content", from );
    while ( at !== -1 ) {
        let colon = at + 7;
        while ( colon < css.length && /\s/.test( css.charAt( colon ) ) ) {
            colon += 1;
        }
        const startsDeclaration = ( at === 0 || /[\s;{]/.test( css.charAt( at - 1 ) ) ) && css.charAt( colon ) === ":";
        if ( !startsDeclaration ) {
            at = css.indexOf( "content", at + 7 );
            continue;
        }
        let end = colon + 1;
        let quote = null;
        while ( end < css.length ) {
            const character = css.charAt( end );
            if ( quote !== null ) {
                if ( character === "\\" ) {
                    end += 1;
                } else if ( character === quote ) {
                    quote = null;
                }
            } else if ( character === "\"" || character === "'" ) {
                quote = character;
            } else if ( character === ";" || character === "}" ) {
                break;
            }
            end += 1;
        }
        out += css.slice( from, colon + 1 ) + blankContentValue( css.slice( colon + 1, end ) );
        from = end;
        at = css.indexOf( "content", end );
    }
    return out + css.slice( from );
};

/**
 * Blanks what reaches the drawing after the copy was redacted (CA-544, measured): the text of a pseudo-element's
 * `content`, which the library writes into the drawing's stylesheet; the text of an SVG symbol a `<use>` points to,
 * which it copies in from the page; and whatever a pseudo-element draws inside what an application marked
 * `data-ti-redact`, which no inline style reaches. A `content` with a letter or a digit becomes x's, and anything
 * computed, such as `attr()` or a counter, becomes "xxx"; a mark such as "›" or "•" stays.
 *
 * @method
 * @param {Element} drawing The SVG the library is about to draw.
 * @returns {Element} The same drawing.
 * @public
 */
const redactDrawing = ( drawing ) => {
    drawing.querySelectorAll( "style" ).forEach( ( style ) => {
        style.textContent = blankPseudoContent( String( style.textContent || "" ) );
    } );
    drawing.querySelectorAll( "defs text, defs tspan, symbol text, symbol tspan" ).forEach( ( text ) => {
        text.textContent = "";
    } );
    // Inside the drawing, which the page's policy does not reach: the library's own stylesheet is there too. It writes
    // each pseudo-element's computed `visibility: visible` there, which beats what the element inherits, so a
    // pseudo-element in a mark is hidden here: a status dot drawn in `::before` would otherwise show through the box.
    const marked = drawing.ownerDocument.createElementNS( SVG_NAMESPACE, "style" );
    marked.textContent = "[data-ti-redact]::before, [data-ti-redact]::after, [data-ti-redact] *::before, [data-ti-redact] *::after { visibility: hidden !important; background-image: none !important; }";
    drawing.appendChild( marked );
    return drawing;
};

let pictureLibrary = null;

/**
 * Loads the picture library once, on the first picture.
 *
 * @method
 * @returns {Promise<Object>} The library's global.
 */
const loadPictureLibrary = () => {
    if ( window.modernScreenshot ) {
        return Promise.resolve( window.modernScreenshot );
    }
    if ( pictureLibrary === null ) {
        pictureLibrary = new Promise( ( resolve, reject ) => {
            const script = document.createElement( "script" );
            script.src = PICTURE_LIBRARY;
            script.async = true;
            script.addEventListener( "load", () => ( window.modernScreenshot ) ? resolve( window.modernScreenshot ) : reject( new Error( "The picture library did not load." ) ) );
            script.addEventListener( "error", () => {
                // So the next picture asks again, rather than for ever answering this failure.
                pictureLibrary = null;
                reject( new Error( "The picture library could not be loaded." ) );
            } );
            document.head.appendChild( script );
        } );
    }
    return pictureLibrary;
};

/**
 * Writes a drawn page as a picture the server accepts: WebP, or JPEG where the browser cannot write WebP (it then
 * answers another type, as Safari does), at most {@link PICTURE_MAX_BYTES}. The quality steps down first, then the size,
 * by a quarter, up to three times.
 *
 * @method
 * @param {HTMLCanvasElement} canvas
 * @returns {Promise<{url: string, type: string, bytes: number, width: number, height: number}|null>} Null when nothing
 * small enough could be written.
 */
const encodePicture = ( canvas ) => {
    const toBlob = ( source, type, quality ) => new Promise( ( resolve ) => source.toBlob( resolve, type, quality ) );
    const shrink = ( source ) => {
        const smaller = document.createElement( "canvas" );
        smaller.width = Math.max( 1, Math.round( source.width * 0.75 ) );
        smaller.height = Math.max( 1, Math.round( source.height * 0.75 ) );
        smaller.getContext( "2d" ).drawImage( source, 0, 0, smaller.width, smaller.height );
        return smaller;
    };
    const attempt = ( source, type, qualityIndex, shrinks ) => {
        if ( qualityIndex >= PICTURE_QUALITIES.length ) {
            return ( shrinks >= 3 ) ? Promise.resolve( null ) : attempt( shrink( source ), type, 0, shrinks + 1 );
        }
        return toBlob( source, type, PICTURE_QUALITIES[ qualityIndex ] ).then( ( blob ) => {
            if ( !blob ) {
                return null;
            }
            if ( blob.type !== type ) {
                return ( type === "image/webp" ) ? attempt( source, "image/jpeg", qualityIndex, shrinks ) : null;
            }
            if ( blob.size > PICTURE_MAX_BYTES ) {
                return attempt( source, type, qualityIndex + 1, shrinks );
            }
            return new Promise( ( resolve, reject ) => {
                const reader = new FileReader();
                reader.addEventListener( "load", () => resolve( { url: String( reader.result ), type: type, bytes: blob.size, width: source.width, height: source.height } ) );
                reader.addEventListener( "error", () => reject( reader.error ) );
                reader.readAsDataURL( blob );
            } );
        } );
    };
    return attempt( canvas, "image/webp", 0, 0 );
};

/**
 * Returns the store that remembers the screen a person left for Send Feedback, `tiScreenTrail`: the screen a problem
 * report names as the one they were on. The shell names the current screen after every swap; this keeps the one before
 * Send Feedback, in a variable of its own so that keeping it is no change the effect reacts to.
 * <br/>
 * It also takes the picture of that screen (CA-544). The way to Send Feedback is held while the screen being left is
 * drawn from a copy, with personal information blanked ({@link redactPicture}), and then goes on: a link's request
 * through htmx's `htmx:confirm`, and `openScreen` before it changes anything, since it names the new screen before its
 * request starts. The picture stays here, in the browser, until the person sends it; leaving Send Feedback drops it. It
 * is not taken when there is no screen to take: a reload of Send Feedback, or Send Feedback asked for from itself.
 *
 * @method
 * @returns {Object}
 * @public
 */
const configureStoreScreenTrail = () => {
    let last = "";
    let taking = null;
    let holding = false;
    // Navigations begun: a screen asked for into `#ti-content`, a history restore, Back or Forward. A hold that sees
    // the count move was overtaken. Only a GET counts, so an autosave aimed at the screen does not cancel the click.
    let navigationsBegun = 0;
    return {
        previous: "",
        picture: null,

        init() {
            Alpine.effect( () => {
                const screen = String( Alpine.store( "tiApplication" ).currentScreen || "" );
                if ( screen === "" || screen === last ) {
                    return;
                }
                if ( screen === "send-feedback" ) {
                    this.previous = last;
                } else {
                    // Left without sending: the picture was of a screen they have since moved on from.
                    this.picture = null;
                }
                last = screen;
            } );
            document.addEventListener( "htmx:confirm", ( event ) => this.holdForPicture( event ) );
            document.addEventListener( "htmx:beforeRequest", ( event ) => {
                const detail = event.detail || {};
                const verb = String( ( detail.requestConfig && detail.requestConfig.verb ) || "get" ).toLowerCase();
                if ( detail.target && detail.target.id === "ti-content" && verb === "get" ) {
                    navigationsBegun += 1;
                }
            } );
            // Back and Forward, and htmx's restore of a page from its history, request nothing the line above sees.
            document.addEventListener( "htmx:historyRestore", () => {
                navigationsBegun += 1;
            } );
            window.addEventListener( "popstate", () => {
                navigationsBegun += 1;
            } );
        },

        /**
         * Whether opening Send Feedback now would take a picture: the application turned Feedback on, a screen was
         * shown before, and it is not Send Feedback itself.
         *
         * @method
         * @returns {boolean}
         * @public
         */
        wantsPicture() {
            const tiApplication = Alpine.store( "tiApplication" );
            const features = tiApplication.configuration && tiApplication.configuration.features;
            return !!features && features.feedback === true && last !== "" && last !== "send-feedback" && tiApplication.currentScreen !== "send-feedback";
        },

        /**
         * Takes the picture, then goes on to Send Feedback. While it is drawn the shell shows it is busy, as for a
         * request, since nothing else on the screen changes. A second way to Send Feedback meanwhile is the same one
         * and is dropped, where it would have sent the form twice. If another screen was asked for meanwhile, that one
         * wins: going on would replace it with Send Feedback and a picture of a screen already left (the review pass).
         *
         * @method
         * @param {function(): void} proceed What opens Send Feedback.
         * @param {boolean} [drawer] Whether the sidebar is a drawer, left out of the picture.
         * @returns {boolean} False when a hold was already running, and this one was dropped.
         * @public
         */
        holdFor( proceed, drawer = false ) {
            if ( holding ) {
                return false;
            }
            holding = true;
            const tiApplication = Alpine.store( "tiApplication" );
            const before = navigationsBegun;
            tiApplication._beginRequest();
            // Through a promise from the start: a throw while setting up would otherwise leave the hold, and the
            // shell's busy state, on for good, and every later way to Send Feedback dropped (the second review pass).
            Promise.resolve().then( () => this.takePicture( { drawer: drawer } ) ).catch( () => {
                this.picture = null;
            } ).then( () => {
                holding = false;
                tiApplication._endRequest();
                if ( navigationsBegun !== before ) {
                    this.picture = null;
                    return;
                }
                proceed();
            } );
            return true;
        },

        /**
         * Holds the shell's request for Send Feedback until the screen being left is drawn: a link's `hx-get` and the
         * user menu. `openScreen` is held before this, through `holdFor`, because by the time its request raises the
         * event it has already named Send Feedback as the screen, and `wantsPicture` would see nothing to take.
         *
         * @method
         * @param {CustomEvent} event `htmx:confirm`.
         * @public
         */
        holdForPicture( event ) {
            const detail = event && event.detail;
            if ( !detail || typeof detail.issueRequest !== "function" || String( detail.verb || "" ).toLowerCase() !== "get"
                || String( detail.path || "" ).split( "?" )[ 0 ] !== "/app/send-feedback" ) {
                return;
            }
            if ( holding ) {
                // A second click while the first is held: the first goes on, this one would send the form twice.
                event.preventDefault();
                return;
            }
            if ( !this.wantsPicture() ) {
                return;
            }
            event.preventDefault();
            // At once, as the request would: the drawer used to reach Send Feedback is not part of the screen.
            const tiApplication = Alpine.store( "tiApplication" );
            const drawer = tiApplication.navigationDrawer === true;
            tiApplication.closeNavigation();
            this.holdFor( () => detail.issueRequest( true ), drawer );
        },

        /**
         * Draws the screen as it is, at most {@link PICTURE_MAX_SIDE} pixels on its longer side and
         * {@link PICTURE_MAX_BYTES} bytes, and keeps it as `picture`. Never rejects: past
         * {@link PICTURE_TIME_LIMIT_MS}, or on any failure, there is no picture.
         *
         * @method
         * @param {Object} [options]
         * @param {boolean} [options.drawer] Whether the sidebar is a drawer, left out of the picture.
         * @returns {Promise<void>}
         * @public
         */
        takePicture( { drawer = false } = {} ) {
            if ( taking ) {
                return taking;
            }
            this.picture = null;
            const width = Math.max( 1, window.innerWidth || 0 );
            const height = Math.max( 1, window.innerHeight || 0 );
            const scale = Math.min( window.devicePixelRatio || 1, PICTURE_MAX_SIDE / Math.max( width, height ) );
            // The standard properties alone: the custom ones are already resolved into them, and copied onto every
            // element they were 296 declarations each, an 8.6 MB drawing that took 5 s; without them 0.7 s (measured).
            const properties = Array.from( window.getComputedStyle( document.documentElement ) ).filter( ( name ) => !String( name ).startsWith( "--" ) );
            const drawing = loadPictureLibrary().then( ( library ) => library.domToCanvas( document.body, {
                width: width,
                height: height,
                scale: scale,
                backgroundColor: window.getComputedStyle( document.body ).backgroundColor,
                // Embedding web fonts inserts a <style> the CSP refuses, and the library then throws (measured). The
                // picture's text is drawn in the fallback typeface instead; most of it is blanked anyway.
                font: false,
                includeStyleProperties: properties,
                features: { restoreScrollPosition: true, copyScrollbar: false },
                filter: ( node ) => !isLeftOutOfPicture( node, drawer ),
                onCloneNode: ( copy ) => {
                    redactPicture( copy );
                },
                onCreateForeignObjectSvg: ( drawing ) => {
                    redactDrawing( drawing );
                }
            } ) ).then( encodePicture );
            const limit = new Promise( ( resolve ) => setTimeout( () => resolve( null ), PICTURE_TIME_LIMIT_MS ) );
            taking = Promise.race( [ drawing, limit ] ).then( ( picture ) => {
                this.picture = picture || null;
            }, () => {
                this.picture = null;
            } ).then( () => {
                taking = null;
            } );
            return taking;
        },

        /**
         * Blanks personal information in a copy of the page, as every picture does: {@link redactPicture}. Here for an
         * application's own test of what its screens keep.
         *
         * @method
         * @param {Node} root
         * @returns {Node}
         * @public
         */
        redact( root ) {
            return redactPicture( root );
        },

        /**
         * Blanks what reaches the drawing after the copy was redacted: {@link redactDrawing}.
         *
         * @method
         * @param {Element} drawing
         * @returns {Element}
         * @public
         */
        redactDrawing( drawing ) {
            return redactDrawing( drawing );
        },

        /**
         * Forgets the picture: once sent, or when another piece of feedback starts.
         *
         * @method
         * @public
         */
        dropPicture() {
            this.picture = null;
        }
    };
};

/**
 * Returns a configuration object for the What's new screen, "frame-whats-new.html".
 * <br/>
 * The notes new in the release this deployment runs, then the earlier ones by version, as the server picks them for the
 * reader: their audience, their language, and a link only to a screen they may open. Opening the screen is what marks
 * the release seen, so a reminder bound to `tiWhatsNew` goes once the notes have been shown.
 *
 * @method
 * @returns {Object}
 * @public
 */
const configureScreenWhatsNew = () => {
    const tiToolbox = Alpine.store( "tiToolbox" );
    const tiApplication = Alpine.store( "tiApplication" );
    const label = ( key, fallback ) => tiApplication.getLabel( key, fallback );
    const KIND_TAGS = Object.freeze( { new: "accent", improved: "info", fixed: "success" } );

    return {
        busy: true,
        loaded: false,
        release: null,
        fresh: [],
        earlier: [],

        init() {
            loadWhenInitialized( this, () => this.load() );
        },

        load() {
            this.busy = true;
            tiApplication.sendRequest( "/app/whats-new" ).then( ( result ) => {
                const data = ( result && result.data && typeof result.data === "object" ) ? result.data : {};
                this.release = ( data.release && typeof data.release === "object" ) ? data.release : null;
                this.fresh = Array.isArray( data.fresh ) ? data.fresh : [];
                this.earlier = Array.isArray( data.earlier ) ? data.earlier : [];
                this.loaded = true;
                this.busy = false;
                if ( data.seen !== true ) {
                    Alpine.store( "tiWhatsNew" ).markSeen();
                }
            } ).catch( ( error ) => {
                this.busy = false;
                if ( error && ( error.name === "AbortError" || error.isAborted ) ) return;
                tiApplication.notify( tiApplication.formatException( error ) );
            } );
        },

        get pageTitle() {
            return splitTitleEmphasis( label( "interface.whats-new.page-title", "What's new" ) );
        },

        // When this deployment started running the release, and which it is.
        get updatedText() {
            if ( !this.release ) {
                return "";
            }
            const version = String( this.release.version || "" );
            return this.release.since
                ? label( "interface.whats-new.updated", "Updated on {date}, version {version}" ).replace( "{date}", tiToolbox.formatDate( this.release.since, "" ) ).replace( "{version}", version )
                : label( "interface.whats-new.version-only", "Version {version}" ).replace( "{version}", version );
        },

        hasFresh() {
            return this.fresh.length > 0;
        },

        hasEarlier() {
            return this.earlier.length > 0;
        },

        noteKey( note ) {
            return `${ note.version }:${ note.id }`;
        },

        kindText( note ) {
            return label( `interface.whats-new.kind.${ note.kind }`, note.kind );
        },

        kindClass( note ) {
            return KIND_TAGS[ note.kind ] || KIND_TAGS.new;
        },

        releaseText( entry ) {
            return label( "interface.whats-new.release", "Version {version}" ).replace( "{version}", String( entry.version ) );
        },

        // A note about this very screen offers no link to it.
        canOpen( note ) {
            return !!note.screen && note.screen !== "whats-new";
        },

        openText( note ) {
            return label( "interface.whats-new.open", "Open {screen}" ).replace( "{screen}", label( `interface.topbar.${ note.screen }`, note.screen ) );
        },

        open( note ) {
            tiApplication.openScreen( note.screen );
        }
    };
};

/**
 * Returns a configuration object for the Send Feedback screen, "frame-send-feedback.html".
 * <br/>
 * What it is, the text, and whether to send it anonymously. A problem carries the screen the person was on, which
 * `tiScreenTrail` kept, the browser, and on the server the version and language; the form says so before it is sent.
 * When `tiScreenTrail` drew that screen, the person may attach the picture (CA-544): off until ticked, shown once
 * ticked, and with the small print saying what was blanked. Never with anonymous feedback: a picture of one's own screen
 * shows what only that person sees, and their own name's length, so it would say who sent it.
 * The screen is read when the feedback is sent rather than when the form opens: the shell names the current screen
 * after the swap, which can come after the form's own start.
 *
 * @method
 * @returns {Object}
 * @public
 */
const configureScreenSendFeedback = () => {
    const tiApplication = Alpine.store( "tiApplication" );
    const label = ( key, fallback ) => tiApplication.getLabel( key, fallback );
    const KINDS = [ "suggestion", "problem", "praise", "other" ];
    const TEXT_MAX = 4000;
    const browserName = () => ( typeof navigator !== "undefined" && navigator && typeof navigator.userAgent === "string" ) ? navigator.userAgent : "";

    return {
        kind: "",
        text: "",
        anonymous: false,
        attachPicture: false,
        busy: false,
        sent: false,

        get pageTitle() {
            return splitTitleEmphasis( label( "interface.send-feedback.page-title", "Send feedback" ) );
        },

        get kinds() {
            return KINDS.map( ( kind ) => ( {
                kind: kind,
                id: "ti-feedback-kind-" + kind,
                name: label( `interface.feedback.kind.${ kind }`, kind ),
                hint: label( `interface.send-feedback.kind-hint.${ kind }`, "" ),
                checked: this.kind === kind
            } ) );
        },

        setKind( kind ) {
            this.kind = KINDS.includes( kind ) ? kind : "";
        },

        setText( value ) {
            this.text = String( value || "" );
        },

        setAnonymous( checked ) {
            this.anonymous = checked === true;
            if ( this.anonymous ) {
                this.attachPicture = false;
            }
        },

        // Whether there is a picture of the screen to offer: none after a reload here, or when it could not be drawn.
        get hasPicture() {
            const picture = Alpine.store( "tiScreenTrail" ).picture;
            return !!( picture && typeof picture.url === "string" && picture.url !== "" );
        },

        get pictureURL() {
            return this.hasPicture ? Alpine.store( "tiScreenTrail" ).picture.url : "";
        },

        setAttachPicture( checked ) {
            this.attachPicture = checked === true && !this.anonymous;
        },

        get remainingText() {
            return label( "interface.send-feedback.remaining", "{n} characters left" ).replace( "{n}", String( Math.max( 0, TEXT_MAX - this.text.length ) ) );
        },

        get canSend() {
            return this.kind !== "" && this.text.trim() !== "" && this.text.length <= TEXT_MAX && !this.busy;
        },

        get isProblem() {
            return this.kind === "problem";
        },

        // The screen a problem names: the one left for this form, or none known after a reload here.
        get aboutScreen() {
            return String( Alpine.store( "tiScreenTrail" ).previous || "" );
        },

        get contextText() {
            const screen = this.aboutScreen;
            const name = screen ? label( `interface.topbar.${ screen }`, screen ) : label( "interface.send-feedback.screen-unknown", "not known" );
            return label( "interface.send-feedback.context", "With a problem we also send the screen you were on ({screen}), the application's version, your language and your browser." ).replace( "{screen}", name );
        },

        send() {
            if ( !this.canSend ) {
                return;
            }
            this.busy = true;
            const body = { kind: this.kind, text: this.text.trim(), anonymous: this.anonymous, screen: this.isProblem ? this.aboutScreen : "", browser: this.isProblem ? browserName() : "" };
            if ( this.attachPicture && this.hasPicture && !this.anonymous ) {
                body.picture = this.pictureURL;
            }
            tiApplication.sendRequest( "/app/send-feedback", "POST", body ).then( () => {
                this.busy = false;
                this.sent = true;
                // Sent once: the next piece of feedback is about something else.
                Alpine.store( "tiScreenTrail" ).dropPicture();
                this.attachPicture = false;
                tiApplication.notify( label( "interface.send-feedback.sent-toast", "Thank you: your feedback was sent." ) );
            } ).catch( ( error ) => {
                this.busy = false;
                tiApplication.notify( tiApplication.formatException( error ) );
            } );
        },

        another() {
            this.kind = "";
            this.text = "";
            this.anonymous = false;
            this.attachPicture = false;
            this.sent = false;
        }
    };
};

/**
 * Returns a configuration object for the administrators' Feedback screen, "frame-feedback-inbox.html".
 * <br/>
 * Every piece of feedback, newest first, filtered by status (New until asked otherwise) and by kind, each with who sent
 * it, the text, a problem's context, and a select that gives it a status in place. A picture of the screen sent with an
 * item is loaded only when it is asked for, and kept for the screen's life (CA-544).
 *
 * @method
 * @returns {Object}
 * @public
 */
const configureScreenFeedbackInbox = () => {
    const tiToolbox = Alpine.store( "tiToolbox" );
    const tiApplication = Alpine.store( "tiApplication" );
    const label = ( key, fallback ) => tiApplication.getLabel( key, fallback );
    const STATUSES = [ "new", "in-progress", "done", "declined" ];
    const KINDS = [ "suggestion", "problem", "praise", "other" ];
    const KIND_TAGS = Object.freeze( { suggestion: "info", problem: "danger", praise: "success", other: "outline" } );

    return {
        items: [],
        loaded: false,
        busy: true,
        statusFilter: "new",
        kindFilter: "",
        // Feedback ID → `{ shown, url }` for each picture asked for.
        pictures: {},

        init() {
            loadWhenInitialized( this, () => this.load() );
        },

        load() {
            this.busy = true;
            tiApplication.sendRequest( "/app/feedback-inbox" ).then( ( result ) => {
                const data = ( result && result.data && typeof result.data === "object" ) ? result.data : {};
                this.items = Array.isArray( data.items ) ? data.items : [];
                this.loaded = true;
                this.busy = false;
            } ).catch( ( error ) => {
                this.busy = false;
                if ( error && ( error.name === "AbortError" || error.isAborted ) ) return;
                tiApplication.notify( tiApplication.formatException( error ) );
            } );
        },

        get pageTitle() {
            return splitTitleEmphasis( label( "interface.feedback-inbox.page-title", "Feedback" ) );
        },

        // The status filter's choices, each with its count; "all" last.
        get statusChoices() {
            const choices = STATUSES.map( ( status ) => ( {
                value: status,
                name: label( `interface.feedback.status.${ status }`, status ),
                count: this.items.filter( ( item ) => item.status === status ).length
            } ) );
            choices.push( { value: "all", name: label( "interface.feedback-inbox.all", "All" ), count: this.items.length } );
            return choices.map( ( choice ) => Object.assign( choice, {
                pressed: ( this.statusFilter === choice.value ) ? "true" : "false",
                text: `${ choice.name } (${ choice.count })`
            } ) );
        },

        get kindChoices() {
            return KINDS.map( ( kind ) => ( { value: kind, name: label( `interface.feedback.kind.${ kind }`, kind ) } ) );
        },

        get statusOptions() {
            return STATUSES.map( ( status ) => ( { value: status, name: label( `interface.feedback.status.${ status }`, status ) } ) );
        },

        setStatusFilter( status ) {
            this.statusFilter = status;
        },

        setKindFilter( kind ) {
            this.kindFilter = KINDS.includes( kind ) ? kind : "";
        },

        get shown() {
            return this.items.filter( ( item ) => ( this.statusFilter === "all" || item.status === this.statusFilter ) && ( this.kindFilter === "" || item.kind === this.kindFilter ) );
        },

        hasShown() {
            return this.shown.length > 0;
        },

        hasItems() {
            return this.items.length > 0;
        },

        kindText( item ) {
            return label( `interface.feedback.kind.${ item.kind }`, item.kind );
        },

        kindClass( item ) {
            return KIND_TAGS[ item.kind ] || "outline";
        },

        senderText( item ) {
            return ( item.anonymous !== true && item.senderName ) ? item.senderName : label( "interface.feedback.sender.anonymous", "Anonymous" );
        },

        dateText( item ) {
            return tiToolbox.formatDate( item.submittedAt, "" );
        },

        statusSelectID( item ) {
            return "ti-feedback-status-" + item.feedbackID;
        },

        // A problem's context, each line named; none for anything else.
        contextLines( item ) {
            const context = item.context;
            if ( !context ) {
                return [];
            }
            const screen = context.screen ? label( `interface.topbar.${ context.screen }`, context.screen ) : label( "interface.send-feedback.screen-unknown", "not known" );
            return [
                { key: "screen", name: label( "interface.feedback-inbox.context.screen", "Screen" ), value: screen },
                { key: "version", name: label( "interface.feedback-inbox.context.version", "Version" ), value: context.version || "—" },
                { key: "language", name: label( "interface.feedback-inbox.context.language", "Language" ), value: String( context.language || "—" ).toUpperCase() },
                { key: "browser", name: label( "interface.feedback-inbox.context.browser", "Browser" ), value: context.browser || "—" }
            ];
        },

        hasPicture( item ) {
            return !!( item && item.picture );
        },

        pictureShown( item ) {
            const picture = this.pictures[ item.feedbackID ];
            return !!( picture && picture.shown && picture.url );
        },

        pictureURL( item ) {
            const picture = this.pictures[ item.feedbackID ];
            return ( picture && picture.url ) ? picture.url : "";
        },

        pictureButtonText( item ) {
            return this.pictureShown( item )
                ? label( "interface.feedback-inbox.picture-hide", "Hide the picture" )
                : label( "interface.feedback-inbox.picture-show", "Show the picture" );
        },

        pictureExpanded( item ) {
            return this.pictureShown( item ) ? "true" : "false";
        },

        togglePicture( item ) {
            const id = item.feedbackID;
            const picture = this.pictures[ id ];
            if ( picture && picture.url ) {
                this.pictures[ id ] = { shown: !picture.shown, url: picture.url };
                return;
            }
            if ( picture && picture.loading ) {
                return;
            }
            this.pictures[ id ] = { loading: true };
            tiApplication.sendRequest( "/app/feedback-picture?feedbackID=" + encodeURIComponent( id ) ).then( ( result ) => {
                const data = ( result && result.data && typeof result.data === "object" ) ? result.data : {};
                const ok = ( data.type === "image/webp" || data.type === "image/jpeg" ) && typeof data.data === "string" && data.data !== "";
                this.pictures[ id ] = ok ? { shown: true, url: `data:${ data.type };base64,${ data.data }` } : {};
            } ).catch( ( error ) => {
                this.pictures[ id ] = {};
                tiApplication.notify( tiApplication.formatException( error ) );
            } );
        },

        setStatus( item, status ) {
            if ( !STATUSES.includes( status ) || status === item.status ) {
                return;
            }
            const was = item.status;
            item.status = status;
            tiApplication.sendRequest( "/app/feedback-status", "POST", { feedbackID: item.feedbackID, status: status } ).then( () => {
                tiApplication.notify( label( "interface.feedback-inbox.status-saved", "Status saved." ) );
            } ).catch( ( error ) => {
                item.status = was;
                tiApplication.notify( tiApplication.formatException( error ) );
            } );
        }
    };
};

/**
 * The answers about a sign-in link that the address form explains, from `?email-link=<outcome>`: a request that sent
 * nothing, and a link that could not be used. `sent` is a step of its own.
 *
 * @type {ReadonlyArray<string>}
 */
const LOGIN_EMAIL_LINK_MESSAGES = Object.freeze( [ "limited", "unavailable", "invalid-address", "expired" ] );

/**
 * How long a sign-in form holds its button once sent, in milliseconds: long enough to stop a double click, short enough
 * that a person who stopped a slow request, or lost the connection, can try again without reloading.
 *
 * @type {number}
 */
const LOGIN_SENDING_HOLD_MS = 8000;

/**
 * Returns a configuration object for the login screen error message.
 * <br/>
 * The login handlers answer a failed sign-in with a `303` to `/?error=<code>` (see `defaultErrorHandler`). This reads
 * that parameter and reveals the message element; the copy itself stays declarative via `x-text-label` so it localizes
 * through the normal path. Deliberately independent of the throwaway test-user panel so it survives the test-user panel this screen used to carry, which moved to the consuming application in CA-129.
 *
 * @method
 * @returns {Object}
 * @public
 */
const configureLoginError = () => {
    return {
        hasError: false,

        init() {
            const tiToolbox = Alpine.store( "tiToolbox" );
            this.hasError = Boolean( tiToolbox.getUrlParam( "error" ) );
            // The parameter is a one-time message, not state. Read it, show it, drop it — otherwise a refresh (or a
            // bookmark, or a shared link) replays a sign-in failure that already happened, and the login screen can
            // never be returned to its blank state without editing the URL by hand.
            tiToolbox.clearUrlParam( "error" );
        }
    };
};

/**
 * Returns a configuration object for sign-in with a link sent by e-mail (CA-537): one block on the sign-in page in three
 * steps, `ask` (the address form), `sent` and `confirm`.
 * <br/>
 * The link lands here with its token in the fragment, `#email-link=<token>`, which no server sees. The token is taken
 * out of the address bar at once, so it is not left in the history, and kept for the tab until it is posted or declined,
 * so a reload or the page's language switch still finds it. The person presses Continue to post it: a mail
 * scanner that opened the link, and perhaps ran this script, presses nothing and so spends nothing. First the page asks
 * the server which address the link signs in, without spending it, and shows it: a link somebody sent for their own
 * address would otherwise sign the person into that account unnoticed. A link that can no longer sign anybody in goes
 * straight back to the address form, saying so. A request for a link comes back as `?email-link=<outcome>`, read once
 * and dropped like `?error=`.
 *
 * @method
 * @returns {Object}
 * @public
 */
const configureLoginEmailLink = () => {
    return {
        step: "ask",
        token: "",
        email: "",
        checking: false,
        sending: false,
        sendingTimer: null,
        message: "",

        init() {
            const tiToolbox = Alpine.store( "tiToolbox" );
            const outcome = tiToolbox.getUrlParam( "email-link" );
            tiToolbox.clearUrlParam( "email-link" );
            // The shell took the token out of the address bar as it started (see `tiApplication.takeSignInLink`).
            const token = Alpine.store( "tiApplication" ).takeSignInLink();
            if ( token ) {
                this.token = token;
                this.step = "confirm";
                this.check();
            } else if ( outcome === "sent" ) {
                this.step = "sent";
            } else if ( LOGIN_EMAIL_LINK_MESSAGES.includes( outcome ) ) {
                this.message = outcome;
            }
        },

        /**
         * Asks which address the link signs in. Should the question fail, Continue still works, without the address.
         */
        check() {
            this.checking = true;
            return Alpine.store( "tiApplication" ).sendRequest( "/login/email-link", "POST", { token: this.token, peek: true } ).then( ( result ) => {
                const email = result && result.data ? result.data.email : null;
                if ( typeof email === "string" && email !== "" ) {
                    this.email = email;
                } else {
                    Alpine.store( "tiApplication" ).forgetSignInLink();
                    this.token = "";
                    this.message = "expired";
                    this.step = "ask";
                }
            } ).catch( () => {
                this.email = "";
            } ).finally( () => {
                this.checking = false;
            } );
        },

        askAgain() {
            Alpine.store( "tiApplication" ).forgetSignInLink();
            this.token = "";
            this.email = "";
            this.message = "";
            this.step = "ask";
        },

        /**
         * Holds the button down once a form is on its way. A link works once: a second Continue posted the spent token
         * and came back saying the link had expired, over the sign-in that had just worked.
         */
        markSending() {
            if ( this.step === "confirm" ) {
                // Posted: whatever comes back, the link is spent or was already.
                Alpine.store( "tiApplication" ).forgetSignInLink();
            }
            this.sending = true;
            clearTimeout( this.sendingTimer );
            this.sendingTimer = setTimeout( () => {
                this.sending = false;
            }, LOGIN_SENDING_HOLD_MS );
        },

        /**
         * Lets the buttons work again on a page the browser brought back from its cache, as Back does. A Continue step
         * brought back that way after Continue was pressed holds a token that press most likely spent, so it goes back to
         * the address form rather than offering the same link again; one left another way keeps its link.
         *
         * @param {PageTransitionEvent} [event]
         */
        resetSending( event ) {
            const wasSending = this.sending;
            clearTimeout( this.sendingTimer );
            this.sending = false;
            if ( event && event.persisted && wasSending && this.step === "confirm" ) {
                this.askAgain();
            }
        }
    };
};

/**
 * Register on-initialization tasks for the Alpine.js framework.
 */
document.addEventListener( "alpine:init", () => {
    // Note: Sequence here is important!
    Alpine.directive( "text-label", configureDirectiveTextLabel() );
    Alpine.directive( "ti-chart", configureDirectiveTiChart() );
    Alpine.store( "tiToolbox", configureToolbox() );
    Alpine.store( "tiApplication", configureApplication() );
    Alpine.store( "tiComponentsConfig", {} );
    // After tiApplication, which both read as they start.
    Alpine.store( "tiWhatsNew", configureStoreWhatsNew() );
    Alpine.store( "tiScreenTrail", configureStoreScreenTrail() );
    Alpine.data( "tiApplication", () => ( {
        // Collapsing to icons is the column's feature. A visitor who collapsed the sidebar on a wide screen would
        // otherwise find a drawer of bare icons on a narrow one (CA-406).
        get collapsed() {
            const tiApplication = Alpine.store( "tiApplication" );
            return tiApplication.collapsed && !tiApplication.navigationDrawer;
        },
        get theme() {
            return Alpine.store( "tiApplication" ).theme;
        },
        toggleCollapse() {
            Alpine.store( "tiApplication" ).toggleCollapse();
        },
        toggleTheme() {
            Alpine.store( "tiApplication" ).toggleTheme();
        }
    } ) );
    Alpine.data( "tiComponentSidebarNav", configureSidebarNav );
    Alpine.data( "tiComponentTopbar", configureComponentTopbar );
    Alpine.data( "tiComponentBusyIndicator", configureComponentBusyIndicator );
    Alpine.data( "tiComponentNavigationToggle", configureComponentNavigationToggle );
    Alpine.data( "tiComponentSidebarFlyout", configureComponentSidebarFlyout );
    Alpine.data( "tiComponentNotificationBar", configureComponentNotificationBar );
    Alpine.data( "tiComponentTooltip", configureComponentTooltip );
    Alpine.data( "tiLoginError", configureLoginError );
    Alpine.data( "tiLoginEmailLink", configureLoginEmailLink );
    Alpine.data( "tiScreenProfile", configureScreenProfile );
    Alpine.data( "tiScreenAbout", configureScreenAbout );
    Alpine.data( "tiScreenWhatsNew", configureScreenWhatsNew );
    Alpine.data( "tiScreenSendFeedback", configureScreenSendFeedback );
    Alpine.data( "tiScreenFeedbackInbox", configureScreenFeedbackInbox );
} );
