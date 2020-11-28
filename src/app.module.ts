import { CacheModule, Global, Module, Logger } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { ScheduleModule } from '@nestjs/schedule';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CachedWordArt, CachedWordArtSchema } from './cachedWordArts.table';
import { CrawlammaService } from './crawlamma.service';
import { env } from './env.validations';
import { JwtStrategy } from './jwt.strategy';
import { Recent, RecentSchema } from './recent.table';
import { TwitterAuthController } from './twitter.auth.controller';
import { TwitterAuthService } from './twitter.auth.service';
import { TwitterApp, TwitterAppSchema } from './twitterApps.table';
import { User, UserSchema } from './users.table';
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
      { name: CachedWordArt.name, schema: CachedWordArtSchema },
      { name: Recent.name, schema: RecentSchema },
      { name: TwitterApp.name, schema: TwitterAppSchema },
      { name: User.name, schema: UserSchema },
    ]),
    JwtModule.register({ secret: env.SECRET }),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    CacheModule.register({ max: 1000 * 60, ttl: 900 }),
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
