import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as joi from 'joi';
import { keys, pick } from 'lodash';
import * as path from 'path';

const schema = {
  AMQP_QUEUE: joi.string().required(),
  AMQP_URL: joi.string().required(),
  ENV: joi
    .string()
    .valid(['development', 'production'])
    .default('development'),
  FIREBASE_CLIENT_EMAIL: joi.string().required(),
  FIREBASE_PRIVATE_KEY: joi.string().required(),
  FIREBASE_PROJECT_ID: joi.string().required(),
  PORT: joi.number().default(8080),
  REDIS_HOST: joi.string().required(),
  REDIS_PASSWORD: joi.string().required(),
  REDIS_PORT: joi.number().required(),
  ROOT_URL: joi.string().default('http://localhost:8080'),
  SECRET: joi.string().default('secret'),
  TWITTER_ACCESS_TOKEN: joi.string().required(),
  TWITTER_ACCESS_TOKEN_SECRET: joi.string().required(),
  TWITTER_CALLBACK_URL: joi
    .string()
    .default('http://localhost:8080/twitter_callback'),
  TWITTER_CONSUMER_KEY: joi.string().required(),
  TWITTER_CONSUMER_SECRET: joi.string().required(),
  WORDART_IMAGE_URLS: joi.string().default(''),
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
