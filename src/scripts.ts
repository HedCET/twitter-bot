const moment = require('moment');

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
        if (
          (!tweeter.tweetFrequency || 7 < tweeter.tweetFrequency) &&
          !status.retweeted && // with searchQuery
          !status.full_text.startsWith(
            `RT @${status.retweeted_status?.user?.screen_name}: ${(
              status.retweeted_status?.full_text || ''
            ).substr(0, 110)}`,
          )
        )
          // statuses/retweet => https://developer.twitter.com/en/docs/twitter-api/v1/tweets/post-and-engage/api-reference/post-statuses-retweet-id
          await client.post('statuses/retweet', { id: status.id_str });

        // profile lastUpdatedAt
        const lastUpdatedAt = moment();

        if (
          moment(this.lastUpdatedAt || 0).isBefore(lastUpdatedAt) &&
          (status.user.name.match(/[\u0d00-\u0d7f]/) ||
            status.user.description.match(/[\u0d00-\u0d7f]/))
        ) {
          this.lastUpdatedAt = lastUpdatedAt.add(1, 'minute');

          // profile description
          const description = `${status.user.name} (@${status.user.screen_name}) ${status.user.description}`;

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
  //           status.retweeted_status?.full_text || ''
  //         ).substr(0, 110)}`,
  //       )
  //     )
  //       await client.post('statuses/retweet', { id: status.id_str });
  //   },
  // },
};
