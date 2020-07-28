import { CacheModule, Global, Module, Logger } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ScheduleModule } from '@nestjs/schedule';
import { MongooseModule } from '@nestjs/mongoose';

import { amqpProviders } from './amqp.providers';
import { AmqpService } from './amqp.service';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { dbModels } from './db.models';
import { env } from './env.validations';
import { JwtStrategy } from './jwt.strategy';
import { ScriptMessageService } from './script.message.service';
import { ScriptService } from './script.service';
import { TwitterAuthController } from './twitter.auth.controller';
import { TwitterAuthService } from './twitter.auth.service';
import { twitterProviders } from './twitter.providers';
import { TwitterService } from './twitter.service';
import { WordartService } from './wordart.service';

@Global()
@Module({
  controllers: [AppController, TwitterAuthController],
  imports: [
    CacheModule.register({
      max: 1000 * 60,
      ttl: 600,
    }),
    JwtModule.register({ secret: env.SECRET }),
    MongooseModule.forFeature([...dbModels]),
    MongooseModule.forRoot(env.MONGO_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    }),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    ScheduleModule.forRoot(),
  ],
  providers: [
    ...amqpProviders,
    ...twitterProviders,
    AmqpService,
    AppService,
    JwtStrategy,
    Logger,
    ScriptMessageService,
    ScriptService,
    TwitterAuthService,
    TwitterService,
    WordartService,
  ],
})
export class AppModule {}
