import * as twit from 'twit';

import { env } from './env.validations';

export const twitterProviders = [
  {
    provide: 'TWITTER',
    useFactory: async (): Promise<typeof twit> =>
      new twit({
        access_token: env['TWITTER_ACCESS_TOKEN'],
        access_token_secret: env['TWITTER_ACCESS_TOKEN_SECRET'],
        consumer_key: env['TWITTER_CONSUMER_KEY'],
        consumer_secret: env['TWITTER_CONSUMER_SECRET'],
      }),
  },
];
