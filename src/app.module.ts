import { Global, Module } from '@nestjs/common';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { dbImports } from './db.imports';
import { twitterProviders } from './twitter.providers';

@Global()
@Module({
  controllers: [AppController],
  imports: [...dbImports],
  providers: [...twitterProviders, AppService],
})

export class AppModule { }
