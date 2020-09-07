const fetch = require('node-fetch');

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
        const lastUpdatedAt = new Date().getTime();

        if (
          (this.lastUpdatedAt || 0) < lastUpdatedAt &&
          status.user.description.match(/[\u0d00-\u0d7f]/) &&
          status.user.profile_banner_url &&
          status.user.profile_image_url &&
          !status.user.verified
        ) {
          this.lastUpdatedAt = lastUpdatedAt + 1000 * 60;

          const {
            description,
            location,
            name,
            profile_banner_url,
            profile_image_url,
            profile_link_color,
            url,
          } = status.user;

          await fetch(profile_banner_url)
            .then(res => res.buffer())
            .then(async res => {
              // account/update_profile_banner => https://developer.twitter.com/en/docs/twitter-api/v1/accounts-and-users/manage-account-settings/api-reference/post-account-update_profile_banner
              await client.post('account/update_profile_banner', {
                banner: res.toString('base64'),
              });
            });

          await fetch(profile_image_url.replace(/_(bigger|mini|normal)\./, '.'))
            .then(res => res.buffer())
            .then(async res => {
              // account/update_profile_image => https://developer.twitter.com/en/docs/twitter-api/v1/accounts-and-users/manage-account-settings/api-reference/post-account-update_profile_image
              await client.post('account/update_profile_image', {
                image: res.toString('base64'),
                skip_status: true,
              });
            });

          // account/update_profile => https://developer.twitter.com/en/docs/twitter-api/v1/accounts-and-users/manage-account-settings/api-reference/post-account-update_profile
          await client.post('account/update_profile', {
            description,
            location: location || '',
            name,
            profile_link_color,
            skip_status: true,
            url: url || '',
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
