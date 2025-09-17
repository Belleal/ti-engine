# ti-engine changelog

This document will contain the list of changes made to the framework. The format is based on the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) specification.

## Version 1.3.6
* feat(exceptions): add new exception code `E_GEN_INVALID_ARGUMENT_TYPE`
* feat(exceptions): add public enum with all HTTP codes. Also use it as type for the `httpCode` exception property
* feat(tools): add `description` property to enum objects
* feat(tools): add `contains` property to enum objects
* feat(tools): change enum factory behavior to create a copy of the seed object instead of modifying it
* refactor(exceptions): ensure `httpCode` setter accepts only valid values
* refactor(tools): deprecate method `getEnumName`. Use `name` property of the enum object itself
* refactor(tools)!: remove method `createCSVFile` as it is unnecessary for the framework's operation. It also eliminates the dependency from `fs-extra` package
* refactor(tools): ensure reserved keys cannot be used as enum names and make all properties non-enumerable
* fix(tools): fix a bug in the `RetryPolicy` class that caused the `maxAttempts` property to be ignored
* build(npm): update npm dependencies to their latest versions
* build(npm): remove `fs-extra` package as it is not used by the framework
* build(npm)!: bump the minimum supported Node.js version to 18.0.0

## Version 1.3.5
* fix(redis integration): fix a duplicated log entry on connection ready event if multiple observers are registered
* feat(service caller)!: change log level of error result in `process` method from `ERROR` to `DEBUG`. Implementers are expected to handle this and decide if the error should be propagated further or not
* docs: update and fix various issues with the `README.md` file

## Version 1.3.4
* fix(service instance): fix the way `ServiceConfiguration` is propagated via child classes and remove unnecessary defaults. Also update the relevant JSDoc

## Version 1.3.3
* feat(exceptions): add new parameter `includeData` to `Exception.asJSON` method which allows the exclusion of the data parameter from the returned JSON
* feat(exceptions): remove several excessive exception codes that were unlikely to be used
* fix(localization): add several missing exception labels

## Version 1.3.2
* feat(exceptions): add a set of new exception codes for the needs of any wrapping `web-server` standard communication
* feat(exception)!: change the default prefix path for exception labels to `system.exceptions.`
* feat(localization): add an Enum list of all language codes based on ISO 639-1 standard
* feat(localization): add an option to the `getLabel` method to provide the language code to use for localization. If not provided, the system will use the language code from the `localization.language` setting
* feat(localization)!: change the default structure of system labels from `labels.general.[...]` to `system.[...]`
* refactor(localization): add typedefs and JSDoc structure for the objects used in localization
* refactor(exceptions): refactor and fix various JSDoc descriptions
* refactor(auditing): change the type name of `LogEntry` to `TiLogEntry` and fix some JSDoc descriptions
* fix(exceptions): fix an issue which caused the exception to disregard the `description` value sent in the constructor and use the default one instead
* fix(config): fix an issue with the `TI_LOCALIZATION_LABELS_PATH` variable not respecting that the underlying setting expected an array. Now it is expected to be a single path and it will be wrapped into an array automatically
* fix(auditing): fix a potential problem with setting the log entry reporter from an ENV variable; instead, the system will now use the `ServiceInstance.instanceID` property

## Version 1.3.1
* feat(service caller): refactor the entire service call execution flow for clarity and better performance
* feat(service caller): create a new private class `ServiceCallProcessor` to handle individual service calls in a contained scope
* feat(message observer): add new property `priority` to the message observer class. It is used to determine the order in which the observers are notified about the messages
* feat(message observer)!: change method `onMessage` to now return the message it received. This allows for the message to be modified before it is passed to the next observer based on `priority`
* feat(message handler)!: change method `onMessage` to `notifyMessageObservers` for clarity. It now implements the `MessageObserver` functionality for prioritization and message modification
* fix(service caller): fix an issue which did not allow for a service call to be marked as completed thus being entered into the trace log as still pending
* fix(redis integration): remove hardcoded `#retryMaxAttempts` value in `#setupClient` method
* fix(redis integration): fix an issue which was setting the client status to `DISCONNECTED` during a normal shut down procedure

