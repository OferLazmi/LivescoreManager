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
    private columnsCount: number = 21;
    private appConfig: IAppConfig;
    private redisConfig: IRedisConfig;
    private rmqConfig: IRabbitMqConfig;
    private redisClient: RedisClient;
    private livescoreRedisClient: RedisClient;
    private fixturesDataSheetUpdater: FixturesDataSheetUpdater;
    private queueManager: IQueueManager;
    private subscriber: IServiceBusSubscriber;
    private fixturesEndedPublisher: IServiceBusPublisher;

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
                    // console.log("[database 2]: onKeyExpire", key);
                    if (this.fixturesDataSheetUpdater) {
                        await this.fixturesDataSheetUpdater.clearRow(key);
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
            this.fixturesEndedPublisher = ServiceBusFactory.createPublisher({
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
        const row: GoogleSheetRowBase = {
            rowId: `https://www.bet365.com/#/IP/${event.urlId}`,
            columns: [
                {
                    name: "FixtureId",
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

        this.fixturesDataSheetUpdater.addOrUpdateFixture(row);
        this.livescoreRedisClient.setWithExpire(row.rowId, JSON.stringify(row, null, 4), 60);
        if (isFixtureEnded) {
            this.fixturesEndedPublisher.publish("fixtures.ended", {
                eventId: event.id,
                key: row.rowId
            })
        }

    }

    private async wait(ms) {
        return new Promise(resolve => {
            setTimeout(resolve, ms);
        });
    }
}
