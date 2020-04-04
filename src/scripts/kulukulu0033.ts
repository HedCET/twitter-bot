module.exports = async ({ tweeter, status, twitter, user }) => {
  if (tweeter._id != user._id && status.full_text.match(/സ്വാമിന.*/g)) {
    await twitter.post('statuses/retweet', { id: status.id_str });
    await new Promise(r => setTimeout(r, 1000 * 10));
  }
};
