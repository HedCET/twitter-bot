import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as joi from 'joi';
import { keys, pick } from 'lodash';
import * as path from 'path';

const schema = {
  ENV: joi
    .string()
    .valid(['development', 'production'])
    .default('development'),
  PORT: joi.number().default(8080),
  ROOT_URL: joi.string().default('localhost:8080'),
  SECRET: joi.string().default('secret'),
  TWITTER_ACCESS_TOKEN: joi.string().required(),
  TWITTER_ACCESS_TOKEN_SECRET: joi.string().required(),
  TWITTER_CONSUMER_KEY: joi.string().required(),
  TWITTER_CONSUMER_SECRET: joi.string().required(),
};

const { error, value } = joi.validate(
  {
    ...dotenv.parse(
      fs.existsSync(path.resolve(process.env.ENV_FILEPATH || './.development'))
        ? fs
            .readFileSync(
              path.resolve(process.env.ENV_FILEPATH || './.development'),
            )
            .toString()
        : '',
    ),
    ...pick(process.env, keys(schema)),
  },
  joi.object(schema),
);

if (error) throw error;

export const env: { [key: string]: any } = value;
