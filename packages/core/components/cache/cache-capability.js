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

const tools = require( "#tools" );

/**
 * Enum for listing the optional behaviors a cache backend may or may not provide.
 * <br/>
 * NOTE: A backend declares what it supports through {@link CacheProvider#capabilities}; an application declares what it
 * requires through the 'memoryCache.requiredCapabilities' setting. The two are reconciled once, during startup, so that
 * a backend which cannot do what the application needs fails where somebody is watching rather than inside a request
 * weeks later.
 *
 * @readonly
 * @enum {string}
 * @typedef {string} TiCacheCapability
 */
const cacheCapabilityEnum = tools.enum( {
    KEY_EXPIRY: [ "key-expiry", "key expiry", "Per-key time-to-live." ],
    KEY_PATTERN_MATCH: [ "key-pattern-match", "key pattern match", "Enumerating stored keys by glob pattern." ],
    LISTS: [ "lists", "lists", "Ordered list values." ],
    SETS: [ "sets", "sets", "Unordered set values, membership tests and unions." ],
    HASH_FIELDS: [ "hash-fields", "hash fields", "Field-addressable hash values." ],
    JSON_DOCUMENTS: [ "json-documents", "JSON documents", "JSON documents addressed by JSONPath." ],
    ATOMIC_JSON_EDIT: [ "atomic-json-edit", "atomic JSON edit", "A JSONPath edit applied atomically by the backend rather than as a read-modify-write." ]
} );

module.exports.cacheCapability = cacheCapabilityEnum;
