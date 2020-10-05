import { connect, connection } from 'amqplib';
import { request } from 'amqplib-rpc';
import { groupBy, last, random, sampleSize, sortBy } from 'lodash';
import * as moment from 'moment';
import * as fetch from 'node-fetch';
import { isJSON } from 'validator';

import { env } from './env.validations';

const urls = env.BANNER_IMAGE_URLS ? env.BANNER_IMAGE_URLS.split('|') : [];
let index = random(urls.length);
let amqp: connection;

export const scripts = {
  // client[Instance] => https://www.npmjs.com/package/twitter-lite
  // executor[object] | tweeter[Object] =>
  //   {
  //      _id: String;
  //      averageFollowers?: Number; // per day
  //             Friends?: Number;
  //             Likes?: Number;
  //             Lists?: Number;
  //      createdAt?: Date;
  //      followers?: Number;
  //      friends?: Number;
  //      likes?: Number;
  //      lists?: Number;
  //      name: String;
  //      tweetedAt?: Date;
  //      tweetFrequency?: Number; // duration in days
  //      tweets?: Number;
  //   }
  // status[Object] => https://developer.twitter.com/en/docs/twitter-api/v1/data-dictionary/overview/intro-to-tweet-json

  // https://twitter.com/crawlamma
  crawlamma: {
    // search/tweets => https://developer.twitter.com/en/docs/twitter-api/v1/tweets/search/api-reference/get-search-tweets
    searchQuery: {
      count: 100,
      lang: 'ml',
      q: '%2A', // '*',
      result_type: 'recent',
      tweet_mode: 'extended',
    },

    async then({ client, executor, tweeter, status }) {
      if (executor._id !== tweeter._id) {
        const updatedAt = moment();

        if (moment(this.loopExpiredAt ?? 0).isBefore(updatedAt)) {
          this.loopExpiredAt = updatedAt.clone().add(3, 'minutes');

          if ((this.retweeted ?? 5) < 5 && 30 < (this.tweets ?? []).length) {
            const tweets = [];

            for (const group of Object.values(
              groupBy(this.tweets, 'tweeterName'),
            ))
              tweets.push(last(sortBy(group, ['tweetFrequency'])));

            if (30 < tweets.length) {
              sampleSize(tweets, 5 - this.retweeted).forEach(async tweet => {
                try {
                  await client.post('statuses/retweet', {
                    id: tweet.tweetId,
                  }); // statuses/retweet => https://developer.twitter.com/en/docs/twitter-api/v1/tweets/post-and-engage/api-reference/post-statuses-retweet-id
                } catch (e) {
                  console.error(`${tweet.tweeterName}/${tweet.tweetId}`, e);
                }
              });

              this.tweets = [];
            }
          }

          this.retweeted = 5 < (this.retweeted ?? 0) ? this.retweeted - 5 : 0;
        }

        if (
          status.full_text.match(/[\u0d00-\u0d7f]{3,}/) &&
          !status.retweeted && // with searchQuery
          !status.full_text.startsWith(
            `RT @${status.retweeted_status?.user?.screen_name}: ${(
              status.retweeted_status?.full_text ?? ''
            ).substr(0, 110)}`,
          )
        )
          if (!tweeter.tweetFrequency || 7 < tweeter.tweetFrequency) {
            this.retweeted += 1;
            await client.post('statuses/retweet', { id: status.id_str }); // statuses/retweet => https://developer.twitter.com/en/docs/twitter-api/v1/tweets/post-and-engage/api-reference/post-statuses-retweet-id
          } else if (
            !(status.entities?.urls ?? []).filter(
              i => !i.expanded_url.match(/^https?:\/\/(t\.co|twitter\.com)\//),
            ).length
          )
            this.tweets = [
              ...(this.tweets ?? []),
              {
                tweeterName: tweeter.name,
                tweetFrequency: tweeter.tweetFrequency,
                tweetId: status.id_str,
              },
            ];

        if (
          moment(this.descriptionUpdatedAt ?? 0).isBefore(updatedAt) &&
          (status.user.name.match(/[\u0d00-\u0d7f]{3,}/) ||
            status.user.description.match(/[\u0d00-\u0d7f]{3,}/)) &&
          !(this.promotedUsers ?? []).includes(status.user.id_str)
        ) {
          this.descriptionUpdatedAt = updatedAt.clone().add(1, 'minute');

          const description = `${status.user.name} (@${status.user.screen_name}) ${status.user.description}`
            .replace(/\s+/g, ' ')
            .trim();

          // account/update_profile => https://developer.twitter.com/en/docs/twitter-api/v1/accounts-and-users/manage-account-settings/api-reference/post-account-update_profile
          await client.post('account/update_profile', {
            description:
              160 < description.length
                ? `${description.substr(0, 157)}...`
                : description,
            skip_status: true,
          });

          this.promotedUsers = [
            ...(!this.promotedUsers || 7 * 24 * 60 < this.promotedUsers.length
              ? []
              : this.promotedUsers),
            status.user.id_str,
          ];
        }

        if (status.full_text.match(/ക്രോ(ള|ള്ള)(മ്മ|മ്മെ|മ്മേ)/g))
          this.tweetshots = [
            ...(this.tweetshots ?? []),
            {
              tweeterName: tweeter.name,
              tweetId: status.id_str,
            },
          ];

        if (moment(this.bannerUpdatedAt ?? 0).isBefore(updatedAt)) {
          this.bannerUpdatedAt = updatedAt.clone().add(1, 'minute');

          if (this.tweetshots?.length) {
            if (!amqp) amqp = await connect(env.TWEETSHOT_AMQP_URL);

            const tweet = this.tweetshots.shift();
            let content;

            try {
              content = (
                await request(amqp, env.TWEETSHOT_AMQP_QUEUE_NAME, tweet)
              ).content.toString();
            } catch (e) {
              console.error(`${tweet.tweeterName}/${tweet.tweetId}`, e);
            }

            if (content) {
              if (isJSON(content)) {
                const { base64, statusCode, statusText } = JSON.parse(content);

                if (statusCode === 200) {
                  // account/update_profile_banner => https://developer.twitter.com/en/docs/twitter-api/v1/accounts-and-users/manage-account-settings/api-reference/post-account-update_profile_banner
                  await client.post('account/update_profile_banner', {
                    banner: base64,
                  });

                  this.bannerUpdatedAt = updatedAt.clone().add(5, 'minutes');
                } else
                  console.error(
                    `${tweet.tweeterName}/${tweet.tweetId}`,
                    statusText,
                  );
              } else
                console.error(
                  `${tweet.tweeterName}/${tweet.tweetId}`,
                  'invalid JSON content',
                  content,
                );
            }
          } else {
            if (urls.length)
              await fetch(urls[index++ % urls.length])
                .then(res => res.buffer())
                .then(async res => {
                  // account/update_profile_banner => https://developer.twitter.com/en/docs/twitter-api/v1/accounts-and-users/manage-account-settings/api-reference/post-account-update_profile_banner
                  await client.post('account/update_profile_banner', {
                    banner: res.toString('base64'),
                  });
                });
            else await client.post('account/remove_profile_banner'); // account/remove_profile_banner => https://developer.twitter.com/en/docs/twitter-api/v1/accounts-and-users/manage-account-settings/api-reference/post-account-remove_profile_banner
          }
        }
      }
    },
  },

  // https://twitter.com/kulukulu0033
  // kulukulu0033: {
  //   searchQuery: 'crawlamma.searchQuery', // attach to crawlamma as children

  //   async then({ client, executor, tweeter, status }) {
  //     if (
  //       executor._id !== tweeter._id &&
  //       status.full_text.match(/സ്വാമിന.*/g) &&
  //       !status.full_text.startsWith(
  //         `RT @${status.retweeted_status?.user?.screen_name}: ${(
  //           status.retweeted_status?.full_text ?? ''
  //         ).substr(0, 110)}`,
  //       )
  //     )
  //       await client.post('statuses/retweet', { id: status.id_str });
  //   },
  // },
};
