import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { find, shuffle, sortBy } from 'lodash';
import * as moment from 'moment';
import { Model } from 'mongoose';
import * as twit from 'twit';

import { modelTokens } from './db.imports';
import { env } from './env.validations';
import { favoritesInterface } from './favorites.interface';
import { messagesInterface } from './messages,interface';
import { retweetsInterface } from './retweets,interface';
import { usersInterface } from './users.interface';

@Injectable()
export class AppService {
  private since_id: string = '0';
  private wait: number = 0;

  constructor(
    @Inject('TWITTER') private readonly twitter: typeof twit,
    @InjectModel(modelTokens.favorites) private readonly favoritesModel: Model<favoritesInterface>,
    @InjectModel(modelTokens.messages) private readonly messagesModel: Model<messagesInterface>,
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

      const tweets: { data: { search_metadata: { max_id_str: string }, statuses: { entities: { urls: object[] }, favorited: boolean, id_str: string, is_quote_status: boolean, retweeted: boolean, user: { favourites_count: number, followed_by: boolean, following: boolean, protected: boolean, screen_name: string } }[] } } = await this.twitter
        .get('search/tweets', { count: 100, lang: 'ml', q: env.TWITTER_SEARCH_QUERY, result_type: 'recent', since_id: this.since_id });

      if (tweets.data.statuses.length) this.since_id = tweets.data.search_metadata.max_id_str;
      else break;

      for (const tweet of shuffle(tweets.data.statuses)) {
        await this.usersModel.updateOne({ _id: tweet.user.screen_name },
          { $set: { favourites_count: tweet.user.favourites_count, followers: tweet.user.followed_by || false, friends: tweet.user.following, time: moment().toDate() } },
          { upsert: true });

        if (!tweet.user.protected
          && !await this.usersModel.where({ _id: tweet.user.screen_name, blocked: true }).findOne()) {
          if ((!tweet.entities.urls.length || (tweet.entities.urls.length && 10 < tweet.user.favourites_count))
            && (!tweet.is_quote_status || (tweet.is_quote_status && 1 < tweet.user.favourites_count))
            && !tweet.retweeted
            && !await this.retweetsModel.where({ _id: tweet.id_str }).findOne()) {
            if (retweetsThreshold-- < 0
              || 0 < this.wait) looping = false;
            else {
              await new Promise(resolve => setTimeout(resolve, 1000 * 5));

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
            }
          }

          if (-1 < services.indexOf('favorites')) {
            const topFavorited = await this.usersModel
              .where({ time: { $gte: moment().subtract(7, 'days').toDate() } })
              .sort({ favourites_count: 'desc' })
              .limit(100)
              .find();

            if (!tweet.favorited
              && find(topFavorited, { _id: tweet.user.screen_name })
              && !await this.favoritesModel.where({ _id: tweet.id_str }).findOne()) {
              await new Promise(resolve => setTimeout(resolve, 1000 * 5));

              try {
                await this.twitter.post('favorites/create', { id: tweet.id_str });
                await new this.favoritesModel({ _id: tweet.id_str }).save();
                Logger.log(true, `favorites/create/${tweet.user.screen_name}/${tweet.id_str}`);
              } catch (e) {
                Logger.log(e.message || e, `favorites/create/${tweet.user.screen_name}/${tweet.id_str}`);
              }
            }
          }
        }
      }
    }

    if (-1 < services.indexOf('messages')) {
      let cursor;

      for (let i = 0; i < 15; i++) {
        const options: { count: number, cursor?: number } = { count: 50 };

        if (cursor)
          options.cursor = cursor;

        const messages = await this.twitter.get('direct_messages/events/list', options);

        if (messages.data.next_cursor) cursor = messages.data.next_cursor;
        else i = 15;

        for (const message of sortBy(messages.data.events, 'id').reverse()) {
          if (!await this.messagesModel.where({ _id: message.id }).findOne()) {
            await new this.messagesModel({ _id: message.id }).save();

            if (message.message_create.sender_id === '124361980') {
              if (message.message_create.message_data.entities.urls.length) {
                const data = (message.message_create.message_data.entities.urls[0].expanded_url || '')
                  .match(/twitter\.com\/([^/]+)\/status\/([0-9a-z]+)$/i);

                if (data) {
                  await new Promise(resolve => setTimeout(resolve, 1000 * 5));

                  try {
                    await this.twitter.post('statuses/unretweet', { id: data[2] });
                    await this.retweetsModel.deleteOne({ _id: data[2] });
                    Logger.log(true, `statuses/unretweet/${data[1]}/${data[2]}`);
                  } catch (e) {
                    Logger.log(e.message || e, `statuses/unretweet/${data[1]}/${data[2]}`);
                  }
                }
              }

              if (message.message_create.message_data.entities.user_mentions.length) {
                const user = await this.usersModel.where({ _id: message.message_create.message_data.entities.user_mentions[0].screen_name }).findOne();
                if (user) await this.usersModel.updateOne({ _id: user._id }, { $set: { blocked: !user.blocked } });
                Logger.log(user ? !user.blocked : 'userNotFound', `blocked/${message.message_create.message_data.entities.user_mentions[0].screen_name}`);
              }
            }
          } else i = 15;
        }
      }
    }

    if (-1 < services.indexOf('accounts')) {
      let cursor;
      let looping: boolean = true;

      while (looping) {
        const options: { count: number, cursor?: number } = { count: 200 };

        if (cursor)
          options.cursor = cursor;

        const friends = await this.twitter.get('friends/list', options);

        if (friends.data.next_cursor) {
          await new Promise(resolve => setTimeout(resolve, 1000 * 60));
          cursor = friends.data.next_cursor;
        } else looping = false;

        for (const friend of friends.data.users) {
          Logger.log(friend.followed_by, `friend/list/${friend.screen_name}`);

          await this.usersModel.updateOne({ _id: friend.screen_name },
            { $set: { followers: friend.followed_by, friends: true, time: moment().toDate() } },
            { upsert: true });
        }
      }

      const unfriends = await this.usersModel
        .where({ friends: true, followers: false })
        .find();

      for (const unfriend of unfriends) {
        await new Promise(resolve => setTimeout(resolve, 1000 * 5));

        try {
          await this.twitter.post('friendships/destroy', { screen_name: unfriend._id });
          Logger.log(true, `friendships/destroy/${unfriend._id}`);
        } catch (e) {
          Logger.log(e.message || e, `friendships/destroy/${unfriend._id}`);
        }
      }
    }

    return { since_id: this.since_id };
  }
}
