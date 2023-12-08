# ti-engine core

Flexible framework for the creation of microservices with [node.js](https://nodejs.org/).

## Introduction

The **ti-engine** is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using **node.js**. The architectural concept of the framework is based on a standard _messaging system_ that allows for certain customization but also provides predictability and traceability of its behavior.

## Why ti-engine?

The framework is created based on a decade of professional experience with the utilized technologies and architectural approach. It's primary goal is to provide you with a lightweight and flexible solution that can help you build quickly a microservice ecosystem with any degree of size and complexity.

This is what you gain by using **ti-engine** in your project:

* Simplicity - begin productive work within minutes and get to codding you business logic
* Flexibility - go as complex as you need to in your implementation
* Reliability - message exchange between the services is constantly tracked across the entire ecosystem
* Security - messages are encrypted in transit and cannot be modified by external agents
* Scalability - serve mullions of requests by multiplying stateless service instances (hardware limitations still apply)
* Containerization - go with containers from the very start as the framework is designed to work in such an environment

These are just some benefits **ti-engine** offers. Get to know it better to find out more ways in which it can help you improve productivity.

## Prerequisites & installation

Being a messaging system, the **ti-engine** relies on a message broker for the actual exchange of messages between microservice instances. The default implementation of the framework uses [Redis](https://redis.io/) cache, however, you could create your own implementation using something like [Rabbit MQ](https://www.rabbitmq.com/). See the [Advanced topics](#advanced-topics) section of this documentation for guides on how to do this. For now let's focus on the default setup.

In order to run the basic ti-engine framework you will need a couple of things:

* A local [node.js installation](https://nodejs.org/en/download/) with a minimum version of **14.17.0**
* A local or remote [Redis cache installation](https://redis.io/download) with a minimum version of **5.0.14**

If you are working under Windows 10+ OS and you need to install Redis, take a look at this [guide](https://redis.com/blog/redis-on-windows-10/). You could also use [Redis Cloud](https://app.redislabs.com/) for development purposes as it offers free basic account. You can configure your connection to remote Redis server using the following ENV variables:

* `TI_MEMORY_CACHE_AUTH_KEY` can be used to provide the Redis password if there is any at all.
* `TI_MEMORY_CACHE_REDIS_DB` can be used to specify the Redis DB you want to use. Make sure to set the correct number as for example Redis Cloud only uses DB `0`.
* `TI_MEMORY_CACHE_REDIS_HOST` can be used to provide the remote host. This can be an IP or URL depending on your setup.
* `TI_MEMORY_CACHE_REDIS_PORT` can be used to provide the remote port. By default, Redis uses `6379` however many implementations might use a custom port that needs to be specified in the connection settings.

To get the framework itself, use the command `npm install @ti-engine/core`. And to include it directly in your package.json dependencies execute `npm install @ti-engine/core --save-prod`.

## Getting started

To start using the **ti-engine**, you will have to make sure that all prerequisites are available and operational. However, before we get to the fun part you need to also consider a couple of very important things while working with this framework:

1. The runtime configuration of the framework can be customized using ENV variables. These can be provided to node.js in all the standard ways, but there is also an option to include an `.env` file.
2. It loads your framework-related custom scripts and files dynamically, but it always assumes their provided paths are relative to the _current working directory_ (i.e. it uses `process.cwd()`). Be mindful of that whenever you declare file paths in the various settings.

Once you have everything else ready, you should download the **ti-engine** tester module with the command `npm install @ti-engine/tester`. The tester module packages an example microservice that shows the basic approach for using the framework. To make sure everything is working properly, you should try and start the tester service:

1. Open a command prompt and navigate to the directory of the tester module; it should be something like that:
   `[path to your project]/node_modules/@ti-engine/tester`
2. Execute the following command `node ../core/bin/start-instance.js`. Keep in mind that the working directory for the node process has to be the one specified in point 1. Otherwise, you'll get errors that certain files cannot be found and loaded.
3. If everything was done properly, you should see the following output:

```text
[timestamp]: [instance-id] - notice - Starting new instance of type 'tester-service' with instance ID '[instance-id]'.
[timestamp]: [instance-id] - info - Starting service registration process. There is NO default service handler provided.
[timestamp]: [instance-id] - info - Registration of defined services completed with 2 successful out of 2 total.
[timestamp]: [instance-id] - notice - Instance '[instance-id]' started successfully.
   » {"nodeVersion":[node-version]}
[timestamp]: [instance-id] - info - Connection to Redis server 127.0.0.1:6379 (re)established by client 'connection-msg-responses-out' and is ready to be used.
[timestamp]: [instance-id] - info - Connection to Redis server 127.0.0.1:6379 (re)established by client 'system-cache' and is ready to be used.
[timestamp]: [instance-id] - info - Connection to Redis server 127.0.0.1:6379 (re)established by client 'connection-msg-requests-in' and is ready to be used.
[timestamp]: [instance-id] - info - Connection to Redis server 127.0.0.1:6379 (re)established by client 'connection-msg-requests-out' and is ready to be used.
[timestamp]: [instance-id] - info - Connection to Redis server 127.0.0.1:6379 (re)established by client 'connection-msg-responses-in' and is ready to be used.
[timestamp]: [instance-id] - notice - Execution of service1 result:
   » {"isSuccessful":true,"payload":{"s1Timestamp":[timestamp]}}
[timestamp]: [instance-id] - notice - Execution of service2 result:
   » {"isSuccessful":true,"payload":{"s1Timestamp":[timestamp],"s2TimestampStart":[timestamp],"s2TimestampEnd":[timestamp]}}
```

Now let's analyse that output. For the sake of completeness, the `[timestamp]` and `[instance-id]` are placeholders of the actual values you'll see there. The timestamps are in UTC and show a date followed by time.

At the start of the output log you can see a NOTICE that tells you a couple of important things:

* The instance name - in this case `tester-service`. In the terminology of the framework, this is also known as a _service domain name_.
* The _instance identificator_. It is an uuid string with a `ti-` prefix, that is generated by the framework at process start. It can and will be used to trace the messages during their movement through the microservice ecosystem. But more on that later.

Following that come a couple of INFO lines that inform you about the microservice interface state. The framework starts with the process of registration of _business services_ within the service domain of the microservice `tester-service` and successfully adds 2 such services. The necessary information for this is read from a JSON config file included in the package. We'll get into more details on what this all means in the section [Creating a microservice](#creating-a-microservice).

Once the initialization sequence has completed the framework informs you that the microservice instance has started successfully. If the framework encountered an error during initialization instead, you would see something like this:

```text
[timestamp]: [instance-id] - notice - Starting new instance of type 'tester-service' with instance ID '[instance-id]'.
[timestamp]: [instance-id] - alert - Error detected in the instance startup script!
```

The following 5 lines inform you about the successful connection to Redis. The default configuration assumes that your Redis is running on localhost and uses the default port. If you have a different setup, you can provide the host and port via ENV variables. We'll cover that in the section [Using the framework](#using-the-framework).

Finally, you should see a couple of execution statements with their results in JSON format.

You can now kill the node process which should show you the following two lines:

```text
[timestamp]: [instance-id] - notice - SIGINT event detected in main instance process.
[timestamp]: [instance-id] - notice - Instance '[instance-id]' shut down successfully.
```

The framework will always try to capture the shut-down event and log it. This should work even in container environment, but it might depend on your setup whether the last two entries will reach the logging system or not.

The tester module gets its starting configuration from an `.env` file included in the package. You can find more information about it later in the [Creating a microservice](#creating-a-microservice) section.

Before moving on, also take a good look at the file `bin/start-instance.js`. It should give you an idea on how to the process of starting and stopping a microservice operates. In most cases this file should be sufficient as a starting script for your **ti-engine** based microservice applications. You can, of course, create your own starting script, but then you'll have to consider all necessary steps to properly handle the microservice instance.

## Architecture

The architectural approach for the **ti-engine** is done in _tiers_ with lower tiers being unaware of the tiers above them. The framework prefers a high level of abstraction in all its tiers and provides many options for customization and extension. While the language is JavaScript, the structuring of the framework follows the OOP principles, and you will find a lot of abstract classes and methods that require you to implement them. These are always marked with the `@abstract` annotation but if you happen to miss one, the framework will raise an `E_GEN_ABSTRACT_METHOD_CALL` exception when you try to use it in your solution.

There are three general tiers in the **ti-engine**:

1. Message exchange
2. Service domains
3. Solution implementation

See the following sections for more information on each of them.

### Tier 1 - Message exchange

This is the lowest framework tier, unless we count the actual data objects processed by the framework. As you already know, the foundational **ti-engine** concept is that of a messaging system. Therefore, the first tier provides an abstraction over a chosen message broker (Redis by default). That abstraction makes it easy to switch between message brokers whenever you want to without having to change anything above tier 1. It also provides several added bonuses that can accelerate your work—message encryption, message tracing, message observers, and others. More details about each of these features will be covered in section [Using the framework](#using-the-framework).

Another important aspect for you to remember is that the message exchange is entirely _asynchronous_. This helps reduce system load and optimizes the usage of the available resources. Even so each node.js process can handle a limited amount of load. Therefore, you should plan for running multiple identical senders and receives in order to scale your solution. But more on that later.

For now, take a look at the following diagram:

![Message Exchange](https://github.com/Belleal/ti-engine/blob/master/core/docs/diagram1.png)

It shows the standard flow of a message exchange between one sender and _n_ identical message receivers. The sender splits each message into an _envelope_ and a _payload_, then stores the payload in the shared cache and enqueues the envelope in the requests (destination) queue. Receivers can subscribe to that queue in order to fetch enqueued messages and process their contents. During the fetch sequence a receiver assembles the full message by getting the payload from the storage. This process is depicted by the blue flow lines.

After the processing is done the message payload is modified and the receiver sends the message back to the original sender using the same mechanism. It again splits the message into an envelope and a payload, stores the payload in the storage and enqueues the envelope in the sender response (source) queue. The sender will then assemble the message back and process the contained results. This process is depicted by the red flow lines.

In this scenario the framework utilizes _Redis lists_ as queues for the message envelopes and _Redis hash_ as message payload storage. The splitting between envelope and payload is done in order to avoid unnecessary transportation of potentially large volumes of operational data between the microservices. Other message brokers might utilize a slightly different approach, but they should still adhere to the same logical flow.

The modules associated with this tier are all located in the `components/exchange/` folder. This is a short list of some terminology used here and in the JDoc inside the sourcecode itself:

* Message - this is the actual data object processed by the framework. It consists of two parts: an envelope containing service information and a payload containing the actual data to be processed.
* Message sender - a specialized connector that is responsible for sending a message on its way to its destination. It does not handle the actual dispatch and delivery.
* Message receiver - a specialized connector that is responsible for receiving messages at predefined destination.
* Message exchange - this is the actual message processing engine. It handles sending and receiving messages via preconfigured message senders and message receivers.
* Message observer - a custom event listener that can be used to react on message `sent` and `received` events.

### Tier 2 - Service domains

This tier focuses on hosting and executing the _business logic_ of your application. It's comprised of _business services_ that process input data and return the result of the processing as output data. The business services are grouped in _service domains_, which are in turn hosted inside stateless _microservices_ also named _service instances_. There are two types of service instances in **ti-engine**:

* Service consumers - these are service instances, that can call business services in any connected and available service domain.
* Service providers - these are service instances, that host and run a set of business services in a particular service domain. Every service provider is also a service consumer.

The various service instances in a solution represent a network of interconnected service domains that contain the business logic of your application. All business services exchange data via _service calls_ using abstract _service addresses_. These service calls are transported from one address in the microservice network to another via the underlying message exchange tier. This, however, is completely transparent to the service instances. In essence, tier 2 does not care about the actual data transportation method or protocol. You could in fact change completely the tier 1 approach without having to modify anything in your business logic and business flow.

This tier is the place to utilize any databases, file storages, integrations with other applications, scheduling jobs, and so on. In general, it should focus on executing any granular tasks that are essential to the backbone operation of your application. The business logic here should remain **stateless** and any user context should be provided at runtime to each invoked business service. We'll see more concrete examples for that later in section [Using the framework](#using-the-framework).

### Tier 3 - Solution implementation

This tier comprises the actual implementation of your application. Its structure and behavior depends entirely on your vision and business goals. There are still a couple of points that remain constant while using **ti-engine**:

* It needs to utilize the business logic defined in tier 2 by calling the business services
* It needs to take care of any type of stateful behavior like user sessions or transactions
* It needs to act as the primary interface between users and your application thus handling access management and user interactions

Depending on the type of software you are building, tier 3 can be an API Gateway, a Web application, backend for a Mobile application, or anything like that.

## Creating a microservice

Now let's walk through the process of creating a microservice with **ti-engine**. We'll start with analyzing the contents of the tester module. Then we'll proceed with creating a new microservice that can call one of the business services in the default `ti-tester-service`.

### The ti-tester microservice

If you managed to execute the initial framework test as explained in the [Getting started](#getting-started) section, you should already be familiar with the default tester microservice. Here we'll dissect its contents even further.

Let's take a look at the files and file structure first (only relevant items are shown):

```text
bin
↳ services
  ↳ v1
    ↳ service1.js
    ↳ service2.js
  ↳ tester-service.js
  ↳ tester-service.json
.env
package.json
```

You don't have to follow the exact same folder structure as most of the paths can be defined via ENV parameters and in the configuration file. However, having a good clean structure helps when organizing your work in more complex projects.

In the default tester microservice all application files are located inside the `bin` folder. Outside you have only the `package.json` and the `.env` files which can be considered more of a configuration for the node process rather than part of the application itself. Nevertheless, let's start with them:

#### package.json contents

```json
{
  "name": "@ti-engine/tester",
  "version": "...",
  "description": "...",
  "author": "...",
  "license": "ISC",
  "dependencies": {
    "@ti-engine/core": "latest"
  },
  "engines": {
    "node": ">=14.17.0"
  }
}
```

Apart from the standard information properties there are only two important entries here: `"@ti-engine/core": "latest"` and `"node": ">=14.17.0"`. The dependency on the core of the framework is set to `latest`, but as with any other npm library you should set this to a specific version when releasing on production. The minimum node version should also reflect the minimum requirements of your application and can be adjusted accordingly, but it should not go below the minimum version required by **ti-engine**.

#### .env contents

```text
TI_INSTANCE_CLASS=bin/tester-service.js
TI_INSTANCE_CONFIG=bin/tester-service.json
TI_INSTANCE_NAME=tester-service
TI_AUDITING_LOG_MIN_LEVEL=200
```

The ENV initialization file provides the minimal settings for the proper tester microservice operation. The first three are usually _mandatory_ for every microservice you create while the last is provided for the needs of the tester demonstration. Let's review them and see what they do:

* `TI_INSTANCE_CLASS` specifies the relative path to the implementation of the `ServiceInstance` framework class—in this case a `ServiceProvider`. As stated above, the path is relative to the working directory of the `node` process. This variable is mandatory for every microservice you create with the **ti-engine**. If it is not provided the microservice won't be able to start at all, and you will get an exception.
* `TI_INSTANCE_CONFIG` specifies the relative path to the configuration data for the microservice. We'll delve into the specific settings below. Technically, you can omit this variable and the microservice will still start successfully with an empty configuration. There are very few cases, however, where this would be applicable.
* `TI_INSTANCE_NAME` is the _service domain_ name provided for the microservice. It has to be _unique_ in the context of the microservice ecosystem. If not provided, the framework will attempt to extract this information from the name of the implementation file. That is not a recommended approach though as it might cause hard to identify errors later.
* `TI_AUDITING_LOG_MIN_LEVEL` specifies the minimum log level that should be sent to the log output stream. With a setting of `200` (corresponding to INFO) we filter out all `DEFAULT(0)` and `DEBUG(100)` entries as we don't need them for the purposes of the tester microservice.

You can find the full list of available ENV variables and what they do below in [Using the framework](#using-the-framework) section.

#### Application specific files

Now let's look inside the `bin` folder. The two files there are the ones specified in the `.env` file. The `tester-service.js` contains the implementation of the `ServiceProvider` class. It has just a few methods that contain its behavior:

* Method `onStart` overrides the base one from the parent class and is invoked automatically by the framework once initialization of the microservice is complete. In this case the method invokes the execution of the test sequence just once and then the microservice remains dormant but active.
* Method `reportHealthy` overrides but essentially just calls the same base method. Its only purpose here is to draw your attention to its existence and the possibility to implement your own health status reporting functionality if you want.
* Method `verifyAccess` also overrides the base method and shows a very basic example of how to implement user access verification on business service level. Each time a service in the `ti-tester-service` is called, the framework will trigger this method and will only allow processing if there is a non-undefined value inside the `authToken` variable.
* Method `#executeTests` is a custom private method that contains the test sequence itself. It is called by the `onStart` method just once per microservice start. Inside you can see two examples of calling a business service—in both cases the tester microservice is calling itself. In more practical situation, however, these calls would be directed towards other service domains.

The file `tester-service.json` contains framework configuration for the tester microservice. It will be automatically loaded inside the `ServiceInstance` class during initialization and will already be available inside the `onStart` method for usage. In this case the configuration is related to the two business services that will be provided by the microservice. More on this topic will be covered in section [Using the framework](#using-the-framework). For now just pay attention to the `serviceFile` parameter and that it once again provides a relative path to the actual file containing the business logic.

The final two files are located in `bin/services/v1/` folder. They contain the definitions and business logic of the two business services that will be loaded at initialization time and provided by the tester microservice. In this case `service1.js` contains a very simple service that returns the current timestamp. The `service2.js` file contains a slightly more complex example of a service calling another service (in this case `service1`) before also returning two timestamps taken at the beginning and end of execution. Pay attention to the way the methods inside are declared and exported as this is the proper way to do this while using the **ti-engine** framework. Once again, we'll delve into the details and specifics of creating business services in section [Using the framework](#using-the-framework).

### Creating your own microservice

Now that we've seen the structure of the tester microservice, let's create a new one and make it call `service2`. Let's use similar file structure as for the tester. Create a folder `my-service` and in it create a `package.json` file. Make sure to include a dependency to `"@ti-engine/core": "latest"` in it. After that create a `.env` file and add the following entries in it:

```text
TI_INSTANCE_CLASS=bin/my-service.js
TI_INSTANCE_CONFIG=bin/my-service.json
TI_INSTANCE_NAME=my-service
TI_AUDITING_LOG_MIN_LEVEL=200
```

Create the `my-service.json` file in a `my-service/bin/` folder. For now enter an empty JSON object `{}` inside and leave at that. Next create the `my-service.js` file in the same location and let's start entering some code in it. Since this will be a microservice that only uses other's services, we'll inherit the `ServiceConsumer` class instead:

```js
const ServiceConsumer = require( "@ti-engine/core/service-consumer" );

class MyService extends ServiceConsumer {}

module.exports = MyService;
```

Don't forget to also export your new class at the end, otherwise the framework won't be able to initialize it.

To make use of all the inherited features of the `ServiceConsumer` class we have to add a `constructor` that invokes the base one in the parent class:

```js
const ServiceConsumer = require( "@ti-engine/core/service-consumer" );

class MyService extends ServiceConsumer {
    constructor( serviceDomainName, serviceConfig ) {
        super( serviceDomainName, serviceConfig );
    }
}

module.exports = MyService;
```

And now let's add a service call that is executed at microservice start after `500` milliseconds timeout:

```js
const ServiceConsumer = require( "@ti-engine/core/service-consumer" );
const logger = require( "@ti-engine/core/logger" );
const exceptions = require( "@ti-engine/core/exceptions" );
const { setTimeout: setTimeoutPromise } = require( "node:timers/promises" );

class MyService extends ServiceConsumer {
    constructor( serviceDomainName, serviceConfig ) {
        super( serviceDomainName, serviceConfig );
    }

    onStart() {
        return new Promise( ( resolve, reject ) => {
            super.onStart().then( () => {
                return setTimeoutPromise( 500 );
            } ).then( () => {
                return this.callService( {
                    serviceAlias: "service2",
                    serviceDomainName: "ti-tester-service"
                }, {}, {
                    authToken: "auth"
                } );
            } ).then( ( result ) => {
                logger.log( "Execution of service2 result:", logger.logSeverity.NOTICE, result );
                resolve();
            } ).catch( ( error ) => {
                reject( exceptions.raise( error ) );
            } );
        } );
    }
}

module.exports = MyService;
```

Now let's start the new microservice with `node .\node_modules\@ti-engine\core\bin\start-instance.js` command. Remember, you need to execute this inside the `my-service` folder you created for this exercise. If everything was configured correctly you should get the following output:

```text
[timestamp]: [instance-id] - notice - Starting new instance of type 'my-service' with instance ID '[instance-id]'.
[timestamp]: [instance-id] - info - Connection to Redis server 127.0.0.1:6379 (re)established by client 'connection-msg-responses-in' and is ready to be used.
[timestamp]: [instance-id] - info - Connection to Redis server 127.0.0.1:6379 (re)established by client 'connection-msg-requests-out' and is ready to be used.
[timestamp]: [instance-id] - info - Connection to Redis server 127.0.0.1:6379 (re)established by client 'system-cache' and is ready to be used.
```

If you haven't started anything else, this is all you should see at this point.

Now without exiting this node process let's start the original tester microservice as well. Once it initializes and does its work take a look at the output logs of the `my-service` process:

```text
...
[timestamp]: [instance-id] - notice - Execution of service2 result:
   » {"isSuccessful":true,"payload":{"s1Timestamp":[timestamp],"s2TimestampStart":[timestamp],"s2TimestampEnd":[timestamp]}}
[timestamp]: [instance-id] - notice - Instance [instance-id] started successfully.
   » {"nodeVersion":[node-version]}
```

This means the service call processing was successful and result was returned to `my-service`. Because we made the receiving of the result blocking and part of the initialization sequence, the new microservice did not report successful startup until it received that response from `ti-tester-service`.

And with this step we are done. The new microservice is now operational. You can continue to tweak and play with it in order to understand better how it all works. For more details on the **ti-engine** inner working please see the following sections.

## Using the framework

### Framework settings

Here you can find all settings used by **ti-engine** together with information on what they do. They are defined inside the `config` module and the full list can be accessed through the public `setting` enum. To get the current value of a setting, you can use the public method `getSetting` from the same module. Some settings can be overridden by providing ENV variables as specified below at node application start up.

AUDITING_LOG_CONSOLE_ENABLED
: JSON path `auditing.logConsoleEnabled`, type `boolean`, default `true`
: ENV variable `TI_AUDITING_LOG_CONSOLE_ENABLED`
: This setting controls whether the `auditing` module will send the log entries to the OS console or not. In some cases, like Cloud environments, you might want to disable this, especially if the OS console is not made available. This functions independently of other logging outputs like for example GCloud error reporting.

AUDITING_LOG_DETAILS
: JSON path `auditing.logDetails`, type `boolean`, default `true`
: ENV variable `TI_AUDITING_LOG_DETAILS`
: This setting controls whether the `auditing` module will include the log entry details (located in the `data` property) in the final log output. You might want to disable this if you want a leaner log output or the log entry details are not something you plan to use for analysis later.

AUDITING_LOG_MIN_LEVEL
: JSON path `auditing.logMinLevel`, type `number`, default `0`
: ENV variable `TI_AUDITING_LOG_MIN_LEVEL`
: This setting controls the minimum log severity level that the framework will log in the log output. You can and should set this to `200` (INFO) for production environments in order to filter out the DEBUG and the low-level DEFAULT entries.

AUDITING_LOG_USES_JSON
: JSON path `auditing.logUsesJSON`, type `boolean`, default `false`
: ENV variable `TI_AUDITING_LOG_USES_JSON`
: This setting controls whether the log entries would be sent to output formatted as JSONs or not. By default, the framework outputs log entries as prettified text. In some cases however you might want to have the entire entry as a JSON for further processing (for example if you're sending all logs to Elasticsearch).

GCLOUD_API_KEY (Alpha)
: JSON path `gcloudIntegration.apiKey`
: This setting holds the API key for the GCloud integration module.

GCLOUD_PROJECT_ID (Alpha)
: JSON path `gcloudIntegration.projectID`
: This setting holds the project ID for the GCloud integration module.

LOCALIZATION_LABELS_PATH
: JSON path `localization.labelsPath`, type `string`, default `../core/bin/localization/labels.json`
: ENV variable `TI_LOCALIZATION_LABELS_PATH`
: This setting holds the file system path to the `.json` file containing the localization information. By default, the framework provides such a file with english texts that can be customized further. Alternatively, you can provide your own file from a different location, but it still has to follow the rules of the `localization` module.

LOCALIZATION_LANGUAGE
: JSON path `localization.language`, type `string`, default `en`
: ENV variable `TI_LOCALIZATION_LANGUAGE`
: This setting specifies the default framework language. It will be used when translating labels into a localized text.

MEMORY_CACHE_AUTH_KEY
: JSON path `memoryCache.authKey`, type `string`, default `undefined`
: ENV variable `TI_MEMORY_CACHE_AUTH_KEY`
: This setting holds the Redis password for accessing the Redis server if such password is required.

MEMORY_CACHE_REDIS_DB
: JSON path `memoryCache.redisDB`, type `number`, default `0`
: ENV variable `TI_MEMORY_CACHE_REDIS_DB`
: This setting specifies the Redis DB to be used for all operations. When setting this make sure that the Redis server actually supports multiple DBs (for example Redis Cloud has only one DB with ID `0`).

MEMORY_CACHE_REDIS_HOST
: JSON path `memoryCache.redisHost`, type `string`, default `127.0.0.1`
: ENV variable `TI_MEMORY_CACHE_REDIS_HOST`
: This setting holds the Redis server hostname. It can be an IP or URL depending on your configuration.

MEMORY_CACHE_REDIS_PORT
: JSON path `memoryCache.redisPort`, type `number`, default `6379`
: ENV variable `TI_MEMORY_CACHE_REDIS_PORT`
: This setting holds the Redis server port.

MEMORY_CACHE_USER
: JSON path `memoryCache.user`, type `string`, default `default`
: ENV variable `TI_MEMORY_CACHE_USER`
: This setting holds the Redis username for accessing the Redis server if this is supported by the Redis version (it will be ignored otherwise).

MESSAGE_EXCHANGE_QUEUE_PREFIX (Advanced)
: JSON path `messageExchange.messageQueuePrefix`, type `string`, default `ti:messages:`
: This setting holds the Redis key prefix for the queues that will hold the messages of the message exchange. This is not something you should modify unless you are making a customized implementation of the tier 1 architectural layer.

MESSAGE_EXCHANGE_MESSAGE_STORE (Advanced)
: JSON path `messageExchange.messageStore`, type `string`, default `ti:messages:store`
: This setting holds the Redis key name of the hash table that will hold the message payloads of the message exchange. This is not something you should modify unless you are making a customized implementation of the tier 1 architectural layer.

MESSAGE_EXCHANGE_SECURITY_HASH_ENABLED (Advanced)
: JSON path `messageExchange.securityHashEnabled`, type `boolean`, default `true`
: ENV variable `TI_MESSAGE_EXCHANGE_SECURITY_HASH_ENABLED`
: This setting controls whether the message exchange will use a control hash mechanism to ensure there is no tampering with the messages in between service calls. In most cases you would want to keep this enabled since it ensures the integrity of your data. If you are concerned about performance (hashing with `blake2` is very fast, but it still eats some milliseconds) you might want to try and disable this to see if it makes any notable difference.

MESSAGE_EXCHANGE_SECURITY_HASH_KEY (Advanced)
: JSON path `messageExchange.securityHashKey`, type `string`, default `random uuid`
: ENV variable `TI_MESSAGE_EXCHANGE_SECURITY_HASH_KEY`
: This setting holds the encryption key used by the message exchange control hash mechanism. By default, this has a random uuid value that can be used for development purposes only. For production environments you absolutely must provide your own encryption key via the ENV variable. Depending on your configuration and infrastructure it might come from a secure storage, HSM, key vault, etc.

MESSAGE_EXCHANGE_TRACE_EXPIRATION_TIME
: JSON path `messageExchange.traceExpirationTime`, type `number`, default `3600`
: This setting specifies the expiration time in seconds of the Redis key that will hold the message trace entries. Set this to `0` to disable expiration altogether.

MESSAGE_EXCHANGE_TRACE_LOG_ENABLED
: JSON path `messageExchange.traceLogEnabled`, type `boolean`, default `false`
: ENV variable `TI_MESSAGE_EXCHANGE_TRACE_LOG_ENABLED`
: This setting controls whether the `auditing` module should output all trace messages as normal log entries or not. Normally, you don't want that since it will clutter the standard log quite a lot. All traces go their own storage and can be reviewed and processed separately from the log entries. In some cases, however, as in debugging, enabling this can help you identify hard to track problem.

MESSAGE_EXCHANGE_TRACE_REPOSITORY (Advanced)
: JSON path `messageExchange.traceRepository`, type `string`, default `ti:messages:trace`
: This setting holds the Redis key name for the message trace cache storage. This is not something you should modify unless you are making a customized implementation of the tier 1 architectural layer.

SERVICE_EXECUTION_TIMEOUT
: JSON path `serviceConfig.executionTimeout`, type `number`, default `180000`
: This setting specifies the timeout in milliseconds of the service call executions at tier 2 of the architecture. Any service call that hasn't received response within this time will interrupt the wait and raise an `E_COM_SERVICE_EXEC_TIMEOUT` exception. Please keep in mind that reaching the timeout does not mean the remote service did not process the request. You might want to tweak this setting if you have many time-consuming operations in business services, or you plan to integrate with slow APIs.

SERVICE_HEALTH_CHECK_ADDRESS (Advanced)
: JSON path `serviceConfig.healthCheckAddress`, type `string`, default `ti:services:registry:health:`
: This setting specifies the address of the health check report endpoint for the microservice. In the default implementation this is a prefix for a Redis key that gets updated once at every `SERVICE_HEALTH_CHECK_INTERVAL`. If you override the `reportHealthy` method of the microservice, this setting can contain a URL or another type of destination that can be used by your custom implementation.

SERVICE_HEALTH_CHECK_INTERVAL (Advanced)
: JSON path `serviceConfig.healthCheckInterval`, type `CRON string`, default `*/1 * * * * *`
: This setting specifies the health check report interval at which the endpoint in `SERVICE_HEALTH_CHECK_ADDRESS` is notified.

SERVICE_HEALTH_CHECK_TIMEOUT (Advanced)
: JSON path `serviceConfig.healthCheckTimeout`, type `number`, default `3`
: This setting specifies the timeout in seconds after which a microservice is no longer considered healthy. In the default implementation this represents an expiration parameter to the Redis key defined in `SERVICE_HEALTH_CHECK_ADDRESS`. Essentially, if the microservice does not update the Redis key within this time interval, it will expire and the monitoring application will lose the healthy status of the microservice. If you override the `reportHealthy` method of the microservice, this setting can be used for your custom implementation as needed.

SERVICE_REGISTRY_ADDRESS (Advanced)
: JSON path `serviceConfig.serviceRegistryAddress`, type `string`, default `ti:services:registry:catalog:`
: This setting holds the prefix of the Redis key name used as business service registry. If the microservice is a `ServiceProvider`, on start up it will register its business service portfolio in that Redis set. Also, on each service call that same registry will be searched for the existence of the called business service. This is not something you should modify unless you are making a customized implementation of the tier 1 architectural layer.

OPERATION_MODE
: JSON path `operationMode`, type `string`, default `production`
: ENV variable `NODE_ENV`
: This setting holds the current operation mode of the node application. It will inherit the value from the `NODE_ENV` variable if it exists, otherwise will use its default.

## Advanced topics

Under development...