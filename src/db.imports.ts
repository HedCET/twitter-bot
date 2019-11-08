import { MongooseModule } from '@nestjs/mongoose';

import { env } from './env.validations';
import { favoritesSchema } from './favorites.schema';
import { messagesSchema } from './messages.schema';
import { retweetsSchema } from './retweets.schema';
import { usersSchema } from './users.schema';

export const modelTokens = {
  favorites: 'favorites',
  messages: 'messages',
  retweets: 'retweets',
  users: 'users',
};

const dbSchemas = [
  { name: modelTokens.favorites, schema: favoritesSchema },
  { name: modelTokens.messages, schema: messagesSchema },
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
