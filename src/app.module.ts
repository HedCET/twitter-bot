import { CacheModule, Global, Module, Logger } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { ScheduleModule } from '@nestjs/schedule';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import {
  name as cachedWordArtsTableName,
  schema as cachedWordArtsTableSchema,
} from './cachedWordArts.table';
import { CrawlammaService } from './crawlamma.service';
import { env } from './env.validations';
import { JwtStrategy } from './jwt.strategy';
import {
  name as recentTableName,
  schema as recentTableSchema,
} from './recent.table';
import { TwitterAuthController } from './twitter.auth.controller';
import { TwitterAuthService } from './twitter.auth.service';
import {
  name as twitterAppsTableName,
  schema as twitterAppsTableSchema,
} from './twitterApps.table';
import {
  name as usersTableName,
  schema as usersTableSchema,
} from './users.table';
import { WordartService } from './wordart.service';

@Global()
@Module({
  controllers: [AppController, TwitterAuthController],
  imports: [
    MongooseModule.forRoot(env.MONGO_URL, {
      useCreateIndex: true,
      useFindAndModify: false,
      useNewUrlParser: true,
      useUnifiedTopology: true,
    }),
    MongooseModule.forFeature([
      { name: cachedWordArtsTableName, schema: cachedWordArtsTableSchema },
      { name: recentTableName, schema: recentTableSchema },
      { name: twitterAppsTableName, schema: twitterAppsTableSchema },
      { name: usersTableName, schema: usersTableSchema },
    ]),
    JwtModule.register({ secret: env.SECRET }),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    CacheModule.register({ max: 1000 * 60, ttl: 1800 }),
    ScheduleModule.forRoot(),
  ],
  providers: [
    JwtStrategy,
    AppService,
    TwitterAuthService,
    CrawlammaService,
    WordartService,
    Logger,
  ],
})
export class AppModule {}
