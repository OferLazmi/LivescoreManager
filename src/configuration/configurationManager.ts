const config = require('config');
// https://github.com/lorenwest/node-config

export interface IRedisConfig {
    host: string;
    port: number;
}

export interface IRabbitMqConfig {
    url: string;
    exchangeName: string;
}

export class ConfigurationManager {

    public static getServerPort(): number {
        const port = config.get('Server').has("port") ? config.get('Server').port : 3100;
        return port;
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
}