import { Global, Module } from '@nestjs/common';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { twitterProviders } from './twitter.providers';

@Global()
@Module({
  controllers: [AppController],
  providers: [...twitterProviders, AppService],
})
export class AppModule {}
