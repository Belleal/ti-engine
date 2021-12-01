# ti-engine core
Flexible framework for the creation of microservices with [node.js](https://nodejs.org/).

## introduction
The **ti-engine** is an open source, free to use - both for personal and commercial projects - framework for the creation of microservice-based solutions using **node.js**. The general architectural concept of the framework is based on a standard messenger system that allows certain customization but also provides predictability and traceability of its behavior.

Being a messenger system, the **ti-engine** relies on a message broker for the actual exchange of messages between microservice instances. The default implementation of the framework uses [Redis](https://redis.io/) cache, however, you could create your own implementation using something like [Rabbit MQ](https://www.rabbitmq.com/). See the [advanced topics](#advanced-topics) section of this documentation for guides on how to do this.

Please be aware, that this framework is under active development and will expand in the near future. Also, this documentation is still in the process of being created and refined. Make sure to keep an eye on the changes in case you want to use it in the meantime.

## why ti-engine?
The framework is created based on a decade of professional experience with the utilized technologies and architectural approach. It's primary goal is to provide you with a lightweight and flexible solution that can help you build quickly a microservice ecosystem with any degree of size and complexity.

This is what you gain by using **ti-engine** in your project:
* Simplicity - begin productive work within minutes and get to codding you business logic
* Flexibility - go as complex as you need to in your implementation
* Reliability - message exchange between the services is constantly tracked across the entire ecosystem
* Security - messages are encrypted in transit and cannot be modified by external agents
* Scalability - serve mullions of requests by multiplying stateless service instances (hardware limitations still apply)
* Containerization - go with containers from the very start as the framework is designed to work in such an environment

These are just some benefits **ti-engine** offers. Get to know it better to find out more ways in which it can help you improve productivity.

## prerequisites & installation
In order to run the basic ti-engine framework you will need a couple of things:
* A local [node.js installation](https://nodejs.org/en/download/) with a minimum version of **14.17.0**
* A local or remote [Redis cache installation](https://redis.io/download) with a minimum version of **5.0.14**

If you are working under Windows OS and you need to install Redis, take a look at this [guide](https://redis.com/blog/redis-on-windows-10/).

To get the framework itself, use the command `npm install @ti-engine/core`. And to include it directly in your package.json dependencies execute `npm install @ti-engine/core --save-prod`.

## getting started
To start using the **ti-engine**, you will have to make sure that all prerequisites are available and operational. However, before we get to the fun part you need to also consider a couple of very important things while working with this framework:
1. The runtime configuration of the framework can be customized using ENV variables. These can be provided to node.js in all the standard ways, but there is also an option to include an `.env` file.
2. It loads your framework-related custom scripts and files dynamically, but it always assumes their provided paths are relative to the _current working directory_ (i.e. it uses `process.cwd()`). Be mindful of that whenever you declare file paths in the various settings.

Once you have everything else ready, you should download the **ti-engine** tester module with the command `npm install @ti-engine/tester`. The tester module packages an example microservice that shows the basic approach for using the framework. To make sure everything is working properly, you should try and start the tester service:
1. Open a command prompt and navigate to the directory of the tester module; it should be something like that:
`[path to your project]/node_modules/@ti-engine/tester`
2. Execute the following command `node ../core/bin/start-instance.js`
3. If everything was done properly, you should see the following output:
```shell
[timestamp]: [instance-id] - notice - Starting new instance of type 'tester-service' with instance ID '[instance-id]'.
[timestamp]: [instance-id] - info - Starting service registration process. There is NO default service handler provided.
[timestamp]: [instance-id] - info - Registration of defined services completed with 2 successful out of 2 total.
[timestamp]: [instance-id] - notice - Instance '[instance-id]' started successfully.
[timestamp]: [instance-id] - info - Connection to Redis server 127.0.0.1:6379 (re)established by client 'connection-msg-responses-out' and is ready to be used.
[timestamp]: [instance-id] - info - Connection to Redis server 127.0.0.1:6379 (re)established by client 'system' and is ready to be used.
[timestamp]: [instance-id] - info - Connection to Redis server 127.0.0.1:6379 (re)established by client 'connection-msg-requests-in' and is ready to be used.
[timestamp]: [instance-id] - info - Connection to Redis server 127.0.0.1:6379 (re)established by client 'connection-msg-requests-out' and is ready to be used.
[timestamp]: [instance-id] - info - Connection to Redis server 127.0.0.1:6379 (re)established by client 'connection-msg-responses-in' and is ready to be used.
[timestamp]: [instance-id] - notice - Execution of service1 result:
{ exception: undefined, isSuccessful: true, payload: { s1Timestamp: [timestamp] } }
[timestamp]: [instance-id] - notice - Execution of service2 result:
{ exception: undefined, isSuccessful: true, payload: { s1Timestamp: [timestamp], s2TimestampStart: [timestamp], s2TimestampEnd: [timestamp] } }
```
Now let's analyse that output. For the sake of completeness, the `[timestamp]` and `[instance-id]` are placeholders of the actual values you'll see there. The timestamps are in UTC and show a date followed by time.

At the start of the output log you can see a NOTICE that tells you a couple of important things:
* The instance name - in this case `tester-service`. In the terminology of the framework, this is also known as a _service domain name_.
* The _instance identificator_. It is an uuid string with a `ti-` prefix, that is generated by the framework at process start. It can and will be used to trace the messages during their movement through the microservice ecosystem. But more on that later.

Following that come a couple of INFO lines that inform you about the microservice interface state. The framework starts with the process of registration of _business services_ within the service domain of the microservice `tester-service` and successfully adds 2 such services. The necessary information for this is read from a JSON config file included in the package. We'll get into more details on what this all means in the section [creating a microservice](#creating-a-microservice).

Once the initialization sequence has completed the framework informs you that the microservice instance has started successfully. If the framework encountered an error during initialization instead, you would see something like this:
```shell
[timestamp]: [instance-id] - notice - Starting new instance of type 'tester-service' with instance ID '[instance-id]'.
[timestamp]: [instance-id] - alert - Error detected in the instance startup script!
```
The following 5 lines inform you about the successful connection to Redis. The default configuration assumes that your Redis is running on localhost and uses the default port. If you have a different setup, you can provide the host and port via ENV variables. We'll cover that in the section [using the framework](#using-the-framework).

Finally, you should see a couple of execution statements with their results in JSON format.

You can now kill the node process which should show you the following two lines:
```shell
[timestamp]: [instance-id] - notice - SIGINT event detected in main instance process.
[timestamp]: [instance-id] - notice - Instance '[instance-id]' shut down successfully.
```
The framework will always try to capture the shut-down event and log it. This should work even in container environment, but it might depend on your setup whether the last two entries will reach the logging system or not.

The tester module gets its starting configuration from an `.env` file included in the package. If you open it, this is what you'll see:
```shell
TI_INSTANCE_CLASS=tester-service.js
TI_INSTANCE_CONFIG=tester-service.json
TI_INSTANCE_NAME=tester-service
TI_LOG_MIN_LEVEL=200
```
The first variable `TI_INSTANCE_CLASS` is mandatory for every microservice you create with the **ti-engine**. It needs to specify the path to the module that is your microservice. Remember, that this path has to be relative to the working directory in which you plan to execute the `node` command. This is especially important when you're configuring your microservices to work in containers. You can find the full list of available ENV variables and what they do below.

Before moving on, also take a good look at the file `bin/start-instance.js`. It should give you an idea on how to the process of starting and stopping a microservice operates. In most cases this file should be sufficient as a starting script for your **ti-engine** based microservice applications. You can, of course, create your own starting script, but then you'll have to consider all necessary steps to properly handle the microservice instance.

## architecture
Under development...

## creating a microservice
Under development...

## using the framework
Under development...

## advanced topics
Under development...
