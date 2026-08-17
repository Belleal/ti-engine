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
 * Express handler factories for the admin configuration-management API. Each factory takes the {@link ConfigService}
 * to delegate to (injected so the handlers are unit-testable), and returns an Express middleware that responds in the
 * framework's convention — `{ isSuccessful: true, data }` on success — forwarding errors to the error middleware.
 * Validation failures come back as `data` (`{ ok:false, errors }`) so the UI can render field-level messages; a
 * version conflict maps to `409` and an unknown editor/document/change-set to `404`. These routes are gated by the
 * `requireAdmin` guard and inherit the server's global auth + CSRF middleware.
 *
 * @module admin-config-handlers
 */

const exceptions = require( "@ti-engine/core/exceptions" );

/** @import ConfigService from "#config-service" */
/** @import { ExpressHandler } from "#web-handlers" */

function sendData( response, data ) {
    response.set( "Cache-Control", "no-store" );
    response.set( "Content-Type", "application/json; charset=utf-8" );
    response.status( exceptions.httpCode.C_200 ).send( { isSuccessful: true, data: data } );
}

function forward( next, error ) {
    const reason = error && error.data && error.data.reason;
    const raised = exceptions.raise( error );
    if ( reason === "version-conflict" ) {
        raised.httpCode = exceptions.httpCode.C_409;
    } else if ( reason === "unknown-editor" || reason === "unknown-changeset" || reason === "unknown-config" ) {
        raised.httpCode = exceptions.httpCode.C_404;
    }
    next( raised );
}

function adminID( request ) {
    return ( request.session && request.session.user ) ? request.session.user.userID : undefined;
}

/**
 * @param {ConfigService} service
 * @returns {ExpressHandler}
 */
module.exports.listEditors = ( service ) => ( request, response, next ) => {
    try {
        sendData( response, service.listEditors() );
    } catch ( error ) {
        forward( next, error );
    }
};

module.exports.composeView = ( service ) => ( request, response, next ) => {
    service.composeView( request.params.editorKey ).then( ( view ) => sendData( response, view ) ).catch( ( error ) => forward( next, error ) );
};

module.exports.saveEditorEdit = ( service ) => ( request, response, next ) => {
    const body = request.body || {};
    service.saveEditorEdit( request.params.editorKey, body.edited, { adminID: adminID( request ), note: body.note }, body.expectedVersions ).then( ( result ) => sendData( response, result ) ).catch( ( error ) => forward( next, error ) );
};

module.exports.getCurrent = ( service ) => ( request, response, next ) => {
    service.getCurrent( request.params.configKey ).then( ( current ) => sendData( response, current ) ).catch( ( error ) => forward( next, error ) );
};

module.exports.getHistory = ( service ) => ( request, response, next ) => {
    service.getHistory( request.params.configKey ).then( ( history ) => sendData( response, history ) ).catch( ( error ) => forward( next, error ) );
};

module.exports.listChanges = ( service ) => ( request, response, next ) => {
    service.listChanges().then( ( changes ) => sendData( response, changes ) ).catch( ( error ) => forward( next, error ) );
};

module.exports.getChange = ( service ) => ( request, response, next ) => {
    service.getChange( request.params.changeSetID ).then( ( change ) => sendData( response, change ) ).catch( ( error ) => forward( next, error ) );
};

module.exports.restoreChangeSet = ( service ) => ( request, response, next ) => {
    const body = request.body || {};
    service.restoreChangeSet( request.params.changeSetID, { adminID: adminID( request ), note: body.note } ).then( ( result ) => sendData( response, result ) ).catch( ( error ) => forward( next, error ) );
};

module.exports.exportBundle = ( service ) => ( request, response, next ) => {
    service.exportBundle( { adminID: adminID( request ) } ).then( ( bundle ) => {
        response.set( "Cache-Control", "no-store" );
        response.set( "Content-Type", "application/json; charset=utf-8" );
        response.set( "Content-Disposition", "attachment; filename=\"config-export.json\"" );
        response.status( exceptions.httpCode.C_200 ).send( JSON.stringify( bundle, null, 2 ) );
    } ).catch( ( error ) => forward( next, error ) );
};

/**
 * `GET /admin/config/drift` — drift summaries for every registered document.
 *
 * @param {ConfigService} service
 * @returns {ExpressHandler} The Express handler.
 */
module.exports.listDrift = ( service ) => ( request, response, next ) => {
    service.listDrift().then( ( drift ) => sendData( response, drift ) ).catch( ( error ) => forward( next, error ) );
};

/**
 * `GET /admin/config/drift/:configKey` — one document's drift, including the full entry list.
 *
 * @param {ConfigService} service
 * @returns {ExpressHandler} The Express handler.
 */
module.exports.getDrift = ( service ) => ( request, response, next ) => {
    service.getDrift( request.params.configKey ).then( ( drift ) => sendData( response, drift ) ).catch( ( error ) => forward( next, error ) );
};

/**
 * `POST /admin/config/drift/apply` — applies the file defaults for the named documents as one change-set.
 *
 * @param {ConfigService} service
 * @returns {ExpressHandler} The Express handler.
 */
module.exports.applyDefaults = ( service ) => ( request, response, next ) => {
    const body = request.body || {};
    service.applyDefaults( body.configKeys, { adminID: adminID( request ), note: body.note } ).then( ( result ) => sendData( response, result ) ).catch( ( error ) => forward( next, error ) );
};
