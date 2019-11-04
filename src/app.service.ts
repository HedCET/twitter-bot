import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { find, last, shuffle, sortBy } from 'lodash';
import * as moment from 'moment';
import { Model } from 'mongoose';
import * as twit from 'twit';

import { modelTokens } from './db.imports';
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

  async update() {
    if (!this.since_id) {
      const lastTweet = await this.retweetsModel
        .where()
        .sort({ _id: 'desc' })
        .findOne();

      if (lastTweet) this.since_id = lastTweet._id;
      else {
        let looping: boolean = true;

        while (looping) {
          const query: { count: number, screen_name: string, since_id?: string }
            = { count: 200, screen_name: 'crawlamma' };

          if (this.since_id)
            query.since_id = this.since_id;

          await new Promise(resolve => setTimeout(async () => {
            try {
              const timeline: { data: { id: number, id_str: string }[] } = await this.twitter
                .get('statuses/user_timeline', query);

              if (timeline.data.length) {
                for (const tweet of timeline.data) {
                  if (!await this.retweetsModel.where({ _id: tweet.id_str }).findOne())
                    await new this.retweetsModel({ _id: tweet.id_str }).save();
                }

                this.since_id = last(sortBy(timeline.data, 'id')).id_str;
              } else looping = false;

              Logger.log(this.since_id, 'statuses/user_timeline');
            } catch (e) {
              Logger.log(e.message || e, 'statuses/user_timeline');
            }

            resolve(true);
          }, 1000 * 5));
        }

        const lastTweet = await this.retweetsModel
          .where()
          .sort({ _id: 'desc' })
          .findOne();

        if (lastTweet)
          this.since_id = lastTweet._id;
      }
    }

    let looping: boolean = (this.wait-- < 1 ? true : false);
    let i: number = 1;

    while (looping) {
      const topFavorited = await this.usersModel
        .where({ time: { $gte: moment().subtract(1, 'days').toDate() } })
        .sort({ favourites_count: 'desc' })
        .limit(100)
        .find();

      const tweets: { data: { search_metadata: { max_id_str: string }, statuses: { entities: { urls: object[] }, favorited: boolean, id_str: string, is_quote_status: boolean, retweeted: boolean, user: { favourites_count: number, followers_count: number, friends_count: number, screen_name: string } }[] } } = await this.twitter
        .get('search/tweets', { count: 100, lang: 'ml', q: '* AND -@crawlamma AND -filter:replies AND -filter:retweets', result_type: 'recent', since_id: this.since_id });

      if (tweets.data.statuses.length) this.since_id = tweets.data.search_metadata.max_id_str;
      else looping = false;

      for (const tweet of shuffle(tweets.data.statuses)) {
        await this.usersModel.updateOne({ _id: tweet.user.screen_name },
          { $set: { favourites_count: tweet.user.favourites_count, friends_count: tweet.user.friends_count, time: moment().toDate() } },
          { upsert: true });

        if ((!tweet.entities.urls.length || (tweet.entities.urls.length && 100 < tweet.user.followers_count))
          && (!tweet.is_quote_status || (tweet.is_quote_status && 10 < tweet.user.followers_count))
          && !tweet.retweeted
          && !await this.retweetsModel.where({ _id: tweet.id_str }).findOne()) {
          if (5 < i++) looping = false;
          else {
            await new Promise(resolve => setTimeout(async () => {
              try {
                await this.twitter.post('statuses/retweet', { id: tweet.id_str });
                await new this.retweetsModel({ _id: tweet.id_str }).save();
                Logger.log(tweet.user.screen_name, `retweet/${tweet.id_str}`);
              } catch (e) {
                Logger.log(e.message || e, `retweet/${tweet.id_str}`);
                if ((e.message || '').match(/ blocked /i)) {
                  await this.twitter.post('statuses/update', { status: `@${tweet.user.screen_name} blocked you\nyou can't retweet this https://twitter.com/${tweet.user.screen_name}/status/${tweet.id_str}` });
                  await new this.retweetsModel({ _id: tweet.id_str }).save();
                  Logger.log(tweet.user.screen_name, 'retweet/blocked');
                }
                if ((e.message || '').match(/ over daily status update limit /i)) this.wait = 10;
              }

              resolve(true);
            }, 1000 * 5));
          }
        }

        if (!tweet.favorited
          && find(topFavorited, { _id: tweet.user.screen_name })
          && !await this.favoritesModel.where({ _id: tweet.id_str }).findOne()) {
          await new Promise(resolve => setTimeout(async () => {
            try {
              await this.twitter.post('favorites/create', { id: tweet.id_str });
              await new this.favoritesModel({ _id: tweet.id_str }).save();
              Logger.log(tweet.user.screen_name, `favorites/${tweet.id_str}`);
            } catch (e) {
              Logger.log(e.message || e, `favorites/${tweet.id_str}`);
              if ((e.message || '').match(/ blocked /i)) Logger.log(tweet.user.screen_name, 'favorites/blocked');
            }

            resolve(true);
          }, 1000 * 5));
        }
      }

      // const followingUsers = await this.usersModel
      //   .where({ friends: true })
      //   .find();

      // const topFollowingUsers = await this.usersModel
      //   .where({ time: { $gte: moment().subtract(7, 'days').toDate() } })
      //   .sort({ friends_count: 'desc' })
      //   .limit(100)
      //   .find();

      // for (const followingUser of followingUsers) {
      //   if (!find(topFollowingUsers, { _id: followingUser._id })) {
      //     await new Promise(resolve => setTimeout(async () => {
      //       try {
      //         await this.twitter.post('friendships/destroy', { screen_name: followingUser._id });
      //         await this.usersModel.updateOne({ _id: followingUser._id }, { $unset: { friends: true } });
      //         Logger.log(followingUser._id, 'friendships/destroy');
      //       } catch (e) {
      //         Logger.log(e.message || e, 'friendships/destroy');
      //       }

      //       resolve(true);
      //     }, 1000 * 5));
      //   }
      // }

      // for (const topFollowingUser of topFollowingUsers) {
      //   if (!find(followingUsers, { _id: topFollowingUser._id })) {
      //     await new Promise(resolve => setTimeout(async () => {
      //       try {
      //         await this.twitter.post('friendships/create', { screen_name: topFollowingUser._id });
      //         await this.usersModel.updateOne({ _id: topFollowingUser._id }, { $set: { friends: true } });
      //         Logger.log(topFollowingUser._id, 'friendships/create');
      //       } catch (e) {
      //         Logger.log(e.message || e, 'friendships/create');
      //         if ((e.message || '').match(/ blocked /i)) Logger.log(topFollowingUser._id, 'friendships/blocked');
      //       }

      //       resolve(true);
      //     }, 1000 * 5));
      //   }
      // }
    }

    return { since_id: this.since_id };
  }
}
