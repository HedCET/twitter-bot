import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as BigInt from 'big-integer';
import { each, find, isEqual, pick, random, size, sortBy } from 'lodash';
import * as moment from 'moment';
import * as twit from 'twit';
import { isJSON } from 'validator';

import { AmqpService } from './amqp.service';
import { env } from './env.validations';
import { db } from './firebase';
import { search_req, search_res } from './twitter.interface';
import { userInterface } from './user.interface';

@Injectable()
export class AppService {
  private cache: { [key: string]: any };
  private readonly services = [
    'favourites',
    'followers',
    'friends',
    'lists',
    'tweeted_at',
  ];

  constructor(
    private readonly amqpService: AmqpService,
    @Inject('TWITTER') private readonly twitter: typeof twit,
  ) {}

  // @Cron('0 0,10,20,30,40,50 * * * *')
  async update() {
    // pick twitter instance

    for (let i = 0, maxId; i < 30; i++) {
      const query: search_req = {
        count: 100,
        lang: 'ml',
        q: '*',
        result_type: 'recent',
        tweet_mode: 'extended',
      };

      // limit 100 & skip till maxId
      if (maxId) query.max_id = maxId;

      const tweets: search_res = await this.twitter.get('search/tweets', query);

      // break if no status
      if (!tweets.data.statuses.length) break;

      // ascending sort
      const statuses = sortBy(tweets.data.statuses, [
        item =>
          `${moment(item.created_at, ['ddd MMM D HH:mm:ss ZZ YYYY']).format(
            'x',
          )}.${item.id_str}`,
      ]);

      // set maxId for next iteration
      maxId = BigInt(statuses[0].id_str)
        .subtract(1)
        .toString();

      // new tweets counter
      let newTweets = 0;

      for (const status of statuses) {
        const created_at = +moment(status.user.created_at, [
          'ddd MMM D HH:mm:ss ZZ YYYY',
        ]).format('x');
        const tweeted_at = +moment(status.created_at, [
          'ddd MMM D HH:mm:ss ZZ YYYY',
        ]).format('x');

        const user: userInterface = { created_at, tweeted_at };

        user.favourites = status.user.favourites_count || null;
        user.followers = status.user.followers_count || null;
        user.friends = status.user.friends_count || null;
        user.lists = status.user.listed_count || null;
        user.tweets = status.user.statuses_count || null;

        const userRef = db.ref(`users/${status.user.screen_name}`);
        const userRefVal = (await userRef.once('value')).val();

        if (userRefVal && moment(tweeted_at).isAfter(userRefVal.tweeted_at)) {
          user.last_tweeted_at_frequency = moment
            .duration(moment(tweeted_at).diff(userRefVal.tweeted_at))
            .asDays();

          // average favourites per day
          if (
            userRefVal.favourites &&
            status.user.favourites_count != userRefVal.favourites
          )
            user.last_favourites_average =
              (status.user.favourites_count - userRefVal.favourites) /
              user.last_tweeted_at_frequency;

          // average followers per day
          if (
            userRefVal.followers &&
            status.user.followers_count != userRefVal.followers
          )
            user.last_followers_average =
              (status.user.followers_count - userRefVal.followers) /
              user.last_tweeted_at_frequency;

          // average friends per day
          if (
            userRefVal.friends &&
            status.user.friends_count != userRefVal.friends
          )
            user.last_friends_average =
              (status.user.friends_count - userRefVal.friends) /
              user.last_tweeted_at_frequency;

          // average lists per day
          if (userRefVal.lists && status.user.listed_count != userRefVal.lists)
            user.last_lists_average =
              (status.user.listed_count - userRefVal.lists) /
              user.last_tweeted_at_frequency;

          if (!isEqual(user, userRefVal)) userRef.update(user);
        } else {
          userRef.set(user);

          // update total users count
          await db.ref(`users_count`).transaction(count => (count || 0) + 1);
        }

        Logger.log(
          { i: i + 1, [status.user.screen_name]: user },
          'AppService/update',
        );

        // RxJS stream

        const tweetRef = db.ref(`tweets/${status.id_str}`);
        const tweetRefVal = (await tweetRef.once('value')).val();

        if (!tweetRefVal) {
          tweetRef.set(tweeted_at);
          newTweets++;
        }
      }

      // no newTweets break
      if (!newTweets) break;

      // wait before next iteration
      await new Promise(r => setTimeout(r, 1000 * 10));
    }

    // latest 999 tweets collection
    const tweetsThresholdRef = db.ref('tweets');
    const tweetsThresholdRefVal = (
      await tweetsThresholdRef
        .orderByKey()
        .limitToLast(1000)
        .once('value')
    ).val();
    (
      await tweetsThresholdRef
        .orderByKey()
        .endAt(Object.keys(tweetsThresholdRefVal)[0])
        .once('value')
    ).forEach(item => {
      tweetsThresholdRef.child(item.key).remove();
    });

    return true;
  }

  // @Cron('30 2,12,22,32,42,52 * * * *')
  async _wordart(key: string = '') {
    if (!this.cache)
      this.cache = {
        WORDART_INDEX: random(env.WORDART_IMAGE_URLS.split('|').length),
      };

    if (-1 < this.services.indexOf(key)) {
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

          if (0 < value && !find(data.tweeters, { key: user.key }))
            data.tweeters.push({
              key: user.key,
              value: Math.ceil(value),
            });
        });
      }

      if (data.tweeters.length)
        this.amqpService
          .request(
            {},
            {
              sendOpts: {
                headers: {
                  image: env.WORDART_IMAGE_URLS.split('|')[
                    this.cache.WORDART_INDEX++ %
                      env.WORDART_IMAGE_URLS.split('|').length
                  ],
                  words: data.tweeters
                    .map(item => `${item.key};${item.value}`)
                    .join('\n'),
                },
              },
            },
          )
          .then(async r => {
            const content = r.content.toString();
            if (isJSON(content)) {
              const json = JSON.parse(content);
              Logger.log(
                { statusCode: json.statusCode, statusText: json.statusText },
                `AppService/${key}`,
              );
              if (json.statusCode == 200) {
                data.wordArt = json.response;
                if (this.cache) this.cache[key] = data;
                else this.cache = { [key]: data };
              } else await this._wordart(key);
            } else
              Logger.error(
                content,
                'invalid JSON response',
                `AppService/${key}`,
              );
          })
          .catch(e => Logger.error(e, e.message, `AppService/${key}`));
    } else for (const service of this.services) await this._wordart(service);

    return this.cache;
  }

  async wordart(key: string = '') {
    if (!this.cache) await this._wordart();

    if (key && -1 < this.services.indexOf(key) && this.cache[key])
      return this.cache[key].wordArt;
    else {
      const json = {};

      each(pick(this.cache, this.services), (value, key) => {
        json[key] = {
          hits: value.tweeters.map(tweeter => tweeter.key),
          startAt: value.startAt,
        };
      });

      return json;
    }
  }

  async search(key: string = '') {
    const hits = [];
    const usersRef = db.ref('users');

    (key
      ? await usersRef
          .orderByKey()
          .startAt(key)
          .endAt(`${key}\uf8ff`)
          .limitToFirst(10)
          .once('value')
      : await usersRef
          .orderByChild('tweeted_at')
          .limitToLast(10)
          .once('value')
    ).forEach(snapshot => {
      hits.push({ ...snapshot.val(), _id: snapshot.key });
    });

    const total = (await db.ref('users_count').once('value')).val();
    return { hits, total };
  }
}
