import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { find, last, shuffle, sortBy } from 'lodash';
import * as moment from 'moment';
import { Model } from 'mongoose';
import * as twit from 'twit';

import { modelTokens } from './db.imports';
import { env } from './env.validations';
import { favoritesInterface } from './favorites.interface';
import { retweetsInterface } from './retweets,interface';
import { usersInterface } from './users.interface';

@Injectable()
export class AppService {
  private since_id: string = '0';
  private wait: number = 0;

  constructor(
    @Inject('TWITTER') private readonly twitter: typeof twit,
    @InjectModel(modelTokens.favorites) private readonly favoritesModel: Model<favoritesInterface>,
    @InjectModel(modelTokens.retweets) private readonly retweetsModel: Model<retweetsInterface>,
    @InjectModel(modelTokens.users) private readonly usersModel: Model<usersInterface>
  ) { }

  async update(services = []) {
    let looping: boolean = (0 < this.wait-- ? false : true);
    let retweetsThreshold: number = 6;

    while (looping) {
      const lastTweet = await this.retweetsModel
        .where()
        .sort({ _id: 'desc' })
        .findOne();

      if (lastTweet)
        this.since_id = lastTweet._id;

      const tweets: { data: { search_metadata: { max_id_str: string }, statuses: { entities: { urls: object[] }, favorited: boolean, id_str: string, is_quote_status: boolean, retweeted: boolean, user: { favourites_count: number, screen_name: string } }[] } } = await this.twitter
        .get('search/tweets', { count: 100, lang: 'ml', q: env.TWITTER_SEARCH_QUERY, result_type: 'recent', since_id: this.since_id });

      if (tweets.data.statuses.length) this.since_id = tweets.data.search_metadata.max_id_str;
      else break;

      for (const tweet of shuffle(tweets.data.statuses)) {
        await this.usersModel.updateOne({ _id: tweet.user.screen_name },
          { $set: { favourites_count: tweet.user.favourites_count, time: moment().toDate() } },
          { upsert: true });

        if (!await this.usersModel.where({ _id: tweet.user.screen_name, blocked: true }).findOne()) {
          if ((!tweet.entities.urls.length || (tweet.entities.urls.length && 10 < tweet.user.favourites_count))
            && (!tweet.is_quote_status || (tweet.is_quote_status && 100 < tweet.user.favourites_count))
            && !tweet.retweeted
            && !await this.retweetsModel.where({ _id: tweet.id_str }).findOne()) {
            if (retweetsThreshold-- < 0
              || 0 < this.wait) looping = false;
            else {
              await new Promise(resolve => setTimeout(async () => {
                try {
                  await this.twitter.post('statuses/retweet', { id: tweet.id_str });
                  await new this.retweetsModel({ _id: tweet.id_str }).save();
                  Logger.log(true, `statuses/retweet/${tweet.user.screen_name}/${tweet.id_str}`);
                } catch (e) {
                  Logger.log(e.message || e, `statuses/retweet/${tweet.user.screen_name}/${tweet.id_str}`);
                  if ((e.message || '').match(/ over daily status update limit/i)) this.wait = 1;
                  // if ((e.message || '').match(/ blocked /i)) {
                  //   await this.twitter.post('statuses/update', { status: `@${tweet.user.screen_name} blocked you, you can't retweet this https://twitter.com/${tweet.user.screen_name}/status/${tweet.id_str}` });
                  //   await new this.retweetsModel({ _id: tweet.id_str }).save();
                  //   Logger.log(true, `statuses/update/${tweet.user.screen_name}/${tweet.id_str}`);
                  // }
                }

                resolve(true);
              }, 1000 * 5));
            }
          }

          if (-1 < services.indexOf('favorite')) {
            const topFavorited = await this.usersModel
              .where({ time: { $gte: moment().subtract(7, 'days').toDate() } })
              .sort({ favourites_count: 'desc' })
              .limit(100)
              .find();

            if (!tweet.favorited
              && find(topFavorited, { _id: tweet.user.screen_name })
              && !await this.favoritesModel.where({ _id: tweet.id_str }).findOne()) {
              await new Promise(resolve => setTimeout(async () => {
                try {
                  await this.twitter.post('favorites/create', { id: tweet.id_str });
                  await new this.favoritesModel({ _id: tweet.id_str }).save();
                  Logger.log(true, `favorites/create/${tweet.user.screen_name}/${tweet.id_str}`);
                } catch (e) {
                  Logger.log(e.message || e, `favorites/create/${tweet.user.screen_name}/${tweet.id_str}`);
                }

                resolve(true);
              }, 1000 * 5));
            }
          }
        }
      }
    }

    return { since_id: this.since_id };
  }
}
