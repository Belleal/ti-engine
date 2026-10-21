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
 * Covers the picture of the screen sent with feedback (1.58.0, CA-544), on the browser's side, driving the real script:
 * what the copy of the page keeps and blanks before it is drawn, when Send Feedback is held for the picture and when it
 * is not, how the picture is written within its limits, that nothing is sent unless the person ticks it, and that an
 * administrator's screen asks for a picture only to show it.
 */

const { describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const path = require( "node:path" );

const { loadTiFramework } = require( "./helpers/ti-framework-sandbox.js" );

const SVG = "http://www.w3.org/2000/svg";
const FRAGMENTS = path.join( __dirname, "..", "bin", "static", "fragments" );
const plain = ( value ) => JSON.parse( JSON.stringify( value ) );
const settle = () => new Promise( ( resolve ) => setTimeout( resolve, 0 ) );

/* A DOM just large enough for the redaction: elements with attributes, children and a style, text nodes, and `closest`
 * for the attribute selectors the script uses. Anything else it is asked fails loudly, so a test cannot pass by a
 * selector this does not understand. */

class FakeText {
    constructor( data ) {
        this.nodeType = 3;
        this.data = data;
        this.parentNode = null;
    }
}

class FakeElement {
    constructor( tag, attributes = {}, children = [], namespaceURI = "http://www.w3.org/1999/xhtml" ) {
        this.nodeType = 1;
        this.namespaceURI = namespaceURI;
        this.tagName = ( namespaceURI === SVG ) ? tag : tag.toUpperCase();
        this.attributeMap = new Map( Object.entries( attributes ) );
        this.childNodes = [];
        this.parentNode = null;
        this.styles = {};
        this.style = { setProperty: ( name, value ) => {
            this.styles[ name ] = value;
        } };
        this.value = ( attributes.value !== undefined ) ? attributes.value : undefined;
        children.forEach( ( child ) => this.append( typeof child === "string" ? new FakeText( child ) : child ) );
    }
    append( child ) {
        child.parentNode = this;
        this.childNodes.push( child );
    }
    // As the DOM lists them: `{ name, value }` each.
    get attributes() {
        return [ ...this.attributeMap ].map( ( [ name, value ] ) => ( { name, value } ) );
    }
    getAttribute( name ) {
        return this.attributeMap.has( name ) ? this.attributeMap.get( name ) : null;
    }
    setAttribute( name, value ) {
        this.attributeMap.set( name, String( value ) );
    }
    removeAttribute( name ) {
        this.attributeMap.delete( name );
    }
    hasAttribute( name ) {
        return this.attributeMap.has( name );
    }
    replaceChild( replacement, existing ) {
        const index = this.childNodes.indexOf( existing );
        assert.ok( index >= 0, "replaced a child it does not have" );
        replacement.parentNode = this;
        existing.parentNode = null;
        this.childNodes[ index ] = replacement;
    }
    closest( selector ) {
        const names = selector.split( "," ).map( ( part ) => {
            const match = /^\s*\[([\w-]+)\]\s*$/.exec( part );
            assert.ok( match, `a selector the fake DOM does not know: ${ part }` );
            return match[ 1 ];
        } );
        for ( let element = this; element && element.nodeType === 1; element = element.parentNode ) {
            if ( names.some( ( name ) => element.hasAttribute( name ) ) ) {
                return element;
            }
        }
        return null;
    }
    get textContent() {
        return this.childNodes.map( ( child ) => ( child.nodeType === 3 ) ? child.data : child.textContent ).join( "" );
    }
    set textContent( text ) {
        this.childNodes = [];
        this.append( new FakeText( text ) );
    }
}

const element = ( tag, attributes, ...children ) => new FakeElement( tag, attributes, children );
const svg = ( tag, attributes, ...children ) => new FakeElement( tag, attributes, children, SVG );

/**
 * A copy of a page as the library hands it over, with one of everything the rules speak of.
 *
 * @returns {{body: FakeElement, parts: Object}}
 */
function pageCopy() {
    const parts = {
        label: element( "h1", { "x-text-label": "interface.title", "x-bind:class": "titleClass", "x-on:click.outside": "close()", ":key": "item.id", "@click": "open()", "xmlns:xlink": "http://www.w3.org/1999/xlink" }, "Team results" ),
        bound: element( "p", { "x-text": "employee.name" }, "Mary Sample" ),
        fromServer: element( "span", {}, "Ivan Petrov, 42" ),
        mixed: element( "p", {}, element( "b", { "x-text-label": "interface.name" }, "Name" ), " Ivan Petrov" ),
        keptBlock: element( "div", { "data-ti-keep": "" }, element( "span", { "x-text": "statusName" }, "In review" ) ),
        redactedBlock: element( "div", { "data-ti-redact": "" }, element( "span", { "x-text-label": "interface.secret" }, "Kept label made secret" ) ),
        redactedPhoto: element( "div", { "data-ti-redact": "", class: "avatar" } ),
        email: element( "input", { type: "email", value: "mary@example.com" } ),
        untyped: element( "input", { value: "Mary" } ),
        checkbox: element( "input", { type: "checkbox", value: "on", checked: "" } ),
        textarea: element( "textarea", {}, "typed by\nMary" ),
        photo: element( "img", { src: "/photos/mary.jpg", srcset: "/photos/mary@2x.jpg 2x" } ),
        keptLogo: element( "img", { src: "/static/logo.svg", "data-ti-keep": "" } ),
        canvas: element( "canvas", {} ),
        chart: svg( "svg", {}, svg( "rect", { width: "40" } ), svg( "text", {}, "Ivan Petrov" ) ),
        select: element( "select", {}, element( "option", { "x-text-label": "interface.every" }, "Every kind" ), element( "option", {}, "Mary Sample" ) ),
        style: element( "style", {}, ".a { content: 'kept'; }" )
    };
    const body = element( "body", {}, ...Object.values( parts ) );
    body.ownerDocument = { createElement: ( tag ) => new FakeElement( tag ) };
    return { body, parts };
}

const textOf = ( node ) => ( node.nodeType === 3 ) ? node.data : node.childNodes.map( textOf ).join( "|" );

describe( "the copy of the page a picture is drawn from (CA-544)", () => {

    const { stores } = loadTiFramework();
    const { body, parts } = pageCopy();
    stores.tiScreenTrail.redact( body );

    it( "keeps a catalogue label and what an application marked kept", () => {
        assert.equal( textOf( parts.label ), "Team results" );
        assert.equal( textOf( parts.keptBlock ), "In review" );
        assert.equal( parts.keptLogo.getAttribute( "src" ), "/static/logo.svg" );
        assert.equal( textOf( parts.select.childNodes[ 0 ] ), "Every kind" );
        assert.equal( textOf( parts.style ), ".a { content: 'kept'; }", "a stylesheet is not drawn as text" );
    } );

    it( "blanks every other text, keeping its length, as a grey bar", () => {
        for ( const name of [ "bound", "fromServer" ] ) {
            const bar = parts[ name ].childNodes[ 0 ];
            assert.equal( bar.tagName, "SPAN", name );
            assert.equal( bar.styles.color, "transparent" );
            assert.equal( bar.styles[ "-webkit-text-fill-color" ], "transparent", "the copied fill colour would paint the x's" );
            assert.ok( bar.styles[ "background-color" ] );
        }
        assert.equal( textOf( parts.bound ), "xxxx xxxxxx" );
        assert.equal( textOf( parts.fromServer ), "xxxx xxxxxxx xx" );
        assert.equal( textOf( parts.mixed ), "Name| xxxx xxxxxx", "a label beside data keeps the label alone" );
    } );

    it( "blanks even a label inside what an application marked redacted", () => {
        assert.equal( textOf( parts.redactedBlock ), "xxxx xxxxx xxxx xxxxxx" );
    } );

    it( "draws what an application marked redacted grey, a photo set as a CSS background included", () => {
        // The README promised it and nothing did it: the photo was drawn (measured, the review pass).
        assert.equal( parts.redactedPhoto.styles[ "background-image" ], "none" );
        assert.ok( parts.redactedPhoto.styles[ "background-color" ] );
        assert.equal( parts.label.styles[ "background-image" ], undefined, "nothing else" );
    } );

    it( "shows typed values as bullets and leaves a checkbox's state", () => {
        assert.equal( parts.email.getAttribute( "value" ), "••••••••••••••••" );
        assert.equal( parts.email.value, "••••••••••••••••" );
        assert.equal( parts.untyped.getAttribute( "value" ), "••••", "an input with no type is a text input" );
        assert.equal( parts.checkbox.getAttribute( "value" ), "on" );
        assert.ok( parts.checkbox.hasAttribute( "checked" ) );
        assert.equal( parts.textarea.value, "••••• ••\n••••", "line breaks and spaces stay" );
    } );

    it( "turns images into grey boxes and hides other drawn media", () => {
        assert.match( parts.photo.getAttribute( "src" ), /^data:image\/gif;base64,/ );
        assert.equal( parts.photo.getAttribute( "srcset" ), null );
        assert.ok( parts.photo.styles[ "background-color" ] );
        assert.equal( parts.canvas.styles.visibility, "hidden" );
    } );

    it( "takes a chart's text and leaves its shapes, and reads an option's text as x", () => {
        assert.equal( textOf( parts.chart ), "|" );
        assert.equal( parts.chart.childNodes[ 0 ].getAttribute( "width" ), "40" );
        assert.equal( textOf( parts.select.childNodes[ 1 ] ), "xxxx xxxxxx" );
    } );

    it( "drops every attribute name XML cannot read, which left the whole picture empty, Alpine's shorthands too, and keeps the rest", () => {
        // Measured on a real screen: one `x-bind:class` and the browser refused the drawing as XML. `:key` and `@click`
        // were let through by the first rule, which wanted a name before the colon (the review pass).
        assert.deepEqual( parts.label.attributes.map( ( attribute ) => attribute.name ), [ "x-text-label", "xmlns:xlink" ] );
    } );

    it( "leaves nothing of any personal value anywhere in the copy", () => {
        const everything = JSON.stringify( textOf( body ) ) + JSON.stringify( [ parts.email, parts.untyped, parts.textarea, parts.photo ].map( ( part ) => [ part.value, part.attributes ] ) );
        for ( const secret of [ "Mary", "Ivan", "Petrov", "42", "example.com", "typed", "mary.jpg", "Kept label" ] ) {
            assert.ok( !everything.includes( secret ), secret );
        }
    } );

} );

describe( "the drawing, after the copy (CA-544)", () => {

    it( "blanks a pseudo-element's words and anything it computes, and keeps a mark", () => {
        // Measured: `content: attr(data-name)` and a literal both reached the picture, written into the drawing's own
        // stylesheet after the copy was redacted (the review pass).
        const { stores } = loadTiFramework();
        const style = { textContent: ".a::before { content: 'Mary Sample — '; color: red; } .b::after { content: attr(data-name); } .c::before { content: \"›\"; } .d::before { content: none; } .e::after { content: counter(step) }" };
        const symbolText = { textContent: "Ivan Petrov" };
        stores.tiScreenTrail.redactDrawing( { querySelectorAll: ( selector ) => ( selector === "style" ) ? [ style ] : [ symbolText ] } );
        assert.equal( style.textContent, ".a::before { content: \"xxxx xxxxxx — \"; color: red; } .b::after { content: \"xxx\"; } .c::before { content: \"›\"; } .d::before { content: none; } .e::after { content: \"xxx\"}" );
        assert.equal( symbolText.textContent, "", "an SVG symbol's text, copied in for a <use>" );
    } );

    it( "asks for no larger a picture than the server takes", () => {
        // Written on both sides; a change to one alone would have the server refuse every picture (the review pass).
        const Feedback = require( "../components/feedback.js" );
        const script = fs.readFileSync( path.join( __dirname, "..", "bin", "static", "scripts", "ti-framework.js" ), "utf8" );
        assert.equal( Number( /const PICTURE_MAX_SIDE = (\d+);/.exec( script )[ 1 ] ), Feedback.PICTURE_MAX_SIDE );
        assert.equal( Number( /const PICTURE_MAX_BYTES = (\d+);/.exec( script )[ 1 ] ), Feedback.PICTURE_MAX_BYTES );
    } );

} );

/**
 * The script loaded with stand-ins for what drawing needs: the library, a canvas that writes blobs of a given type and
 * size, a FileReader, the body's style, and timers the test fires.
 *
 * @param {Object} [options]
 * @param {function(string, number, number): {type: string, size: number}} [options.blob] What `toBlob` answers for a type, quality and width.
 * @param {function(Object, Object): Promise<Object>} [options.draw] The library's `domToCanvas`.
 * @param {boolean} [options.libraryLoaded] Whether the library's global is there already.
 * @returns {Object}
 */
function capturingShell( { blob = ( type ) => ( { type: type, size: 50000 } ), draw = null, libraryLoaded = true } = {} ) {
    const loaded = loadTiFramework();
    const { stores, sandbox } = loaded;
    const tiApplication = stores.tiApplication;
    tiApplication.configuration = { labels: {}, features: { feedback: true } };
    tiApplication.currentScreen = "reports";
    const canvas = ( width, height ) => ( {
        width: width,
        height: height,
        // Its width as it is when written: the script sizes a canvas it made after making it.
        toBlob( callback, type, quality ) {
            callback( blob( type, quality, this.width ) );
        },
        getContext: () => ( { drawImage: () => {} } )
    } );
    const drawn = [];
    const library = {
        domToCanvas: ( node, options ) => {
            drawn.push( { node, options } );
            return draw ? draw( node, options ) : Promise.resolve( canvas( 1280, 800 ) );
        }
    };
    if ( libraryLoaded ) {
        sandbox.modernScreenshot = library;
    }
    const appended = [];
    sandbox.document.body = { tag: "body" };
    sandbox.document.head = { appendChild: ( child ) => appended.push( child ) };
    sandbox.document.createElement = ( tag ) => {
        if ( tag === "canvas" ) {
            return canvas( 0, 0 );
        }
        const listeners = {};
        return { tag: tag, addEventListener: ( type, handler ) => {
            listeners[ type ] = handler;
        }, fire: ( type ) => listeners[ type ]() };
    };
    // The node's own `display` where the test gave one; the document's properties, two standard and one custom.
    sandbox.getComputedStyle = ( node ) => Object.assign( [ "color", "display", "--accent" ], { backgroundColor: "rgb(244, 241, 234)", display: ( node && node.display ) || "block" } );
    sandbox.FileReader = class {
        addEventListener( type, handler ) {
            this[ type ] = handler;
        }
        readAsDataURL( written ) {
            this.result = `data:${ written.type };base64,AAAA`;
            this.load();
        }
    };
    const timers = [];
    sandbox.setTimeout = ( callback, delay ) => timers.push( { callback, delay } );
    stores.tiScreenTrail.init();
    const confirm = ( detail ) => {
        const event = { detail: detail, prevented: false, preventDefault() {
            this.prevented = true;
        } };
        loaded.documentListeners.get( "htmx:confirm" ).forEach( ( handler ) => handler( event ) );
        return event;
    };
    const issued = [];
    const sendFeedback = () => confirm( { verb: "get", path: "/app/send-feedback", issueRequest: ( skip ) => issued.push( skip ) } );
    return Object.assign( loaded, { drawn, appended, timers, confirm, issued, sendFeedback, library, canvas } );
}

describe( "Send Feedback waits for the picture of the screen being left (CA-544)", () => {

    it( "holds the request, draws the screen as it is, and then sends the request on", async () => {
        const shell = capturingShell();
        const event = shell.sendFeedback();
        assert.equal( event.prevented, true );
        assert.deepEqual( shell.issued, [], "held while the screen is drawn" );
        await settle();
        assert.deepEqual( shell.issued, [ true ], "issued once, past the confirmation" );
        const { node, options } = shell.drawn[ 0 ];
        assert.equal( node.tag, "body" );
        assert.deepEqual( plain( [ options.width, options.height, options.scale, options.font, options.features ] ), [ 1280, 800, 1, false, { restoreScrollPosition: true, copyScrollbar: false } ] );
        assert.equal( typeof options.onCloneNode, "function" );
        const elementOf = ( tagName, display = "block", flyout = false ) => ( { nodeType: 1, tagName: tagName, display: display, matches: ( selector ) => flyout && selector === ".ti-sidebar-flyout" } );
        assert.equal( options.filter( elementOf( "DIV", "block", true ) ), false, "the menu used to get here is left out" );
        assert.equal( options.filter( elementOf( "TEMPLATE" ) ), false );
        assert.equal( options.filter( elementOf( "DIV", "none" ) ), false, "nothing that is not displayed" );
        assert.equal( options.filter( elementOf( "DIV", "contents" ) ), true, "display: contents draws its children" );
        assert.equal( options.filter( elementOf( "SPAN" ) ), true );
        assert.equal( options.filter( { nodeType: 3 } ), true );
        assert.ok( options.includeStyleProperties.includes( "color" ) && !options.includeStyleProperties.some( ( name ) => name.startsWith( "--" ) ), "standard properties alone" );
        assert.deepEqual( plain( shell.stores.tiScreenTrail.picture ), { url: "data:image/webp;base64,AAAA", type: "image/webp", bytes: 50000, width: 1280, height: 800 } );
    } );

    it( "closes the drawer used to reach it on a narrow screen, and leaves the drawer out; keeps the sidebar as a column", async () => {
        const sidebar = { nodeType: 1, tagName: "ASIDE", matches: ( selector ) => selector.split( "," ).map( ( part ) => part.trim() ).includes( ".ti-sidebar" ) };
        const narrow = capturingShell();
        const closed = [];
        narrow.stores.tiApplication.closeNavigation = () => closed.push( true );
        narrow.stores.tiApplication.navigationDrawer = true;
        narrow.stores.tiApplication.navigationOpen = true;
        narrow.sendFeedback();
        assert.deepEqual( closed, [ true ], "closed at once, before the copy is made" );
        await settle();
        assert.equal( narrow.drawn[ 0 ].options.filter( sidebar ), false, "a drawer lies over the screen and is not part of it" );

        const wide = capturingShell();
        wide.sendFeedback();
        await settle();
        assert.equal( wide.drawn[ 0 ].options.filter( sidebar ), true, "a column of the screen stays" );
    } );

    it( "draws at most 1600 pixels on the longer side, however dense the screen", async () => {
        const shell = capturingShell();
        shell.sandbox.devicePixelRatio = 2;
        shell.sendFeedback();
        await settle();
        assert.equal( shell.drawn[ 0 ].options.scale, 1600 / 1280 );
    } );

    it( "lets every other request, and Send Feedback where there is no screen to take, go at once", () => {
        const shell = capturingShell();
        const cases = [
            { verb: "post", path: "/app/send-feedback" },
            { verb: "get", path: "/app/reports" },
            { verb: "get", path: "/app/send-feedback-extra" }
        ];
        for ( const detail of cases ) {
            assert.equal( shell.confirm( Object.assign( { issueRequest: () => {} }, detail ) ).prevented, false, detail.path );
        }
        assert.equal( shell.confirm( { verb: "get", path: "/app/send-feedback" } ).prevented, false, "nothing to send on" );
        shell.stores.tiApplication.currentScreen = "send-feedback";
        assert.equal( shell.sendFeedback().prevented, false, "from Send Feedback itself" );
        shell.stores.tiApplication.currentScreen = "reports";
        shell.stores.tiApplication.configuration = { labels: {}, features: { feedback: false } };
        assert.equal( shell.sendFeedback().prevented, false, "feedback not turned on" );
        assert.equal( shell.drawn.length, 0 );
    } );

    it( "holds a request with its query, as htmx.ajax and a link both reach it", async () => {
        const shell = capturingShell();
        assert.equal( shell.confirm( { verb: "GET", path: "/app/send-feedback?from=menu", issueRequest: () => {} } ).prevented, true );
    } );

    it( "takes the picture when Send Feedback is opened through openScreen, before the new screen is named", async () => {
        // openScreen names the screen and pushes its URL before its request starts, so the hold saw "already on Send
        // Feedback" and took no picture: the sidebar's entries and What's new's links (the review pass).
        const shell = capturingShell();
        const opened = [];
        shell.sandbox.history = { pushState: ( state, title, url ) => opened.push( url ) };
        shell.sandbox.document.getElementById = () => null;
        shell.sandbox.htmx = { ajax: ( verb, url ) => {
            opened.push( `${ verb } ${ url }` );
            return Promise.resolve();
        } };
        shell.stores.tiApplication.openScreen( "send-feedback" );
        assert.equal( shell.drawn.length, 0, "the library is asked once the picture is under way" );
        assert.equal( shell.stores.tiApplication.currentScreen, "reports", "the screen being left, while it is drawn" );
        assert.deepEqual( opened, [] );
        await settle();
        assert.equal( shell.drawn.length, 1 );
        assert.ok( shell.stores.tiScreenTrail.picture );
        assert.deepEqual( opened, [ "/app/send-feedback", "get /app/send-feedback" ] );
        assert.equal( shell.stores.tiApplication.currentScreen, "send-feedback" );
    } );

    it( "lets another screen asked for meanwhile win, and drops the picture of the screen left", async () => {
        const shell = capturingShell();
        shell.sendFeedback();
        shell.documentListeners.get( "htmx:beforeRequest" ).forEach( ( handler ) => handler( { detail: { target: { id: "ti-content" } } } ) );
        await settle();
        assert.deepEqual( shell.issued, [], "Send Feedback would have replaced the screen asked for since" );
        assert.equal( shell.stores.tiScreenTrail.picture, null );
    } );

    it( "sends the form once when it is asked for twice while the picture is drawn, and shows the shell busy meanwhile", async () => {
        const shell = capturingShell();
        const busy = [];
        shell.stores.tiApplication._beginRequest = () => busy.push( "begin" );
        shell.stores.tiApplication._endRequest = () => busy.push( "end" );
        shell.sendFeedback();
        assert.equal( shell.sendFeedback().prevented, true, "the second request is held back too" );
        assert.deepEqual( busy, [ "begin" ], "busy while drawn: nothing else on the screen changes" );
        await settle();
        assert.deepEqual( shell.issued, [ true ], "once" );
        assert.equal( shell.drawn.length, 1 );
        assert.deepEqual( busy, [ "begin", "end" ] );
    } );

    it( "opens the form with no picture when drawing fails, or takes longer than 4 seconds", async () => {
        const failing = capturingShell( { draw: () => Promise.reject( new Error( "refused" ) ) } );
        failing.sendFeedback();
        await settle();
        assert.deepEqual( failing.issued, [ true ] );
        assert.equal( failing.stores.tiScreenTrail.picture, null );

        const slow = capturingShell( { draw: () => new Promise( () => {} ) } );
        slow.sendFeedback();
        await settle();
        assert.deepEqual( slow.issued, [], "still drawing" );
        const limit = slow.timers.find( ( timer ) => timer.delay === 4000 );
        assert.ok( limit, "a 4-second limit" );
        limit.callback();
        await settle();
        assert.deepEqual( slow.issued, [ true ] );
        assert.equal( slow.stores.tiScreenTrail.picture, null );
    } );

    it( "writes JPEG where the browser cannot write WebP", async () => {
        const shell = capturingShell( { blob: ( type ) => ( { type: ( type === "image/webp" ) ? "image/png" : type, size: 40000 } ) } );
        shell.sendFeedback();
        await settle();
        assert.equal( shell.stores.tiScreenTrail.picture.type, "image/jpeg" );
    } );

    it( "steps the quality down, then the size, to stay within 1,000,000 bytes, and gives up past that", async () => {
        const qualities = [];
        const shell = capturingShell( { blob: ( type, quality, width ) => {
            qualities.push( [ quality, width ] );
            return { type: type, size: ( width > 1000 ) ? 1200000 : 900000 };
        } } );
        shell.sendFeedback();
        await settle();
        assert.deepEqual( qualities, [ [ 0.82, 1280 ], [ 0.7, 1280 ], [ 0.55, 1280 ], [ 0.82, 960 ] ] );
        assert.deepEqual( plain( [ shell.stores.tiScreenTrail.picture.width, shell.stores.tiScreenTrail.picture.height, shell.stores.tiScreenTrail.picture.bytes ] ), [ 960, 600, 900000 ] );

        const hopeless = capturingShell( { blob: ( type ) => ( { type: type, size: 2000000 } ) } );
        hopeless.sendFeedback();
        await settle();
        assert.equal( hopeless.stores.tiScreenTrail.picture, null );
        assert.deepEqual( hopeless.issued, [ true ] );
    } );

    it( "loads the library the first time, from the framework's own static files", async () => {
        const shell = capturingShell( { libraryLoaded: false } );
        shell.sendFeedback();
        await settle();
        assert.equal( shell.appended.length, 1 );
        assert.equal( shell.appended[ 0 ].src, "/static/scripts/lib/modern-screenshot.min.js" );
        assert.deepEqual( shell.issued, [], "waiting for the library" );
        shell.sandbox.modernScreenshot = shell.library;
        shell.appended[ 0 ].fire( "load" );
        await settle();
        assert.deepEqual( shell.issued, [ true ] );
        assert.ok( shell.stores.tiScreenTrail.picture );
    } );

    it( "drops the picture once the person moves on from Send Feedback", async () => {
        const shell = capturingShell();
        shell.sendFeedback();
        await settle();
        shell.stores.tiApplication.currentScreen = "send-feedback";
        shell.effects.forEach( ( effect ) => effect() );
        assert.ok( shell.stores.tiScreenTrail.picture, "kept on the form" );
        shell.stores.tiApplication.currentScreen = "dashboard";
        shell.effects.forEach( ( effect ) => effect() );
        assert.equal( shell.stores.tiScreenTrail.picture, null );
    } );

} );

describe( "the Send Feedback form and the picture (CA-544)", () => {

    const form = () => {
        const loaded = loadTiFramework();
        const requests = [];
        const tiApplication = loaded.stores.tiApplication;
        tiApplication.configuration = { labels: {} };
        tiApplication.sendRequest = ( url, method, body ) => {
            requests.push( { url, method, body } );
            return Promise.resolve( { data: { feedbackID: "f-1" } } );
        };
        tiApplication.notify = () => {};
        const component = loaded.components.tiScreenSendFeedback();
        component.setKind( "problem" );
        component.setText( "It broke." );
        return Object.assign( loaded, { component, requests } );
    };

    it( "offers no picture when there is none", () => {
        const { component } = form();
        assert.equal( component.hasPicture, false );
        assert.equal( component.pictureURL, "" );
    } );

    it( "sends the picture only when the person ticks it, and then forgets it", async () => {
        const { component, stores, requests } = form();
        stores.tiScreenTrail.picture = { url: "data:image/webp;base64,AAAA", type: "image/webp" };
        assert.equal( component.hasPicture, true );
        assert.equal( component.attachPicture, false, "off until ticked" );
        component.send();
        await settle();
        assert.equal( "picture" in requests[ 0 ].body, false );

        component.another();
        component.setKind( "problem" );
        component.setText( "Again." );
        stores.tiScreenTrail.picture = { url: "data:image/webp;base64,AAAA", type: "image/webp" };
        component.setAttachPicture( true );
        component.send();
        await settle();
        assert.equal( requests[ 1 ].body.picture, "data:image/webp;base64,AAAA" );
        assert.equal( stores.tiScreenTrail.picture, null, "sent once" );
        assert.equal( component.attachPicture, false );
    } );

    it( "says what was blanked beside the option, and shows the picture only once it is ticked", () => {
        const html = fs.readFileSync( path.join( FRAGMENTS, "frame-send-feedback.html" ), "utf8" );
        assert.match( html, /<template x-if="hasPicture">/ );
        assert.match( html, /<input type="checkbox" id="ti-feedback-picture"[^>]*x-bind:checked="attachPicture"/ );
        assert.match( html, /<small class="ti-feedback-picture-note" x-text-label="interface\.send-feedback\.picture-note">/ );
        assert.match( html, /<img class="ti-feedback-picture-preview" x-show="attachPicture" x-bind:src="pictureURL"/ );
    } );

} );

describe( "the Feedback screen and a picture (CA-544)", () => {

    it( "asks for a picture only to show it, once, and hides and shows it again without asking", async () => {
        const loaded = loadTiFramework();
        const requests = [];
        const tiApplication = loaded.stores.tiApplication;
        tiApplication.configuration = { labels: {} };
        tiApplication.sendRequest = ( url ) => {
            requests.push( url );
            return Promise.resolve( { data: { feedbackID: "f-1", type: "image/webp", width: 40, height: 30, data: "AAAA" } } );
        };
        const inbox = loaded.components.tiScreenFeedbackInbox();
        const item = { feedbackID: "f-1", picture: { type: "image/webp", width: 40, height: 30 } };
        assert.equal( inbox.hasPicture( item ), true );
        assert.equal( inbox.hasPicture( { feedbackID: "f-2", picture: null } ), false );
        assert.equal( inbox.pictureShown( item ), false );
        assert.equal( inbox.pictureButtonText( item ), "Show the picture" );

        inbox.togglePicture( item );
        inbox.togglePicture( item );
        await settle();
        assert.deepEqual( requests, [ "/app/feedback-picture?feedbackID=f-1" ], "one request, however often it is pressed" );
        assert.equal( inbox.pictureShown( item ), true );
        assert.equal( inbox.pictureURL( item ), "data:image/webp;base64,AAAA" );
        assert.equal( inbox.pictureExpanded( item ), "true" );
        assert.equal( inbox.pictureButtonText( item ), "Hide the picture" );

        inbox.togglePicture( item );
        assert.equal( inbox.pictureShown( item ), false );
        inbox.togglePicture( item );
        assert.equal( inbox.pictureShown( item ), true );
        assert.equal( requests.length, 1 );
    } );

    it( "shows nothing it was not given as an image, and says why when it could not be had", async () => {
        const loaded = loadTiFramework();
        const tiApplication = loaded.stores.tiApplication;
        tiApplication.configuration = { labels: {} };
        const notified = [];
        tiApplication.notify = ( message ) => notified.push( message );
        tiApplication.formatException = () => "gone";
        tiApplication.sendRequest = ( url ) => url.endsWith( "f-1" )
            ? Promise.resolve( { data: { type: "image/svg+xml", data: "PHN2Zz4=" } } )
            : Promise.reject( new Error( "404" ) );
        const inbox = loaded.components.tiScreenFeedbackInbox();
        inbox.togglePicture( { feedbackID: "f-1", picture: {} } );
        inbox.togglePicture( { feedbackID: "f-2", picture: {} } );
        await settle();
        assert.equal( inbox.pictureShown( { feedbackID: "f-1" } ), false );
        assert.equal( inbox.pictureURL( { feedbackID: "f-1" } ), "" );
        assert.deepEqual( notified, [ "gone" ] );
    } );

} );
