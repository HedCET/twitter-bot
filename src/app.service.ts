import { Inject, Injectable, Logger } from '@nestjs/common';
import * as BigInt from 'big-integer';
import { sortBy } from 'lodash';
import * as moment from 'moment';
import * as twit from 'twit';

import { db } from './firebase';
import { search_req, search_res } from './twitter.interface';
import { userInterface } from './user.interface';

@Injectable()
export class AppService {
  constructor(@Inject('TWITTER') private readonly twitter: typeof twit) {}

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
        } else userRef.set(user);

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
}
