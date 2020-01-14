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

    for (let i = 0; i < 30; i++) {
      const query: search_req = {
        count: 100,
        lang: 'ml',
        q: '*',
        result_type: 'recent',
      };

      if (maxId)
        query.max_id = maxId;

      const tweets: search_res = await this.twitter
        .get('search/tweets', query);

      if (!tweets.data.statuses.length)
        break;

      const statuses = sortBy(tweets.data.statuses, [item => `${moment(item.created_at, ['ddd MMM D HH:mm:ss ZZ YYYY']).format('x')}.${item.id_str}`]);
      maxId = BigInt(statuses[0].id_str).subtract(1).toString();

      let successTweets = 0;

      for (const tweet of statuses) {
        const created_at = moment(tweet.user.created_at, ['ddd MMM D HH:mm:ss ZZ YYYY']).toDate();
        const tweeted_at = moment(tweet.created_at, ['ddd MMM D HH:mm:ss ZZ YYYY']).toDate();

        const $set: { [key: string]: any } = { created_at, tweeted_at };
        const $unset: { [key: string]: any } = {};

        if (tweet.user.favourites_count) $set.favourites = tweet.user.favourites_count; else $unset.favourites = true;
        if (tweet.user.followers_count) $set.followers = tweet.user.followers_count; else $unset.followers = true;
        if (tweet.user.friends_count) $set.friends = tweet.user.friends_count; else $unset.friends = true;

        const user = await this.usersModel
          .findOne({ _id: tweet.user.screen_name });

        if (user
          && moment(tweeted_at).isAfter(user.tweeted_at)) {
          $set.last_tweeted_at_frequency = moment.duration(moment(tweeted_at).diff(moment(user.tweeted_at))).asDays();

          if (tweet.user.favourites_count != user.favourites && (tweet.user.favourites_count || 0) - (user.favourites || 0)) $set.last_favourites_average = ((tweet.user.favourites_count || 0) - (user.favourites || 0)) / $set.last_tweeted_at_frequency;
          if (tweet.user.followers_count != user.followers && (tweet.user.followers_count || 0) - (user.followers || 0)) $set.last_followers_average = ((tweet.user.followers_count || 0) - (user.followers || 0)) / $set.last_tweeted_at_frequency;
          if (tweet.user.friends_count != user.friends && (tweet.user.friends_count || 0) - (user.friends || 0)) $set.last_friends_average = ((tweet.user.friends_count || 0) - (user.friends || 0)) / $set.last_tweeted_at_frequency;
        }

        if (tweet.user.profile_image_url) {
          const match = tweet.user.profile_image_url.match(/_images\/(.*)_normal/i);

          if (match) $set.profile_image_path = match[1];
          else Logger.log(tweet.user.profile_image_url, 'AppService/update/profile_image_url');
        } else $unset.profile_image_path = true;

        await this.usersModel
          .updateOne({ _id: tweet.user.screen_name }, { $set, $unset }, { upsert: true });

        const existTweet = await this.tweetsModel
          .findOne({ _id: tweet.id_str });

        if (!existTweet) {
          await new this.tweetsModel({ _id: tweet.id_str }).save();
          successTweets++;
        }
      }

      if (!successTweets)
        break;

      Logger.log(`${i + 1}|${statuses.length}|${successTweets}`, 'AppService/update');
      await new Promise(r => setTimeout(r, 1000 * 10));
    }

    const thresholdTweet = await this.tweetsModel
      .where()
      .sort({ _id: 'desc' })
      .skip(1000)
      .findOne();

    if (thresholdTweet)
      await this.tweetsModel
        .deleteMany({ _id: { $lte: thresholdTweet._id } });

    return true;
  }
}
