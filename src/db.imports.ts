import { MongooseModule } from '@nestjs/mongoose';

import { env } from './env.validations';
import { tweetsSchema } from './tweets.schema';
import { usersSchema } from './users.schema';

export const modelTokens = {
  tweets: 'tweets',
  users: 'users',
};

const dbSchemas = [
  { name: modelTokens.tweets, schema: tweetsSchema },
  { name: modelTokens.users, schema: usersSchema }
];

export const dbImports = [
  MongooseModule.forFeature([...dbSchemas]),
  MongooseModule.forRoot(env.MONGO_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
];
