import { MongooseModule } from '@nestjs/mongoose';

import { env } from './env.validations';
import { settingsSchema } from './settings.schema';
import { usersSchema } from './users.schema';

export const modelTokens = {
  settings: 'settings',
  users: 'users',
};

const dbSchemas = [
  { name: modelTokens.settings, schema: settingsSchema },
  { name: modelTokens.users, schema: usersSchema }
];

export const dbImports = [
  MongooseModule.forFeature([...dbSchemas]),
  MongooseModule.forRoot(env.MONGO_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
];
