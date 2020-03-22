import { tweetsSchema } from './tweets.schema';
import { usersSchema } from './users.schema';

export const modelTokens = {
  tweets: 'tweets',
  users: 'users',
};

export const dbModels = [
  { name: modelTokens.tweets, schema: tweetsSchema },
  { name: modelTokens.users, schema: usersSchema },
];
