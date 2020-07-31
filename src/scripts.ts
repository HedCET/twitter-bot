export const scripts = {
  // client[Instance] => https://www.npmjs.com/package/twitter-lite
  // executor[object] | tweeter[Object] =>
  //  {
  //    averageFollowers?: Number;
  //    averageFriends?: Number;
  //    averageLikes?: Number;
  //    averageLists?: Number;
  //    createdAt?: Date;
  //    followers?: Number;
  //    friends?: Number;
  //    likes?: Number;
  //    lists?: Number;
  //    name: String;
  //    tweetedAt?: Date;
  //    tweetFrequency?: Number;
  //    tweets?: Number;
  //  }
  // status[Object] => https://developer.twitter.com/en/docs/tweets/data-dictionary/overview/intro-to-tweet-json

  // https://twitter.com/crawlamma
  async crawlamma({ client, executor, tweeter, status }) {
    if (
      executor.name !== tweeter.name &&
      (!tweeter.tweetFrequency || 30 < (tweeter.tweetFrequency || 0))
    ) {
      await client.post('statuses/retweet', { id: status.id_str });
      await new Promise(r => setTimeout(r, 1000 * 10)); // delay 10 seconds
    }
  },

  // https://twitter.com/kulukulu0033
  // async kulukulu0033({ client, executor, tweeter, status }) {
  //   if (
  //     executor.name !== tweeter.name &&
  //     status.full_text.match(/സ്വാമിന.*/g)
  //   ) {
  //     await client.post('statuses/retweet', { id: status.id_str });
  //     await new Promise(r => setTimeout(r, 1000 * 10));
  //   }
  // },
};
