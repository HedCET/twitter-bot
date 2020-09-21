import { groupBy, last, sampleSize, sortBy } from 'lodash';
import * as moment from 'moment';

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

        if (moment(this.sessionExpiredAt ?? 0).isBefore(updatedAt)) {
          this.sessionExpiredAt = updatedAt.clone().add(3, 'minutes');

          if ((this.retweeted ?? 5) < 5 && 30 < (this.tweets ?? []).length) {
            const tweets = [];

            for (const group of Object.values(
              groupBy(this.tweets, 'tweeterName'),
            ))
              tweets.push(last(sortBy(group, ['tweetFrequency'])));

            if (30 < tweets.length) {
              sampleSize(tweets, 5 - this.retweeted).forEach(async tweet => {
                try {
                  await client.post('statuses/retweet', { id: tweet.tweetId }); // statuses/retweet => https://developer.twitter.com/en/docs/twitter-api/v1/tweets/post-and-engage/api-reference/post-statuses-retweet-id
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
          moment(this.profileUpdatedAt || 0).isBefore(updatedAt) &&
          (status.user.name.match(/[\u0d00-\u0d7f]{3,}/) ||
            status.user.description.match(/[\u0d00-\u0d7f]{3,}/))
        ) {
          this.profileUpdatedAt = updatedAt.clone().add(1, 'minute');

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
