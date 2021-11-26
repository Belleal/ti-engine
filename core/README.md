# ti-engine core
Flexible framework for the creation of microservices with [node.js](https://nodejs.org/).

## introduction
The **@ti-engine/core** is an open source, free to use - both for personal and commercial projects - framework for the creation of microservice-based solutions using **node.js**. The general architectural concept of the framework is based on a standard messenger system that allows certain customization but also provides predictability and traceability of its behavior.

Being a messenger system, the **@ti-engine/core** relies on a message broker for the actual exchange of messages between microservice instances. The default implementation of the framework uses [Redis](https://redis.io/) cache, however, you could create your own implementation using something like [Rabbit MQ](https://www.rabbitmq.com/). See the [advanced topics](#advanced-topics) section of this documentation for guides on how to do this.

Please be aware, that this framework is under active development and will expand in the near future. Also, this documentation is still in the process of being created and refined. Make sure to keep an eye on the changes in case you want to use it in the meantime.

## prerequisites & installation
In order to run the basic ti-engine framework you will need a couple of things:
1. A local [node.js installation](https://nodejs.org/en/download/) with a minimum version of **14.17.0**
2. A local or remote [Redis cache installation](https://redis.io/download) with a minimum version of **5.0.14**

To get the framework itself, use the command `npm install @ti-engine/core`. And to include it directly in your package.json dependencies execute `npm install @ti-engine/core --save-prod`.

## getting started
To start using the ti-engine, you will have to make sure that the framework is properly configured and able to run. More details and instructions will be provided in the next version of this documentation. For now please take a look at the included file `start-instance.js`. It should give you an idea of how the engine operates and what to do in order to create and run your own microservice instance.

Under development...

## architecture
Under development...

## creating a microservice
Under development...

## using the framework
Under development...

## advanced topics
Under development...
