import {
    RedisClient,
    RMQConsumerService,
    IQueueManager,
    GoogleSheetRowBase,
} from "collectors-framework"
import { ConfigurationManager, IAppConfig, IRedisConfig } from "../configuration/configurationManager";
import { FixturesDataSheetUpdater } from "./fixturesDataSheetUpdater";
import moment from 'moment';
import { QueueManager } from "collectors-framework/lib/queue/queueManager";

interface IStatResult {
    home: number,
    homeHT: number,
    away: number,
    awayHT: number
};

export class EventsListManager {
    private columnsCount: number = 21;
    private appConfig: IAppConfig;
    private redisConfig: IRedisConfig;
    private rmqServerUrl: string;
    private exchangeName: string;
    private consumerService: RMQConsumerService;
    private redisClient: RedisClient;
    private livescoreRedisClient: RedisClient;
    private fixturesDataSheetUpdater: FixturesDataSheetUpdater;
    private queueManager: IQueueManager;

    constructor() {
        this.redisConfig = ConfigurationManager.getRedisConfig();
        this.rmqServerUrl = ConfigurationManager.getRabbitMqConfig().url;
        this.exchangeName = ConfigurationManager.getRabbitMqConfig().exchangeName;

        this.appConfig = ConfigurationManager.getAppConfig();
        this.queueManager = new QueueManager(this.handleEventRequest.bind(this));
    }

    public async start() {
        try {
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

            this.redisClient = new RedisClient({
                host: this.redisConfig.host,
                port: this.redisConfig.port,
                password: this.redisConfig.password,
                database: 0,
                onErrorCallback: (error) => {
                    console.error(`Redis error:`, error);
                },
                onKeyExpireCallback: async (key) => {
                    console.log("[database 0]: onKeyExpire", key);
                    if (this.fixturesDataSheetUpdater) {
                        await this.fixturesDataSheetUpdater.clearRow(key);
                    }
                },
                onKeyInsertedCallback: async (key, value) => {
                    console.log("[database 0]: onKeyInserted: ", key);
                    await this.onRmqDataArrived(value, null);
                }
            });

            this.livescoreRedisClient = new RedisClient({
                host: this.redisConfig.host,
                port: this.redisConfig.port,
                password: this.redisConfig.password,
                database: 2,
                onErrorCallback: (error) => {
                    console.error(`Redis error:`, error);
                },
                onKeyExpireCallback: async (key) => {
                    console.log("[database 2]: onKeyExpire", key);
                    if (this.fixturesDataSheetUpdater) {
                        await this.fixturesDataSheetUpdater.clearRow(key);
                    }
                },
                onKeyInsertedCallback: async (key, value) => {
                    console.log("[database 2]: onKeyInserted: ", key);
                }
            });

            console.log(this.redisClient.ready);
        } catch (error) {
            throw error;
        }
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

        const notStarted = !event.isPlaying && event.currentPeriod === "0";
        if (notStarted) return;

        var goals: IStatResult = {
            home: 0,
            homeHT: 0,
            away: 0,
            awayHT: 0
        };
        var corners: IStatResult = {
            home: 0,
            homeHT: 0,
            away: 0,
            awayHT: 0
        };
        var yellowCards: IStatResult = {
            home: 0,
            homeHT: 0,
            away: 0,
            awayHT: 0
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

                    case "Yellow Card":
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
                    name: "IsEnded",
                    value: !event.isPlaying && event.currentPeriod === "90"
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
        await this.livescoreRedisClient.setWithExpire(row.rowId, JSON.stringify(row, null, 4), 60);
    }

    private async wait(ms) {
        return new Promise(resolve => {
            setTimeout(resolve, ms);
        });
    }
}
