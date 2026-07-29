/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * The capture form -- one primitive serving preorders, newsletter signups and beta-reader lists.
 *
 * Two things here are easy to get wrong and expensive to notice late:
 *
 * 1. The CSRF token is REQUIRED. The framework validates `body.csrfToken` on every state-changing request, so a
 *    capture form rendered without it is rejected with a 403 that looks like a mysterious form failure. The token
 *    comes from the session via the render context.
 * 2. Consent is unticked by default and never pre-checked. The checkbox is the consent; `consentAt` is stamped
 *    server-side when the record is written, so the timestamp cannot be forged by the client.
 *
 * `.field-invalid` goes on the `.field`, not the input, because the label and the error line both respond to it --
 * paired with aria-invalid and aria-describedby so the state is announced, not merely coloured.
 */

const { html, raw } = require( "#html" );

const STATUS_KINDS = new Set( [ "success", "duplicate", "error" ] );

/**
 * `capture` -- the email capture form. Hidden `purpose` / `edition` / `source` / `locale` inputs mirror the capture
 * schema so one endpoint serves every use.
 *
 * @param {Object} section
 * @param {Object} context
 * @returns {import("../html.js").SafeString}
 */
function renderCapture( section, context ) {
    const labels = ( context && context.labels ) || {};
    const idBase = section.formId || "capture";
    const emailId = idBase + "-email";
    const consentId = idBase + "-consent";
    const errorId = emailId + "-msg";

    const invalid = section.invalid === true;
    const fieldClasses = invalid ? "field field-invalid" : "field";
    const describedBy = invalid ? html` aria-invalid="true" aria-describedby="${ errorId }"` : raw( "" );

    const hint = section.hint ? html`<span class="field-hint">${ section.hint }</span>` : raw( "" );
    const error = invalid
        ? html`<span class="field-error" id="${ errorId }"><span class="field-error-mark" aria-hidden="true">◆</span> ${ section.errorMessage || labels.captureError || "" }</span>`
        : raw( "" );

    // Hidden fields, only emitted when they carry a value -- an empty hidden input is noise in the record.
    const hidden = [];
    if ( context && context.csrfToken ) {
        hidden.push( html`<input type="hidden" name="csrfToken" value="${ context.csrfToken }">` );
    }
    if ( section.purpose ) {
        hidden.push( html`<input type="hidden" name="purpose" value="${ section.purpose }">` );
    }
    if ( section.edition ) {
        hidden.push( html`<input type="hidden" name="edition" value="${ section.edition }">` );
    }
    if ( context && context.source ) {
        hidden.push( html`<input type="hidden" name="source" value="${ context.source }">` );
    }
    hidden.push( html`<input type="hidden" name="locale" value="${ ( context && context.lang ) || "en" }">` );

    const status = section.status ? renderFormStatus( section.status, section.statusTitle, section.statusBody ) : raw( "" );
    const intro = section.body ? html`<p class="capture-intro">${ section.body }</p>` : raw( "" );

    return html`${ intro }${ status }<form class="capture-form" method="post" action="${ section.action || "/capture" }">${ hidden }<div class="${ fieldClasses }"><label class="field-label" for="${ emailId }">${ section.emailLabel || labels.emailLabel || "Email address" }</label><input class="field-input" id="${ emailId }" type="email" name="email" autocomplete="email" required${ describedBy }>${ hint }${ error }</div><div class="field field-consent"><input class="field-checkbox" id="${ consentId }" type="checkbox" name="consent" value="1" required><label class="field-consent-text" for="${ consentId }">${ section.consentText || labels.consentText || "" }</label></div><button class="btn btn-accept" type="submit">${ section.submitLabel || labels.submitLabel || "Sign up" }</button></form>`;
}

/**
 * A post-submit status block. Duplicate is deliberately gold rather than scarlet: a returning reader did nothing
 * wrong, and colouring it like an error tells them they did.
 *
 * @param {string} kind  success | duplicate | error
 * @param {string} [title]
 * @param {string} [body]
 * @returns {import("../html.js").SafeString}
 */
function renderFormStatus( kind, title, body ) {
    if ( !STATUS_KINDS.has( kind ) ) {
        return raw( "" );
    }
    const heading = title ? html`<span class="form-status-title">${ title }</span>` : raw( "" );
    return html`<div class="form-status form-status-${ kind }"><span class="form-status-mark" aria-hidden="true">◆</span><span>${ heading }${ body || "" }</span></div>`;
}

module.exports = {
    renderCapture: renderCapture,
    renderFormStatus: renderFormStatus
};
