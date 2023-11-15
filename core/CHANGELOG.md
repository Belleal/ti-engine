# ti-engine changelog

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