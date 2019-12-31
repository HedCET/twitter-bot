import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { sortBy } from 'lodash';
import * as moment from 'moment';
import { Model } from 'mongoose';
import * as twit from 'twit';

import { modelTokens } from './db.imports';
import { settingsInterface } from './settings.interface';
import { search_tweets } from './twitter.interface';
import { usersInterface } from './users.interface';

@Injectable()
export class AppService {
  constructor(
    @Inject('TWITTER') private readonly twitter: typeof twit,
    @InjectModel(modelTokens.settings) private readonly settingsModel: Model<settingsInterface>,
    @InjectModel(modelTokens.users) private readonly usersModel: Model<usersInterface>
  ) { }

  async update() {
    for (let i = 0; i < 10; i++) {
      const config = await this.settingsModel
        .findOne({ _id: 'search/tweets' });

      const tweets: search_tweets = await this.twitter
        .get('search/tweets', {
          count: 100,
          lang: 'ml',
          q: '*',
          result_type: 'recent',
          since_id: (config ? config.since_id : '0'),
        });

      if (tweets.data.statuses.length
        && +config.since_id < +tweets.data.search_metadata.max_id_str)
        await this.settingsModel
          .updateOne({ _id: 'search/tweets' },
            { $set: { since_id: tweets.data.search_metadata.max_id_str } },
            { upsert: true });
      else break;

      for (const tweet of sortBy(tweets.data.statuses, 'id_str')) {
        const user = await this.settingsModel
          .findOne({ _id: tweet.user.screen_name });

        await this.usersModel
          .updateOne({ _id: tweet.user.screen_name }, {
            $set: {
              created_at: moment(tweet.user.created_at, ['ddd MMM D HH:mm:ss ZZ YYYY']).toDate(),
              favourites: tweet.user.favourites_count,
              favourites_ref: (user ? user.favourites : tweet.user.favourites_count),
              last_tweet_time: moment(tweet.created_at, ['ddd MMM D HH:mm:ss ZZ YYYY']).toDate(),
              last_tweet_time_ref: (user ? user.last_tweet_time : moment(tweet.created_at, ['ddd MMM D HH:mm:ss ZZ YYYY']).toDate()),
            },
          }, { upsert: true });
      }

      Logger.log(`${i + 1}|${tweets.data.statuses.length}`, 'AppService/update');
      await new Promise(r => setTimeout(r, 1000 * 30));
    }

    return true;
  }
}
