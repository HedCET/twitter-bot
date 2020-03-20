import { CacheModule, Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ScheduleModule } from '@nestjs/schedule';
import * as redisStore from 'cache-manager-redis-store';

import { amqpProviders } from './amqp.providers';
import { AmqpService } from './amqp.service';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { env } from './env.validations';
import { JwtStrategy } from './jwt.strategy';
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
    JwtModule.register({ secret: env.SECRET }),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    ScheduleModule.forRoot(),
  ],
  providers: [
    ...amqpProviders,
    ...twitterProviders,
    AmqpService,
    AppService,
    JwtStrategy,
    TwitterAuthService,
  ],
})
export class AppModule {}
