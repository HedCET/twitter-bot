import { CacheModule, Global, Module, Logger } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ScheduleModule } from '@nestjs/schedule';

import { amqpProviders } from './amqp.providers';
import { AmqpService } from './amqp.service';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { dbProviders } from './db.providers';
import { env } from './env.validations';
import { JwtStrategy } from './jwt.strategy';
import { Neo4jService } from './neo4j.service';
import { RoughRecordMessageService } from './rough.record.message.service';
import { RoughRecordService } from './rough.record.service';
import { ScriptMessageService } from './script.message.service';
import { ScriptService } from './script.service';
import { TwitterAuthController } from './twitter.auth.controller';
import { TwitterAuthService } from './twitter.auth.service';
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
    PassportModule.register({ defaultStrategy: 'jwt' }),
    ScheduleModule.forRoot(),
  ],
  providers: [
    ...amqpProviders,
    ...dbProviders,
    AmqpService,
    AppService,
    JwtStrategy,
    Logger,
    Neo4jService,
    RoughRecordMessageService,
    RoughRecordService,
    ScriptMessageService,
    ScriptService,
    TwitterAuthService,
    TwitterService,
    WordartService,
  ],
})
export class AppModule {}
