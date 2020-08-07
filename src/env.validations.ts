import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as joi from 'joi';
import { keys, pick } from 'lodash';
import * as path from 'path';
import { isJSON, isURL } from 'validator';

const schema = {
  AMQP_QUEUE_NAME: joi.string().required(),
  AMQP_URL: joi
    .string()
    .required()
    .uri(),
  MONGO_URL: joi
    .string()
    .required()
    .uri(),
  NODE_ENV: joi.string().default('development'),
  PORT: joi.number().default(8080),
  ROOT_URL: joi
    .string()
    .uri()
    .default('http://localhost:8080'),
  SECRET: joi.string().default('secret'),
  TWITTER_CALLBACK_URL: joi
    .string()
    .uri()
    .default('http://localhost:8080/twitter_callback'),
  TWITTER_CONSUMER_KEY: joi.string().required(),
  TWITTER_CONSUMER_SECRET: joi.string().required(),
  TWITTER_SEARCH_QUERY: joi.string().required(),
  WORDART_IMAGE_URLS: joi.string().default(''),
};

const { error, value } = joi.validate(
  {
    ...dotenv.parse(
      fs.existsSync(path.resolve(process.env.ENV_FILEPATH || './.development'))
        ? fs.readFileSync(
            path.resolve(process.env.ENV_FILEPATH || './.development'),
            { encoding: 'utf8' },
          )
        : '',
    ),
    ...pick(process.env, keys(schema)),
  },
  joi.object(schema),
);

if (error) throw error;

// custom validation for TWITTER_SEARCH_QUERY
if (!isJSON(value.TWITTER_SEARCH_QUERY))
  throw new Error(
    `invalid JSON TWITTER_SEARCH_QUERY ${value.TWITTER_SEARCH_QUERY}`,
  );

// custom validation for WORDART_IMAGE_URLS
if (value.WORDART_IMAGE_URLS)
  for (const url of value.WORDART_IMAGE_URLS.split('|'))
    if (!isURL(url)) throw new Error(`invalid URL WORDART_IMAGE_URLS ${url}`);

export const env: { [key: string]: any } = value;
