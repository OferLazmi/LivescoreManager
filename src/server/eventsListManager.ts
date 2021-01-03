import {
    RedisClient,
    RMQConsumerService,
    RMQConnectionParameters,
    IEventsDataReceiver,
    IEventDataInfo
} from "collectors-framework"
import { ConfigurationManager } from "../configuration/configurationManager";

const Stopwatch = require('statman-stopwatch');

export class EventsListManager {

    redisHost: string;
    redisPort: number;
    rmqServerUrl: string;
    exchangeName: string;
    internalSocketPort: number;
    maxEventsInDataReceiver: number;

    activeEvents = new Map();
    eventsDataReceivers: IEventsDataReceiver[] = [];
    consumerService: RMQConsumerService;
    runningEvents = new Map();

    constructor() {
        this.redisHost = ConfigurationManager.getRedisConfig().host;
        this.redisPort = ConfigurationManager.getRedisConfig().port;
        this.rmqServerUrl = ConfigurationManager.getRabbitMqConfig().url;
        this.exchangeName = ConfigurationManager.getRabbitMqConfig().exchangeName;

        // const redisClient: RedisClient = new RedisClient(this.redisHost, this.redisPort);
        // console.log(redisClient.ready);

        // redisClient.get("Ofer").then((data) => {
        //     console.log(data);
        // });
    }

    public start() {
        const connectionParams: RMQConnectionParameters = new RMQConnectionParameters(this.rmqServerUrl, true, false);
        this.consumerService = new RMQConsumerService(connectionParams);
        this.consumerService.consumeFromExchange(this.exchangeName, this.onRmqDataArrived);
    }

    private onRmqDataArrived(message: string, rawMessage: any) {
        console.log(message);

        const stopwatch = new Stopwatch();
        stopwatch.start();

        let eventDataInfo = JSON.parse(message) as IEventDataInfo;
        if (eventDataInfo) {
            
        }

        stopwatch.stop();
        const delta = stopwatch.read();
    }
}
