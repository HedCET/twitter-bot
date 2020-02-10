import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as BigInt from 'big-integer';
import { each, find, pick, sample, sortBy, takeRight } from 'lodash';
import * as moment from 'moment';
import * as twit from 'twit';

import { AmqpService } from './amqp.service';
import { env } from './env.validations';
import { db } from './firebase';
import { search_req, search_res } from './twitter.interface';
import { userInterface } from './user.interface';

@Injectable()
export class AppService {
  private cache: { [key: string]: any };

  constructor(
    private readonly amqpService: AmqpService,
    @Inject('TWITTER') private readonly twitter: typeof twit,
  ) {}

  @Cron('0 0,10,20,30,40,50 * * * *')
  async update() {
    let maxId;

    for (let i = 0; i < 30; i++) {
      const query: search_req = {
        count: 100,
        lang: 'ml',
        q: '*',
        result_type: 'recent',
      };

      if (maxId) query.max_id = maxId;

      const tweets: search_res = await this.twitter.get('search/tweets', query);

      if (!tweets.data.statuses.length) break;

      const statuses = sortBy(tweets.data.statuses, [
        item =>
          `${moment(item.created_at, ['ddd MMM D HH:mm:ss ZZ YYYY']).format(
            'x',
          )}.${item.id_str}`,
      ]);
      maxId = BigInt(statuses[0].id_str)
        .subtract(1)
        .toString();

      let successTweets = 0;

      for (const tweet of statuses) {
        const created_at = +moment(tweet.user.created_at, [
          'ddd MMM D HH:mm:ss ZZ YYYY',
        ]).format('x');
        const tweeted_at = +moment(tweet.created_at, [
          'ddd MMM D HH:mm:ss ZZ YYYY',
        ]).format('x');

        const user: userInterface = { created_at, tweeted_at };

        if (tweet.user.favourites_count)
          user.favourites = tweet.user.favourites_count;
        if (tweet.user.followers_count)
          user.followers = tweet.user.followers_count;
        if (tweet.user.friends_count) user.friends = tweet.user.friends_count;

        const userRef = db.ref(`users/${tweet.user.screen_name}`);
        const userRefVal = (await userRef.once('value')).val();

        if (userRefVal && moment(tweeted_at).isAfter(userRefVal.tweeted_at)) {
          user.last_tweeted_at_frequency = moment
            .duration(moment(tweeted_at).diff(userRefVal.tweeted_at))
            .asDays();

          if (
            userRefVal.favourites &&
            tweet.user.favourites_count != userRefVal.favourites
          )
            user.last_favourites_average =
              (tweet.user.favourites_count - userRefVal.favourites) /
              user.last_tweeted_at_frequency;
          if (
            userRefVal.followers &&
            tweet.user.followers_count != userRefVal.followers
          )
            user.last_followers_average =
              (tweet.user.followers_count - userRefVal.followers) /
              user.last_tweeted_at_frequency;
          if (
            userRefVal.friends &&
            tweet.user.friends_count != userRefVal.friends
          )
            user.last_friends_average =
              (tweet.user.friends_count - userRefVal.friends) /
              user.last_tweeted_at_frequency;

          userRef.update(user);
        } else {
          // Logger.log({ [tweet.user.screen_name]: user }, 'AppService/update');
          userRef.set(user);
        }

        const tweetRef = db.ref(`tweets/${tweet.id_str}`);
        const tweetRefVal = (await tweetRef.once('value')).val();

        if (!tweetRefVal) {
          tweetRef.set(tweeted_at);
          successTweets++;
        }
      }

      if (!successTweets) break;

      Logger.log(
        `${i + 1}|${statuses.length}|${successTweets}`,
        'AppService/update',
      );
      await new Promise(r => setTimeout(r, 1000 * 10));
    }

    const tweetsThresholdRef = db.ref('tweets');
    const tweetsThresholdRefVal = (
      await tweetsThresholdRef
        .orderByKey()
        .limitToLast(1000)
        .once('value')
    ).val();

    const endAt = Object.keys(tweetsThresholdRefVal)[0];

    (
      await tweetsThresholdRef
        .orderByKey()
        .endAt(endAt)
        .once('value')
    ).forEach(item => {
      if (item.key != endAt) tweetsThresholdRef.child(item.key).remove();
    });

    return true;
  }

  @Cron('30 2,12,22,32,42,52 * * * *')
  async _wordart(key: string = '') {
    if (key) {
      let startAt: number;
      const usersRef = db.ref('users');

      (
        await usersRef
          .orderByChild('tweeted_at')
          .limitToLast(1)
          .once('value')
      ).forEach(user => {
        startAt = +moment(user.val().tweeted_at)
          .subtract(10, 'minutes')
          .format('x');
      });

      const data = { startAt, tweeters: [], wordArt: {} };

      for (let i = 0; data.tweeters.length < 10 && i < 10; i++) {
        if (i)
          data.startAt = +moment(data.startAt)
            .subtract(i * 10, 'minutes')
            .format('x');

        (
          await usersRef
            .orderByChild('tweeted_at')
            .startAt(data.startAt)
            .once('value')
        ).forEach(user => {
          const value = user.val()[
            `last_${key}_${key == 'tweeted_at' ? 'frequency' : 'average'}`
          ];

          if (0 < value && !find(data.tweeters, { key: user.key })) {
            data.tweeters.push({
              key: user.key,
              value: Math.ceil(value),
            });
          }
        });
      }

      try {
        if (data.tweeters.length) {
          const rpc = await this.amqpService.request(
            {},
            {
              sendOpts: {
                headers: {
                  image: env.WORDART_IMAGE_URLS
                    ? sample(env.WORDART_IMAGE_URLS.split('|'))
                    : '',
                  words: data.tweeters
                    .map(item => `${item.key};${item.value}`)
                    .join('\n'),
                },
              },
            },
          );

          data.wordArt = JSON.parse(rpc.content.toString());

          if (this.cache) this.cache[key] = data;
          else this.cache = { [key]: data };
        }
      } catch (e) {
        Logger.log(e.message, `AppService/${key}`);
      }
    } else {
      await this._wordart('favourites');
      await this._wordart('followers');
      await this._wordart('friends');
      await this._wordart('tweeted_at');
    }

    return this.cache;
  }

  async wordart(key: string = '') {
    if (!this.cache) await this._wordart();

    if (key && this.cache[key]) return this.cache[key].wordArt;
    else {
      const json = {};

      each(
        pick(this.cache, ['favourites', 'followers', 'friends', 'tweeted_at']),
        (value, key) => {
          json[key] = {
            hits: value.tweeters.map(tweeter => tweeter.key),
            startAt: value.startAt,
          };
        },
      );

      return json;
    }
  }

  async search(key: string = '') {
    const hits = [];
    const userRef = db.ref('users');

    (key
      ? await userRef
          .orderByKey()
          .startAt(key)
          .endAt(`${key}\uf8ff`)
          .once('value')
      : await userRef.orderByChild('tweeted_at').once('value')
    ).forEach(snapshot => {
      // if (!find(hits, { _id: snapshot.key }))
      hits.push({ ...snapshot.val(), _id: snapshot.key });
    });

    return {
      hits: takeRight(sortBy(hits, ['tweeted_at']), 10),
      total: hits.length,
    };
  }
}
