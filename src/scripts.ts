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
        (768 < (tweeter.averageFollowers || 0) ||
          256 < (tweeter.averageFriends || 0) ||
          2304 < (tweeter.averageLikes || 0) ||
          !tweeter.tweetFrequency ||
          90 < (tweeter.tweetFrequency || 0)) &&
        !status.retweeted && // with searchQuery
        !status.full_text.startsWith(
          `RT @${status.retweeted_status?.user?.screen_name}: ${(
            status.retweeted_status?.full_text || ''
          ).substr(0, 110)}`,
        )
      )
        // statuses/retweet => https://developer.twitter.com/en/docs/twitter-api/v1/tweets/post-and-engage/api-reference/post-statuses-retweet-id
        await client.post('statuses/retweet', { id: status.id_str });
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
  //       status.full_text.match(/സ്വാമിന.*/g) &&
  //       !status.full_text.startsWith(
  //         `RT @${status.retweeted_status?.user?.screen_name}: ${(
  //           status.retweeted_status?.full_text || ''
  //         ).substr(0, 110)}`,
  //       )
  //     )
  //       await client.post('statuses/retweet', { id: status.id_str });
  //   },

  //   searchQuery: 'crawlamma.searchQuery', // attach to crawlamma as children
  // },
};
