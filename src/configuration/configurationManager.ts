const config = require('config');
// https://github.com/lorenwest/node-config

export interface IAppConfig {
    clearRowsOnStart: boolean;
    handleSportIds: string[];
}

export interface IRedisConfig {
    host: string;
    port: number;
    password: string;
}

export interface IRabbitMqConfig {
    url: string;
    exchangeName: string;
}

export interface IGoogleSheetConfig {
    serviceAccountEmail: string;
    privateKey: string;
}


export class ConfigurationManager {

    public static getServerPort(): number {
        const port = config.get('Server').has("port") ? config.get('Server').port : 3100;
        return port;
    }

    public static getAppConfig(): IAppConfig {
        const appConfig = config.get('App') as IAppConfig
        if(appConfig) {
            return appConfig;
        }
        
        throw new Error("Failed to load App Config");
    }

    public static getRedisConfig(): IRedisConfig {
        const redisConfig = config.get('Redis') as IRedisConfig
        if(redisConfig) {
            return redisConfig;
        }
        
        throw new Error("Failed to load Redis Config");
    }

    public static getRabbitMqConfig(): IRabbitMqConfig {
        const rmqConfig = config.get('RabbitMq') as IRabbitMqConfig
        if(rmqConfig) {
            return rmqConfig;
        }
        
        throw new Error("Failed to load RabbitMq Config");
    }

    public static getGoogleSheetConfig(): IGoogleSheetConfig {
        const googleSheetConfig = config.get('GoogleSheet') as IGoogleSheetConfig
        if(googleSheetConfig) {
            return googleSheetConfig;
        }
        
        throw new Error("Failed to load GoogleSheet Config");
    }
}