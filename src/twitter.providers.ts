import { OAuth } from 'oauth';

import { env } from './env.validations';

export const twitterProviders = [
  {
    provide: 'TWITTER_AUTH',
    useFactory: async (): Promise<OAuth> =>
      new OAuth(
        'https://twitter.com/oauth/request_token',
        'https://twitter.com/oauth/access_token',
        env.TWITTER_CONSUMER_KEY,
        env.TWITTER_CONSUMER_SECRET,
        '1.0A',
        env.TWITTER_CALLBACK_URL,
        'HMAC-SHA1',
      ),
  },
];
