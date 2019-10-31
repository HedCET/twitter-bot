import { MongooseModule } from '@nestjs/mongoose';

import { env } from './env.validations';
import { retweetsSchema } from './retweets.schema';

export const modelTokens = {
  'retweets': 'retweets',
};

const dbSchemas = [
  { name: modelTokens.retweets, schema: retweetsSchema }
];

export const dbImports = [
  MongooseModule.forFeature([...dbSchemas]),
  MongooseModule.forRoot(env.MONGO_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
];
