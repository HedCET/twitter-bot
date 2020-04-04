module.exports = async ({ tweeter, status, twitter, user }) => {
  if (
    !tweeter.last_tweeted_at_frequency ||
    30 < (tweeter.last_tweeted_at_frequency || 0)
  ) {
    console.log(
      'statuses/retweet',
      `${status.user.screen_name}/${status.id_str}`,
    );
    // await new Promise(r => setTimeout(r, 1000 * 60));
    // await twitter.post('statuses/retweet', { id: status.id_str });
  }
};
