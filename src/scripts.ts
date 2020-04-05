export const scripts = {
  // tweeter[Object] tweeter refer ./user.model.ts
  // status[Object] refer https://developer.twitter.com/en/docs/tweets/data-dictionary/overview/intro-to-tweet-json
  // twitter[Instance] twit instance
  // user[Object] script executer refer ./user.model.ts

  async crawlamma({ tweeter, status, twitter, user }) {
    if (
      tweeter._id != user._id &&
      (!tweeter.last_tweeted_at_frequency ||
        10 < (tweeter.last_tweeted_at_frequency || 0))
    ) {
      await twitter.post('statuses/retweet', { id: status.id_str });
      await new Promise(r => setTimeout(r, 1000 * 10)); // delay 10 seconds
    }
  },

  async kulukulu0033({ tweeter, status, twitter, user }) {
    if (tweeter._id != user._id && status.full_text.match(/സ്വാമിന.*/g)) {
      await twitter.post('statuses/retweet', { id: status.id_str });
      await new Promise(r => setTimeout(r, 1000 * 10));
    }
  },
};
