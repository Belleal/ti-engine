# ti-engine changelog

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