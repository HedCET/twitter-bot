import { Global, Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

import { amqpProviders } from './amqp.providers';
import { AmqpService } from './amqp.service';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { twitterProviders } from './twitter.providers';

@Global()
@Module({
  controllers: [AppController],
  imports: [ScheduleModule.forRoot()],
  providers: [...amqpProviders, ...twitterProviders, AmqpService, AppService],
})
export class AppModule {}
