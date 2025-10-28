/**
 * Used to check if a value is a plain object.
 *
 * @method
 * @param {*} value
 * @returns {boolean}
 * @public
 */
function isPlainObject( value ) {
    return Object.prototype.toString.call( value ) === "[object Object]";
}

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
function deepMerge( base, source ) {
    if ( !isPlainObject( base ) || !isPlainObject( source ) ) {
        return ( typeof structuredClone === "function" ) ? structuredClone( source ) : JSON.parse( JSON.stringify( source ) );
    } else {
        const out = { ...base };
        for ( const key of Object.keys( source ) ) {
            const b = base[ key ];
            const s = source[ key ];

            if ( Array.isArray( s ) ) {
                out[ key ] = s.slice();
            } else if ( isPlainObject( s ) && isPlainObject( b ) ) {
                out[ key ] = deepMerge( b, s );
            } else if ( isPlainObject( s ) ) {
                out[ key ] = deepMerge( {}, s );
            } else {
                out[ key ] = s;
            }
        }
        return out;
    }
}

/**
 * Used to get the visible box of the document.
 *
 * @method
 * @param {boolean} isFixed
 * @returns {Object}
 * @public
 */
function getVisibleBox( isFixed ) {
    // Fixed coordinates are viewport-based (top/left = 0/0):
    if ( isFixed ) {
        if ( window.visualViewport ) {
            const viewport = window.visualViewport;
            return {
                left: viewport.offsetLeft, // CSS px, where the viewport begins relative to layout viewport
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
}

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
function clampToBox( x, y, w, h, box, edgePadding = 0 ) {
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
}

/**
 * Used to get a cookie value by name.
 *
 * @method
 * @param {string} name
 * @returns {string}
 * @public
 */
function getCookie( name ) {
    const cookie = document.cookie.match( new RegExp( "(?:^|; )" + name.replace( /[$()*+.?[\]\\^{}|]/g, "\\$&" ) + "=([^;]*)" ) );
    return cookie ? decodeURIComponent( cookie[ 1 ] ) : "";
}

/**
 * Returns a configuration object for the sidebar flyout component "component-sidebar-flyout.html".
 *
 * @method
 * @param {Object} options
 * @returns {Object}
 * @public
 */
let configureComponentSidebarFlyout = ( options = {} ) => {
    const TI_EVENT_CLOSE_ALL_FLYOUT = "ti-close-all-flyout";

    /** @type {Object} */
    return {
        placement: options.placement ?? "right-start",
        offset: options.offset ?? 10,
        fixed: options.fixed ?? true,
        isOpen: false,
        init() {
            this._reflow = this.reposition.bind( this );
            this._close = this.close.bind( this );
            window.addEventListener( "resize", this._reflow, { passive: true } );
            window.addEventListener( "scroll", this._reflow, { passive: true } );
            window.addEventListener( TI_EVENT_CLOSE_ALL_FLYOUT, this._close );
        },
        destroy() {
            window.removeEventListener( "resize", this._reflow );
            window.removeEventListener( "scroll", this._reflow );
            window.removeEventListener( TI_EVENT_CLOSE_ALL_FLYOUT, this._close );
        },
        toggle() {
            this.isOpen ? this.close() : this.open();
        },
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
        close() {
            if ( this.isOpen ) {
                this.isOpen = false;
                this.$nextTick( () => this.setAria() );
            }
        },
        setAria() {
            if ( !this.$refs.flyoutButton ) return;
            this.$refs.flyoutButton.setAttribute( "aria-expanded", String( this.isOpen ) );
        },
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

            const box = getVisibleBox( this.fixed );
            const coords = clampToBox( left, top, pw, ph, box, 10 );

            flyoutPanel.style.position = this.fixed ? "fixed" : "absolute";
            flyoutPanel.style.top = Math.round( coords.y ) + "px";
            flyoutPanel.style.left = Math.round( coords.x ) + "px";
        }
    };
};

/**
 * Returns a configuration object for the notifications component "component-notification-bar.html".
 *
 * @method
 * @returns {Object}
 * @public
 */
let configureComponentNotificationBar = () => {
    return {
        notifications: [],
        timers: {},
        add( notification ) {
            if ( notification && notification.id ) {
                this.remove( notification.id );
                this.notifications.push( notification );
                if ( typeof notification.timeout === "number" && notification.timeout > 0 ) {
                    this.timers[ notification.id ] = setTimeout( () => this.remove( notification.id ), notification.timeout );
                }
            }
        },
        remove( id ) {
            if ( id ) {
                this.notifications = this.notifications.filter( notification => notification.id !== id );
                if ( this.timers[ id ] ) {
                    clearTimeout( this.timers[ id ] );
                    delete this.timers[ id ];
                }
            }
        },
        destroy() {
            Object.keys( this.timers ).forEach( ( id ) => clearTimeout( this.timers[ id ] ) );
            this.timers = {};
            this.notifications = [];
        }
    };
};

/**
 * Returns a configuration object for the application management instance.
 *
 * @method
 * @returns {Object}
 * @public
 */
let configureApplication = () => {
    return {
        isInitialized: false,
        user: undefined,
        labels: {},
        notificationIDCounter: 1,
        init() {
            document.addEventListener( "ti:error", ( event ) => {
                this.notify( event.detail );
            } );

            this.sendRequest( "/app/config" ).then( ( result ) => {
                // TODO: use result to initialize the application
                this.labels = result?.data?.labels || {};
                this.isInitialized = true;
            } ).catch( ( error ) => {
                error.message = `Failed to initialize the application: ${ error.message }`;
                this.notify( error );
            } );
        },
        sendRequest( url, method = "GET" ) {
            return new Promise( ( resolve, reject ) => {
                const xsrf = getCookie( "ti-xsrf-token" ) || "";
                fetch( url, {
                    method: method,
                    headers: {
                        "Accept": "application/json",
                        "x-xsrf-token": xsrf
                    },
                    credentials: "same-origin",
                    cache: "no-store",
                } ).then( ( response ) => {
                    const contentType = ( response.headers.get( "content-type" ) || "" ).toLowerCase();
                    return ( contentType.includes( "application/json" ) ) ? response.json() : { isSuccessful: response.ok, message: response.statusText };
                } ).then( ( result ) => {
                    if ( result && result.isSuccessful === false ) {
                        reject( result );
                    } else {
                        resolve( result );
                    }
                } ).catch( ( error ) => {
                    reject( error );
                } );
            } );
        },
        notify( data ) {
            const notificationBar = document.querySelector( "#ti-notifications" );
            if ( notificationBar ) {
                Alpine.$data( notificationBar ).add( {
                    id: data?.exception?.id || this.notificationIDCounter++,
                    code: data?.exception?.code || 0,
                    message: data?.message || "Unexpected application error.",
                    timeout: data?.timeout || 60000
                } );
            }
        }
    };
};

/**
 * Perform a one-time configuration of the HTMX framework.
 */
document.addEventListener( "htmx:configRequest", ( event ) => {
    event.detail.headers[ 'x-xsrf-token' ] = getCookie( "ti-xsrf-token" ) || "";
    // Reuse the existing nonce from the active document:
    const styleNonce = ( htmx?.config?.inlineStyleNonce ) || "";
    const scriptNonce = ( htmx?.config?.inlineScriptNonce ) || "";
    event.detail.headers[ 'x-csp-nonce' ] = styleNonce || scriptNonce || "";
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
                tiApplication.notify( data );
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
    Alpine.store( "tiApplication", configureApplication() );
    Alpine.data( "tiComponentSidebarFlyout", configureComponentSidebarFlyout );
    Alpine.data( "tiComponentNotificationBar", configureComponentNotificationBar );
} );