import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as BigInt from 'big-integer';
import { sortBy } from 'lodash';
import * as moment from 'moment';
import { Model } from 'mongoose';
import * as twit from 'twit';

import { modelTokens } from './db.imports';
import { tweetsInterface } from './tweets.interface';
import { search_req, search_res } from './twitter.interface';
import { usersInterface } from './users.interface';

@Injectable()
export class AppService {
  constructor(
    @Inject('TWITTER') private readonly twitter: typeof twit,
    @InjectModel(modelTokens.tweets) private readonly tweetsModel: Model<tweetsInterface>,
    @InjectModel(modelTokens.users) private readonly usersModel: Model<usersInterface>
  ) { }

  async update() {
    let maxId;

    for (let i = 0; i < 10; i++) {
      const query: search_req = {
        count: 100,
        lang: 'ml',
        q: '*',
        result_type: (maxId ? 'mixed' : 'recent'),
      };

      if (maxId)
        query.max_id = maxId;

      const tweets: search_res = await this.twitter
        .get('search/tweets', query);

      if (!tweets.data.statuses.length)
        break;

      const statuses = sortBy(tweets.data.statuses, 'id_str');
      maxId = BigInt(statuses[0].id_str).subtract(1).toString();

      let successTweets = 0;

      for (const tweet of statuses) {
        const tweet_created_at = moment(tweet.created_at, ['ddd MMM D HH:mm:ss ZZ YYYY']).toDate();
        const user_created_at = moment(tweet.user.created_at, ['ddd MMM D HH:mm:ss ZZ YYYY']).toDate();

        const user = await this.usersModel
          .findOne({ _id: tweet.user.screen_name });

        await this.usersModel
          .updateOne({ _id: tweet.user.screen_name }, {
            $set: {
              created_at: user_created_at,
              favourites: tweet.user.favourites_count,
              favourites_ref: (user ? (tweet.user.favourites_count != user.favourites ? user.favourites : user.favourites_ref) : tweet.user.favourites_count),
              favourites_ref_updated_at: (user ? (tweet.user.favourites_count != user.favourites ? user.favourites_updated_at : user.favourites_ref_updated_at) : tweet_created_at),
              favourites_updated_at: tweet_created_at,
            },
          }, { upsert: true });

        const existTweet = await this.tweetsModel
          .findOne({ _id: tweet.id_str });

        if (!existTweet) {
          await new this.tweetsModel({ _id: tweet.id_str }).save();
          successTweets += 1;
        }
      }

      if (!successTweets)
        break;

      Logger.log(`${i + 1}|${statuses.length}|${successTweets}`, 'AppService/update');
      await new Promise(r => setTimeout(r, 1000 * 10));
    }

    return true;
  }
}
