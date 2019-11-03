import { MongooseModule } from '@nestjs/mongoose';

import { env } from './env.validations';
import { retweetsSchema } from './retweets.schema';
import { usersSchema } from './users.schema';

export const modelTokens = {
  'retweets': 'retweets',
  'users': 'users',
};

const dbSchemas = [
  { name: modelTokens.retweets, schema: retweetsSchema },
  { name: modelTokens.users, schema: usersSchema }
];

export const dbImports = [
  MongooseModule.forFeature([...dbSchemas]),
  MongooseModule.forRoot(env.MONGO_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
];