## Version 1.3.0
* feat(redis integration)!: change `reconnectOnError` behavior to also resubmit the failed command in case the error was of type `READONLY`
* feat(redis integration): improve the reliability and usage of the event notification mechanism for connection observers
* feat(redis integration): implement listener to the `end` event on Redis connection to capture when connection can no longer be recovered
* feat(redis integration): notify connection observers `onConnectionLost` event
* feat(redis integration): add redis client platform-specific status. It is used internally by the platform and can also be accessed via `redisClient.clientStatus` property
* feat(connection observer): add new event handler `onConnectionLost` that will be invoked when the observed connection is irrevocably lost
* feat(cache)!: implement `onConnectionLost` handler that will cause the service instance to immediately stop since it cannot work without the cache
* fix(service caller): fix multiple promise reject condition when a service call timed out and the service handler still attempted to complete with subsequent error
* fix(service instance): limit health check reporting to one attempt at a time to avoid unnecessary cache requests and log spam
* fix(redis integration): fix a multiple promise resolve condition on Redis `reconnect` event
* fix(redis integration): fix broken event propagation on `disrupted` events to some connection observers

## Version 1.2.5
* feat(cache): extend method `expireValue` to work with has set fields as well

## Version 1.2.4
* feat(cache): expose the cache module as export in `package.json`
* feat(cache): add method `hashDeleteField` to remove a hash-set field. This implements the `hdel` Redis command
* fix(tools): optimize method `stringifyJSON` not to call unnecessary decycling of the value if it's not an object
* fix(cache): replace `hmset` with `hset` Redis command in both methods that set hash-set values. Also remove unnecessary `_.isObjectLike` call in `hashSetFields` method

## Version 1.2.3
* feat(start instance): add support for providing a custom path to the `.env` file to be used at service startup as process argument. Accepted arguments are `--env`, `--env-file`, `--dotenv`, `--dotenv-path`, and `-e`. The path itself should be relative to the working directory and should include the file name

## Version 1.2.2
* feat(start instance): change package `dotenv` to `@dotenvx/dotenvx` for loading of ENV variables. The new package supports encrypting the ENV variables. For more information see https://dotenvx.com/docs/

## Version 1.2.1
* feat(localization): add support for adding custom labels to the localization system. These have to follow the same format as the system labels
* docs: add section about localization to the `README.md` file

## Version 1.2.0
* feat(config)!: change the setting `localization.labelsPath` to be an array of strings. It can now be used to supply any additional custom labels in one or more files to the framework
* feat(message memory cache): implement graceful exception handling during shut down procedure in `receiveMessage` and `sendMessage` methods
* fix(default message sender): add missing initialization of the memory cache on enable
* fix(default message receiver): add missing initialization of the memory cache on enable
* fix(message receiver): ensure `receive` method is no longer called recursively when the receiver has been disabled
* fix(redis integration)!: change the way the Redis client is initialized as the previous sequence was leaving unresolved promises and in some cases failed to fetch the Redis server settings. Also, it will now notify the listeners only once when the server settings are fetched and the connection is ready to be used
* fix(localization)!: change the way system labels are loaded as the previous implementation could cause a critical startup error if the working dir was different from expected
* fix(package): add the missing main export to the `start-instance.js` script. Without it was impossible to start the framework in specific cases like in a workspaces repository
* fix(message tracer): exclude `E_GEN_FEATURE_UNSUPPORTED` exception from the initialization of the message tracer exception handler
* fix(service executor)!: change the individual service registration process to ensure service registration does actually happen before the service provider finishes its initialization

## Version 1.1.10
* fix(cache): fix redis client creation sequence. It is now created inside the constructor as intended. It still needs to be initialized explicitly using the `initialize` method.

## Version 1.1.9
* feat(redis integration)!: change the way the `redis` client is initialized. Instead of happening automatically on class instantiation, it is now initialized on demand using the `initialize` method.
* feat(cache): change the way the main cache instance is initialized in compliance with the new redis integration
* feat(message memory cache)!: change the way the message memory cache is initialized in compliance with the new redis integration. The `initialize` method needs to be called explicitly to initialize the cache instance before it can be used.
* fix(message dispatcher): fix the way the `messageExchange` is initialized in the `MessageDispatcher` class (was not returning a promise)

