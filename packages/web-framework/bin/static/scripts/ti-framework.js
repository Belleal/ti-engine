function isPlainObject( v ) {
    return Object.prototype.toString.call( v ) === '[object Object]';
}

function deepMerge( base, src ) {
    if ( !isPlainObject( base ) || !isPlainObject( src ) ) {
        // primitive, array, or non-plain object → src wins
        return structuredClone ? structuredClone( src ) : JSON.parse( JSON.stringify( src ) );
    }
    const out = { ...base };
    for ( const key of Object.keys( src ) ) {
        const b = base[ key ];
        const s = src[ key ];

        if ( Array.isArray( s ) ) {
            // replace arrays (not concat)
            out[ key ] = s.slice();
        } else if ( isPlainObject( s ) && isPlainObject( b ) ) {
            out[ key ] = deepMerge( b, s );
        } else if ( isPlainObject( s ) ) {
            out[ key ] = deepMerge( {}, s ); // clone object
        } else {
            out[ key ] = s; // primitives, dates, functions, etc. → override
        }
    }
    return out;
}

function getVisibleBox( isFixed ) {
    const docEl = document.documentElement;

    // Fixed coordinates are viewport-based (top/left = 0/0)
    if ( isFixed ) {
        if ( window.visualViewport ) {
            const vv = window.visualViewport;
            return {
                left: vv.offsetLeft, // CSS px, where the viewport begins relative to layout viewport
                top: vv.offsetTop,
                width: vv.width,
                height: vv.height,
                pageLeft: vv.pageLeft, // document coords
                pageTop: vv.pageTop
            };
        }
        return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight, pageLeft: window.scrollX, pageTop: window.scrollY };
    }

    // Absolute coordinates are document-based (top/left = scroll position)
    return {
        left: window.scrollX,
        top: window.scrollY,
        width: docEl.clientWidth,
        height: docEl.clientHeight,
        pageLeft: window.scrollX,
        pageTop: window.scrollY
    };
}

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
        //menuTitle: options.menuTitle ?? "Menu",
        //buttonConfigs: options.buttonConfigs ?? [],
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
                top = rect.top + ( this.fixed ? 0 : scrollY );
            } else if ( side === "left" ) {
                left = rect.left + ( this.fixed ? 0 : scrollX ) - pw - this.offset;
                top = rect.top + ( this.fixed ? 0 : scrollY );
            } else if ( side === "bottom" ) {
                top = rect.bottom + ( this.fixed ? 0 : scrollY ) + this.offset;
                left = rect.left + ( this.fixed ? 0 : scrollX );
            } else if ( side === "top" ) {
                top = rect.top + ( this.fixed ? 0 : scrollY ) - ph - this.offset;
                left = rect.left + ( this.fixed ? 0 : scrollX );
            }

            if ( align === "center" ) {
                left = rect.left + ( this.fixed ? 0 : scrollX ) + ( rect.width - pw ) / 2;
            } else if ( align === "end" ) {
                left = rect.right + ( this.fixed ? 0 : scrollX ) - pw;
            }

            const box = getVisibleBox( this.fixed );
            const coords = clampToBox( left, top, pw, ph, box, 10 );

            flyoutPanel.style.position = this.fixed ? "fixed" : "absolute";
            flyoutPanel.style.top = Math.round( coords.y ) + "px";
            flyoutPanel.style.left = Math.round( coords.x ) + "px";
        }
    };
};

document.addEventListener( "alpine:init", () => {
    Alpine.data( "tiComponentSidebarFlyout", configureComponentSidebarFlyout );
} );