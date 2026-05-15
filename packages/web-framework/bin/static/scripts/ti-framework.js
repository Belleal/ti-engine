/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/**
 * @typedef {Object} SidebarFlyoutConfig
 * @property {string} menuTitle
 * @property {number} [offset]
 * @property {string} icon
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
 * @constant
 * @type {SidebarFlyoutConfig}
 */
const configSidebarApplicationMenu = {
    menuTitle: "Application Menu",
    offset: 20,
    icon: "app-menu",
    buttonConfigs: [ {
        title: "Error",
        icon: "error",
        action: {
            href: "/app/error",
            target: "#ti-content",
            swap: "innerHTML"
        }
    }, {
        title: "Profile",
        icon: "user-profile",
        action: {
            href: "/app/profile",
            target: "#ti-content",
            swap: "innerHTML"
        }
    }, {
        title: "Settings",
        icon: "settings",
        action: {
            href: "/app/administration",
            target: "#ti-content",
            swap: "innerHTML"
        }
    }, {
        title: "Logout",
        icon: "logout",
        action: {
            href: "/logout",
            method: "post",
            target: "body",
            swap: "outerHTML"
        }
    } ]
};

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
         * Used to format a system string date value into a display string.
         *
         * @method
         * @param {string} value
         * @param {string} placeholder
         * @returns {string}
         * @public
         */
        formatDate( value, placeholder = "" ) {
            const normalized = /^\d{4}-\d{2}-\d{2}$/.test( value )
                ? `${ value }T00:00:00`
                : value;
            const date = new Date( normalized );
            return this.isValidDate( date ) ? date.toLocaleDateString() : placeholder;
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
         * NOTE: If 'structuredClone' is not available, fall back to JSON.parse/JSON.stringify. The later will not preserve non-JSON-serializable.
         *
         * @method
         * @param {Object} value
         * @param {Object} [options]
         * @returns {Object}
         * @public
         */
        structuredClone( value, options ) {
            return ( typeof structuredClone === "function" ) ? structuredClone( value, options ) : JSON.parse( JSON.stringify( value ) );
        },

        /**
         * Deterministically maps a seed value (e.g. employeeID) to an HSL color string.
         * The result is stable across sessions and consistent for the same seed.
         *
         * @method
         * @param {string|number} seed
         * @returns {string} HSL color string
         * @public
         */
        generateAvatarColor( seed ) {
            const str = String( seed ?? "" );
            let hash = 0;
            for ( let i = 0; i < str.length; i++ ) {
                hash = ( ( hash << 5 ) - hash + str.charCodeAt( i ) ) | 0;
            }
            const hue = Math.abs( hash ) % 360;
            return `hsl(${ hue }, 60%, 48%)`;
        },

        generateAvatarClass( seed ) {
            const str = String( seed ?? "" );
            let hash = 0;
            for ( let i = 0; i < str.length; i++ ) {
                hash = ( ( hash << 5 ) - hash + str.charCodeAt( i ) ) | 0;
            }
            return `competence-ac-${ Math.abs( hash ) % 12 }`;
        }

    };
};

/**
 * Returns a configuration object for the sidebar flyout component "component-sidebar-flyout.html".
 *
 * @method
 * @param {Object} options
 * @returns {Object}
 * @public
 */
