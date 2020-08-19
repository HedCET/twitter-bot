export const scripts = {
  // client[Instance] => https://www.npmjs.com/package/twitter-lite
  // executor[object] | tweeter[Object] =>
  //   {
  //      _id: String;
  //      averageFollowers?: Number;
  //      averageFriends?: Number;
  //      averageLikes?: Number;
  //      averageLists?: Number;
  //      createdAt?: Date;
  //      followers?: Number;
  //      friends?: Number;
  //      likes?: Number;
  //      lists?: Number;
  //      name: String;
  //      tweetedAt?: Date;
  //      tweetFrequency?: Number;
  //      tweets?: Number;
  //   }
  // status[Object] => https://developer.twitter.com/en/docs/twitter-api/v1/data-dictionary/overview/intro-to-tweet-json

  // https://twitter.com/crawlamma
  crawlamma: {
    async execute({ client, executor, tweeter, status }) {
      if (
        executor._id !== tweeter._id &&
        (!tweeter.tweetFrequency || 30 < (tweeter.tweetFrequency || 0))
      ) {
        await client.post('statuses/retweet', { id: status.id_str });
        await new Promise(r => setTimeout(r, 1000 * 10)); // delay 10 seconds
      }
    },

    // search/tweets => https://developer.twitter.com/en/docs/twitter-api/v1/tweets/search/api-reference/get-search-tweets
    searchQuery: {
      count: 100,
      lang: 'ml',
      q: '%2A', // '*',
      result_type: 'recent',
      tweet_mode: 'extended',
    },
  },

  // https://twitter.com/kulukulu0033
  // kulukulu0033: {
  //   async execute({ client, executor, tweeter, status }) {
  //     if (
  //       executor._id !== tweeter._id &&
  //       status.full_text.match(/സ്വാമിന.*/g)
  //     ) {
  //       await client.post('statuses/retweet', { id: status.id_str });
  //       await new Promise(r => setTimeout(r, 1000 * 10));
  //     }
  //   },

  //   searchQuery: {
  //     count: 100,
  //     lang: 'ml',
  //     q: '%2A',
  //     result_type: 'recent',
  //     tweet_mode: 'extended',
  //   },
  // },

  // https://twitter.com/kuklamma
  kuklamma: {
    async execute({ client, executor, tweeter, status }) {
      if (
        executor._id !== tweeter._id &&
        (!tweeter.tweetFrequency || 30 < (tweeter.tweetFrequency || 0))
      ) {
        await client.post('statuses/retweet', { id: status.id_str });
        await new Promise(r => setTimeout(r, 1000 * 10));
      }
    },

    searchQuery: {
      count: 100,
      lang: 'ta',
      q: '%2A',
      result_type: 'recent',
      tweet_mode: 'extended',
    },
  },
};
