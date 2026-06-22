"use strict";

// Empty key BEFORE requiring core modules so config resolves an empty securityHashKey.
process.env.TI_MESSAGE_EXCHANGE_SECURITY_HASH_KEY = "";

const { test } = require( "node:test" );
const assert = require( "node:assert" );
const logger = require( "../utils/logger.js" );

// Capture warnings emitted via logger.log.
const warnings = [];
const originalLog = logger.log;
logger.log = ( message, severity ) => { warnings.push( { message, severity } ); };

const MessageHandler = require( "../components/exchange/message-handler.js" );
const hashOf = ( msg ) => MessageHandler.prototype.createMessageHash.call( {}, msg );

test( "warns exactly once when the security hash runs with an empty/default key", () => {
    hashOf( { messageID: "m-1" } );
    hashOf( { messageID: "m-2" } ); // second call must NOT warn again
    const keyWarnings = warnings.filter( ( w ) => w.severity === logger.logSeverity.WARNING && /security hash/i.test( w.message ) );
    assert.strictEqual( keyWarnings.length, 1 );
    logger.log = originalLog;
} );