## Version 1.1.8
* feat(auditing): change export of the singleton class in an `instance` variable for consistency and clarity
* feat(message dispatcher): change export of the singleton class in an `instance` variable for consistency and clarity
* feat(cache): change export of the singleton class in an `instance` variable for consistency and clarity
* feat(service executor): implement service registration retry policy

## Version 1.1.7
* feat(start instance): add support for the detection of `SIGBREAK` events and graceful shutdown on Windows
* feat(service instance)!: prevent the initialization of multiple `ServiceInstance` within the same process
* feat(message tracer)!: covert to singleton instance and add initialization method
* feat(message dispatcher): initialize the message tracer on start before message exchange is enabled
* fix(message tracer): optimize `recordTraceEntry` to not call set JSON command on every request
* fix(gcloud integration): fix the bool conversion of the `TI_GCLOUD_ENABLED` ENV variable
* fix(redis integration): update links to official commands documentation

## Version 1.1.6
* feat(start instance): add fail-fast mode as default behavior on promise unhandled rejections
* feat(start instance): implement functionality to derive safe default service domain name when none is provided in the configuration
* feat(config): add support for new ENV variable `TI_FAIL_FAST_ON_UNHANDLED_OFF` that controls the fail-fast mode
* feat(service instance): ensure instance ID naming standard is followed when creating new instances and no ID is provided in the configuration
* feat(redis integration): marked command `hmset` as deprecated (according to official documentation)
* feat(redis integration)!: change redis client default behavior: set to automatically resend all pending commands on connection recovery with no limit on the retry attempts. This behavior cannot be changed. Arguments `autoRetryUnfulfilled` and `maxRetries` have been removed from the constructor
* feat(redis integration)!: add options to configure redis connection retry policy. This can be controlled with two new arguments in the constructor `retryMaxIntervalMs` and `retryMaxAttempts`.
* feat(redis integration)!: improve and extend the behavior of pub/sub implementation functionality. The `subscribeCommand` method can now only subscribe once to the same channel. The client instance will keep a map of all channels it has subscribed to. To unsubscribe, use the `unsubscribeCommand` method
* feat(redis integration): add a `shutDown` method to gracefully close a redis connection. This is now used on instance shut down sequence as well as in the default message sender and receiver implementations
* fix(start instance): fix the logging of reason for unhandled rejections and multiple resolves
* fix(service instance): use the static service domain name to initialize the health check instead of the ENV variable
* fix(redis integration): add detection of ReJSON2 in the verification of JSON support in the redis server
* build(npm): update npm dependencies to their latest versions
* docs: add section about ENV variables to the `README.md` file

## Version 1.1.5

* fix(service instance): add overrides of the `reportHealthy` method in `ServiceConsumer` and `ServiceProvider` classes
* fix(tester): implement `reportHealthy` method
* docs(license): add a `LICENSE` file
* docs(license): change all licensing information in source files to GNU 3.0
* docs: improve the information in `README.md` file

## Version 1.1.4

* feat(service instance): expose method `reportHealthy` and mark it as virtual to allow for overrides with custom health status reporting logic

## Version 1.1.3

* feat(config)!: removed ENV variable `TI_OPERATION_MODE` as it was duplicating the practical purpose of `NODE_ENV`
* feat(config)!: setting `OPERATION_MODE` is now initialized by the `NODE_ENV` ENV variable (if provided)
* feat(service instance): show application operation mode in log at successful startup
* docs: add more sections and information in `README.md`

## Version 1.1.2