const configureComponentSidebarFlyout = ( options = {} ) => {
    const tiToolbox = Alpine.store( "tiToolbox" );
    const TI_EVENT_CLOSE_ALL_FLYOUT = "ti-close-all-flyout";

    /**
     * @typedef {Object} TiSidebarFlyout
     */
    return {
        placement: options.placement ?? "right-start",
        offset: options.offset ?? 10,
        fixed: options.fixed ?? true,
        icon: options.icon ?? "app-menu",
        isOpen: false,

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

            const [ side, align = "start" ] = this.placement.split( "-" );
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

            const box = tiToolbox.getVisibleBox( this.fixed );
            const coords = tiToolbox.clampToBox( left, top, pw, ph, box, 10 );

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

        init() {
            const tiApplication = Alpine.store( "tiApplication" );

            const updateTitle = () => {
                const screen = ( tiApplication && tiApplication.currentScreen ) || "";
                const title = screen ? tiApplication.getLabel( `interface.topbar.${ screen }`, "" ) : "";
                this.screenTitle = title;
                if ( title ) {
                    document.title = title;
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
            this.$watch( () => tiApplication.isInitialized, updateTitle );
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
    const DEFAULT_THEME = "daylight";

    const tiToolbox = Alpine.store( "tiToolbox" );

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
        let key = keys.shift();
        if ( labels && typeof labels === "object" && key && Object.prototype.hasOwnProperty.call( labels, key ) ) {
            const value = labels[ key ];
            if ( typeof value === "string" ) {
                return keys.length === 0 ? value : fallback;
            }
            if ( value && typeof value === "object" ) {
                return extractLabel( value, keys, fallback );
            }
        }
        return fallback;
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
        notificationIDCounter: 1,
        requestControllers: new Map(),
        collapsed: false,
        theme: DEFAULT_THEME,

        /**
         * Used to initialize the web application.
         */
        init() {
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
                this.configuration = result?.data || {};
                return ( this.configuration?.auth?.isAuthenticated ) ? this.sendRequest( "/me" ) : {};
            } ).then( ( result ) => {
                this.user = result?.data?.user || null;
                this.isInitialized = true;
            } ).catch( ( error ) => {
                if ( error?.name === "AbortError" || error?.isAborted ) {
                    return;
                }

                this.user = null;
                this.isInitialized = false;
                this.notify( this.getLabel( "error.application.init-failed" ) + this.formatException( error ) );
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
                } );
            } );
        },

        /**
         * Redirect the user to the specified screen.
         *
         * @method
         * @param {string} screen
         * @public
         */
        openScreen( screen ) {
            const [ basePath, ...queryParts ] = ( screen || "" ).split( "?" );
            const query = queryParts.length ? "?" + queryParts.join( "?" ) : "";
            if ( !basePath || !/^[\w-]+$/.test( basePath ) || !window.htmx ) {
                window.location.href = "/";
            } else {
                const screenUrl = "/app/" + basePath + query;
                window.htmx.ajax( "get", screenUrl, { target: "#ti-content", swap: "innerHTML" } ).then( () => {
                    window.history.pushState( null, "", screenUrl );
                    this.currentScreen = basePath;
                } ).catch( () => {
                    window.location.href = "/";
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
            }
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
         * Used to format an exception notification message.
         *
         * @method
         * @param {Object} error
         * @returns {string}
         * @public
         */
        formatException( error ) {
            return this.getLabel( ( error.exception?.code === 5005 && error.exception?.data ) ? error.exception.data.details : error.exception?.label );
        },

        /**
         * Used to display a notification in the notification bar.
         *
         * @method
         * @param {string} message
         * @param {number} [timeout=6000]
         * @public
         */
        notify( message, timeout = 6000 ) {
            const notificationBar = document.querySelector( "#ti-notifications" );
            if ( notificationBar ) {
                Alpine.$data( notificationBar ).add( {
                    id: this.notificationIDCounter++,
                    message: message || this.getLabel( "error.application.unexpected" ),
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

/**
 * Register on-initialization tasks for the Alpine.js framework.
 */
document.addEventListener( "alpine:init", () => {
    const defaultComponentConfig = {
        menuTitle: "Menu",
        placement: "right-start",
        offset: 10,
        fixed: true,
        buttonConfigs: []
    };

    // Note: Sequence here is important!
    Alpine.directive( "text-label", configureDirectiveTextLabel() );
    Alpine.store( "tiToolbox", configureToolbox() );
    Alpine.store( "tiApplication", configureApplication() );
    Alpine.store( "tiComponentsConfig", {
        sidebarApplicationMenu: Alpine.store( "tiToolbox" ).deepMerge( defaultComponentConfig, configSidebarApplicationMenu )
    } );
    Alpine.data( "tiApplication", () => ( {
        get collapsed() {
            return Alpine.store( "tiApplication" ).collapsed;
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
    Alpine.data( "tiComponentSidebarFlyout", configureComponentSidebarFlyout );
    Alpine.data( "tiComponentNotificationBar", configureComponentNotificationBar );
    Alpine.data( "tiComponentTooltip", configureComponentTooltip );
} );
