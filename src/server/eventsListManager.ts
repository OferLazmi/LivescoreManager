import {
    RedisClient,
    IQueueManager,
    GoogleSheetRowBase,
    IServiceBusSubscriber,
    ServiceBusFactory,
    IServiceBusPublisher,
} from "collectors-framework"
import { ConfigurationManager, IAppConfig, IRabbitMqConfig, IRedisConfig } from "../configuration/configurationManager";
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
    private columnsCount: number = 22;
    private appConfig: IAppConfig;
    private redisConfig: IRedisConfig;
    private rmqConfig: IRabbitMqConfig;
    private redisClient: RedisClient;
    private livescoreRedisClient: RedisClient;
    private fixturesDataSheetUpdater: FixturesDataSheetUpdater;
    private queueManager: IQueueManager;
    private subscriber: IServiceBusSubscriber;

    constructor() {
        this.redisConfig = ConfigurationManager.getRedisConfig();
        this.rmqConfig = ConfigurationManager.getRabbitMqConfig();
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

            // this.redisClient = new RedisClient({
            //     host: this.redisConfig.host,
            //     port: this.redisConfig.port,
            //     password: this.redisConfig.password,
            //     database: 0,
            //     onErrorCallback: (error) => {
            //         console.error(`Redis error:`, error);
            //     },
            //     onKeyExpireCallback: async (key) => {
            //         console.log("[database 0]: onKeyExpire", key);
            //         if (this.fixturesDataSheetUpdater) {
            //             await this.fixturesDataSheetUpdater.clearRow(key);
            //         }
            //     },
            //     onKeyInsertedCallback: async (key, value) => {
            //         console.log("[database 0]: onKeyInserted: ", key);
            //         await this.onRmqDataArrived(value, null);
            //     }
            // });

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
                        await this.fixturesDataSheetUpdater.clearRow(key, true);
                    }
                },
                onKeyInsertedCallback: async (key, value) => {
                    // console.log("[database 2]: onKeyInserted: ", key);
                }
            });

            this.subscriber = ServiceBusFactory.createSubscriber({
                url: this.rmqConfig.url,
                errorCallback: (error) => {
                    console.error(error);
                }
            });

            this.subscriber.subscribe(this.rmqConfig.exchangeName, async (topic, data) => {
                try {
                    let eventDataInfo = JSON.parse(data.data);
                    if (!eventDataInfo || (
                        this.appConfig.handleSportIds &&
                        this.appConfig.handleSportIds.length > 0 &&
                        !this.appConfig.handleSportIds.includes(eventDataInfo.sportId))) {
                        return;
                    }

                    this.queueManager.enqueue(eventDataInfo);
                } catch (error) {
                    console.error(error);
                }
            });

            this.subscriber.subscribe("fixture.delete", async (topic, data) => {
                try {
                    console.log("delete: ", data.data);
                    await this.fixturesDataSheetUpdater.clearRow(data.data, false);
                    await this.fixturesDataSheetUpdater.save();
                } catch (error) {
                    console.error(error);
                }
            });
        } catch (error) {
            throw error;
        }
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

        const isFixtureEnded = !event.isPlaying && event.currentPeriod === "90";
        const isHalfTimeBreak = event.currentPeriod === "45";
        const isFullTime = event.isPlaying && event.currentPeriod === "90";

        const row: GoogleSheetRowBase = {
            rowId: event.id,
            columns: [
                {
                    name: "FixtureId",
                    value: event.id
                },
                {
                    name: "Url",
                    value: `https://www.bet365.com/#/IP/${event.urlId}`
                },
                {
                    name: "IsEnded",
                    value: isFixtureEnded
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
                    value: isHalfTimeBreak ? goals.homeHT : null
                },
                {
                    name: "AwayHTScore",
                    value: isHalfTimeBreak ? goals.awayHT : null
                },
                {
                    name: "HomeFTScore",
                    value: isFullTime ? goals.home : null
                },
                {
                    name: "AwayFTScore",
                    value: isFullTime ? goals.away : null
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
                    value: isHalfTimeBreak ? corners.homeHT : null
                },
                {
                    name: "AwayCornersHT",
                    value: isHalfTimeBreak ? corners.awayHT : null
                },
                {
                    name: "HomeCornersFT",
                    value: isFullTime ? corners.home : null
                },
                {
                    name: "AwayCornersFT",
                    value: isFullTime ? corners.away : null
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
                    name: "HomeYellowCardHT",
                    value: isHalfTimeBreak ? yellowCards.homeHT : null
                },
                {
                    name: "AwayYellowCardHT",
                    value: isHalfTimeBreak ? yellowCards.awayHT : null
                },
                {
                    name: "HomeYellowCardFT",
                    value: isFullTime ? yellowCards.home : null
                },
                {
                    name: "AwayYellowCardFT",
                    value: isFullTime ? yellowCards.away : null
                },
                {
                    name: "LastUpdate",
                    value: moment(new Date()).format("HH:mm:ss")
                }
            ]
        };

        this.fixturesDataSheetUpdater.addOrUpdateFixture(row);
        // this.livescoreRedisClient.setWithExpire(row.rowId, JSON.stringify(row, null, 4), 60);
        this.livescoreRedisClient.set(row.rowId, JSON.stringify(row, null, 4));
    }

    private async wait(ms) {
        return new Promise(resolve => {
            setTimeout(resolve, ms);
        });
    }
}