* feat(localization): add new functionality for localization based on labels and system language. It is currently utilized by the `exceptions` module for localizing the exception descriptions. The new `localization` module can also be accessed externally in the implementing application's files via standard import
* feat(config): add new setting `localization.labelsPath` that specifies the file path for the localization labels
* feat(config): add new setting `localization.language` that specifies the language to be used for the labels
* feat(config): add new ENV variable `TI_LOCALIZATION_LABELS_PATH` that controls the `localization.labelsPath` setting
* feat(config): add new ENV variable `TI_LOCALIZATION_LANGUAGE` that controls the `localization.language` setting
* feat(logger): log exception label instead of system-level description
* fix(start instance): fix the order of ENV loading in the `start-instance.js` script. It will now properly load the `.env` file first and then proceed with any configuration overrides in `config` module
* fix(service provider): normalize service file paths on dynamic service handler loading
* build(npm): update npm dependencies to their latest versions

## Version 1.1.1

* feat(config): add new ENV variable `TI_AUDITING_LOG_DETAILS` that controls the `auditing.logDetails` setting
* feat(service provider): add a method that returns a list of the currently registered services
* feat(tester service): improved the structure, configuration, and inline docs of tester service
* fix(logger): fix the way Exception is logged when it's a part of the main logging data object
* docs(readme): expanded the general documentation in `README.md` with a new section and improved many of the older sections
* docs: improved some of the JSDoc definitions across the framework

## Version 1.1.0

* feat(redis integration): implement better process for fetching and storing the remote Redis server settings and enabled features
* feat(redis integration): add getter method `serverVersion` that returns the Redis server version
* feat(redis integration): add support for RedisJSON functionality
* feat(redis integration): add getter method `isJSONSupported` to verify if this module is enabled/supported in Redis server
* feat(redis integration): add separate enum for override modes `TiRedisOverrideMode`
* feat(redis integration): add support for executing any single command in Redis that is otherwise unsupported by the underlying framework. Use method `callCommand` for that in case you need to access something more exotic or currently unimplemented
* feat(cache): add support for working with JSON values. Currently supporting operations `set`, `get`, and `append array` with more coming in future versions
* feat(cache): add support for setting manual expiration of values
* feat(message tracer): change log level of trace entries from `DEBUG` to `NOTICE` for all events
* feat(message tracer): add functionality for storing the trace entries in the `cache` in JSON format. This is the default behavior and will always work. Traces can later be retrieved from the `cache` for further processing by specialized application
* feat(message tracer): add new property `traceTimestamp` to the trace entries as it may differ from the actual message timestamp
* feat(config): add new setting `messageExchange.traceExpirationTime` that controls the preservation time for all trace entries. Default is one hour and will be refreshed every time a new trace is generated. Setting this to `0` will disable
  expiration altogether
* feat(config): add new setting `messageExchange.traceRepository` that specifies the name of the key in `cache` that will store the trace entries. The default one should be sufficient for most cases
* feat(config): change default of setting `messageExchange.traceLogEnabled` to `false`. With this change trace entries will not be written to the standard log output
* feat(exceptions): add new exception code `1006` as `E_GEN_FEATURE_UNSUPPORTED` to indicate functionality that is unsupported by the system or integrated application
* refactor(config)!: correct the name of the ENV variable controlling `memoryCache.user` to `TI_MEMORY_CACHE_USER` from previous `MEMORY_CACHE_USER`
* build(npm): update npm development dependencies to their latest versions
* docs: update some JSDoc types and other entries to reflect the current state of the code

## Version 1.0.14

* feat(message exchange): improve the behavior of `onConnectionRecovered` and `onConnectionDisrupted` events in modules `cache`, `message-handler` and `service-executor` to prevent cross-activation or deactivation
* feat(redis integration): improve Redis integration for greater stability, support of Redis Cloud, and support for Redis 7
* feat(config): enable setting `auditing.logDetails` by default for all logs
* docs: update general documentation

## Version 1.0.13

* build(npm): update npm dependencies to their latest versions

## Version 1.0.12

* build(npm): update npm dependencies to their latest versions

## Version 1.0.11

* feat(message exchange): implement message tampering and insertion protection
* feat(config): provide option to turn on/off the message tampering and insertion protection
* feat(config): provide option to turn on/off message tracing
* build(npm): update npm dependencies to their latest versions
* refactor(config)!: rename all environment variables that set configuration settings to match their related setting
* docs: add a change log

## Version 1.0.0

* feat: create initial version of the framework