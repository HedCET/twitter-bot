import { CacheModule, Global, Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import * as redisStore from 'cache-manager-redis-store';

import { amqpProviders } from './amqp.providers';
import { AmqpService } from './amqp.service';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { env } from './env.validations';
import { TwitterAuthController } from './twitter.auth.controller';
import { TwitterAuthService } from './twitter.auth.service';
import { twitterProviders } from './twitter.providers';

@Global()
@Module({
  controllers: [AppController, TwitterAuthController],
  imports: [
    CacheModule.register({
      auth_pass: env.REDIS_PASSWORD,
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      store: redisStore,
      ttl: 600,
    }),
    ScheduleModule.forRoot(),
  ],
  providers: [
    ...amqpProviders,
    ...twitterProviders,
    AmqpService,
    AppService,
    TwitterAuthService,
  ],
})
export class AppModule {}
