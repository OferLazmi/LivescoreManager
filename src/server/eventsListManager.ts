import {
    RedisClient,
    RMQConsumerService,
    RMQConnectionParameters,
    IQueueManager,
    GoogleSheetRowBase,
} from "collectors-framework"
import { ConfigurationManager, IAppConfig, IRedisConfig } from "../configuration/configurationManager";
import { FixturesDataSheetUpdater } from "./fixturesDataSheetUpdater";
import moment from 'moment';
import { IChangeNotifier, IErrorNotifier } from "collectors-framework/lib/redis/redis-client";
import { QueueManager } from "collectors-framework/lib/queue/queueManager";

interface IStatResult {
    home: number,
    homeHT: number,
    away: number,
    awayHT: number,
    minute: number
};

export class EventsListManager implements IErrorNotifier, IChangeNotifier {
    private columnsCount: number = 21;
    private appConfig: IAppConfig;
    private redisConfig: IRedisConfig;
    private rmqServerUrl: string;
    private exchangeName: string;
    private consumerService: RMQConsumerService;
    private redisClient: RedisClient;
    private fixturesDataSheetUpdater: FixturesDataSheetUpdater;
    private queueManager: IQueueManager;

    constructor() {
        this.redisConfig = ConfigurationManager.getRedisConfig();
        this.rmqServerUrl = ConfigurationManager.getRabbitMqConfig().url;
        this.exchangeName = ConfigurationManager.getRabbitMqConfig().exchangeName;

        this.redisClient = new RedisClient({
            host: this.redisConfig.host,
            port: this.redisConfig.port,
            password: this.redisConfig.password,
            changeNotifier: this,
            errorNotifier: this
        });

        this.appConfig = ConfigurationManager.getAppConfig();
        this.queueManager = new QueueManager(this.handleEventRequest.bind(this));
    }

    public onError(error: string): void {
        console.error(`Redis error:`, error);
    }

    public async start() {
        try {
            console.log(this.redisClient.ready);

            this.fixturesDataSheetUpdater = new FixturesDataSheetUpdater();
            await this.fixturesDataSheetUpdater.init(this.columnsCount);
            if (this.appConfig.clearRowsOnStart) {
                await this.fixturesDataSheetUpdater.clearRows();
            }

            this.consumerService = new RMQConsumerService({
                connectionUrl: this.rmqServerUrl,
                durable: false,
                exclusive: true
            }, (error: any) => {
                console.error("Rabbit mq error: ", error);
            }, () => {
                console.error("Rabbit mq closed");
            }, (error: any) => {
                console.error("Rabbit mq error: ", error);
            }, () => {
                console.error("Rabbit mq channel closed");
            });
            this.consumerService.consumeFromExchange(this.exchangeName, this.onRmqDataArrived.bind(this));
        } catch (error) {
            throw error;
        }
    }

    public async onKeyExpire(key: string): Promise<void> {
        console.log("onKeyExpire", key);
        if (this.fixturesDataSheetUpdater) {
            await this.fixturesDataSheetUpdater.clearRow(key);
        }
    }

    public onKeyInserted(key: string, value): void {
        // console.log("onKeyInserted", key, value);
    }

    private onRmqDataArrived(message: string, rawMessage: any): Promise<void> {
        return new Promise<void>(async (resolve, reject) => {
            try {
                let eventDataInfo = JSON.parse(message);
                if (!eventDataInfo || (
                    this.appConfig.handleSportIds &&
                    this.appConfig.handleSportIds.length > 0 &&
                    !this.appConfig.handleSportIds.includes(eventDataInfo.sportId))) {
                    return;
                }

                if (eventDataInfo) {
                    console.log(eventDataInfo);
                    // this.handleEventRequest(eventDataInfo);
                    this.queueManager.enqueue(eventDataInfo);
                }

                // console.log(`Resulting Manager received event. took: ${delta}`);
                resolve();
            } catch (error) {
                reject(error);
            }
        });
    }

    private handleStat(stat, event, counts: IStatResult) {
        const homeName = event.homeTeam;
        const period = stat.period;
        if (!period) {
            return;
        }

        if (stat.minute) {
            counts.minute = stat.minute;
        }

        let team = stat.team;
        if (!team) {
            if (stat.name.includes(homeName)) {
                team = "1";
            } else {
                team = "2";
            }
        }

        if (team === '1') {
            counts.home++;
            if (period === '0') {
                counts.homeHT++;
            }
        } else {
            counts.away++;
            if (period === '0') {
                counts.awayHT++;
            }
        }
    }

    private async handleEventRequest(event: any) {

        var goals: IStatResult = {
            home: 0,
            homeHT: 0,
            away: 0,
            awayHT: 0,
            minute: 0
        };
        var corners: IStatResult = {
            home: 0,
            homeHT: 0,
            away: 0,
            awayHT: 0,
            minute: 0
        };
        var yellowCards: IStatResult = {
            home: 0,
            homeHT: 0,
            away: 0,
            awayHT: 0,
            minute: 0
        };

        if (event.stats) {
            for (let index = 0; index < event.stats.length; index++) {
                const stat = event.stats[index];

                switch (stat.type) {
                    case "Corner":
                        this.handleStat(stat, event, corners);
                        break;

                    case "Goal":
                        this.handleStat(stat, event, goals);
                        break;

                    case "YellowCard":
                        this.handleStat(stat, event, yellowCards);
                        break;

                    default:
                        break;
                }
            }
        }

        const row: GoogleSheetRowBase = {
            rowId: `https://www.bet365.com/#/IP/${event.urlId}`,
            columns: [
                {
                    name: "FixtureId",
                    value: `https://www.bet365.com/#/IP/${event.urlId}`
                },
                {
                    name: "Minute",
                    value: goals.minute
                },
                {
                    name: "HomeScore",
                    value: goals.home
                },
                {
                    name: "AwayScore",
                    value: goals.away
                },
                {
                    name: "HomeHTScore",
                    value: goals.homeHT
                },
                {
                    name: "AwayHTScore",
                    value: goals.awayHT
                },
                {
                    name: "HomeFTScore",
                    value: goals.home
                },
                {
                    name: "AwayFTScore",
                    value: goals.away
                },
                {
                    name: "HomeCorners",
                    value: corners.home
                },
                {
                    name: "AwayCorners",
                    value: corners.away
                },
                {
                    name: "HomeCornersHT",
                    value: corners.homeHT
                },
                {
                    name: "AwayCornersHT",
                    value: corners.awayHT
                },
                {
                    name: "HomeCornersFT",
                    value: corners.home
                },
                {
                    name: "AwayCornersFT",
                    value: corners.away
                },
                {
                    name: "HomeYellowCard",
                    value: yellowCards.home
                },
                {
                    name: "AwayYellowCard",
                    value: yellowCards.away
                },
                {
                    name: "FixtHomeYellowCardHTureId",
                    value: yellowCards.homeHT
                },
                {
                    name: "AwayYellowCardHT",
                    value: yellowCards.awayHT
                },
                {
                    name: "HomeYellowCardFT",
                    value: yellowCards.home
                },
                {
                    name: "AwayYellowCardFT",
                    value: yellowCards.away
                },
                {
                    name: "LastUpdate",
                    value: moment(new Date()).format("HH:mm:ss")
                }
            ]
        };

        await this.fixturesDataSheetUpdater.addOrUpdateFixture(row);
        await this.redisClient.setWithExpire(row.rowId, row.rowId, 60);
    }   

    private async wait(ms) {
        return new Promise(resolve => {
            setTimeout(resolve, ms);
        });
    }
}
