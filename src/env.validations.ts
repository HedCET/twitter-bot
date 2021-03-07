import dotenv from 'dotenv';
import fs from 'fs';
import joi from '@hapi/joi';
import { compact, pick } from 'lodash';
import path from 'path';
import isURL from 'validator/lib/isURL';

const schema = joi.object({
  MONGO_URL: joi.string().required().uri(),
  NODE_ENV: joi.string().default('development'),
  PORT: joi.number().default(8080),
  ROOT_URL: joi.string().uri().default('http://localhost:8080'),
  SECRET: joi.string().default('secret'),
  TWITTER_CALLBACK_URL: joi
    .string()
    .uri()
    .default('http://localhost:8080/twitter_callback'),
  WORDART_AMQP_QUEUE_NAME: joi.string().required(),
  WORDART_AMQP_URL: joi.string().required().uri(),
  WORDART_IMAGE_URLS: joi.string(),
});

const { error, value } = schema.validate({
  ...dotenv.parse(
    fs.existsSync(path.resolve(process.env.ENV_FILEPATH || './.development'))
      ? fs.readFileSync(
          path.resolve(process.env.ENV_FILEPATH || './.development'),
          'utf8',
        )
      : '',
  ),
  ...pick(process.env, [...schema._ids._byKey.keys()]),
});

if (error) throw error;

// custom loading for WORDART_IMAGE_URLS
if (!value.WORDART_IMAGE_URLS && fs.existsSync(path.resolve('./.wordarts')))
  value.WORDART_IMAGE_URLS = fs
    .readFileSync(path.resolve('./.wordarts'), 'utf8')
    .replace(/\n/g, '|');

// custom validation for WORDART_IMAGE_URLS
if (value.WORDART_IMAGE_URLS)
  for (const url of compact(value.WORDART_IMAGE_URLS.split('|')))
    if (!isURL(url)) throw new Error(`invalid URL WORDART_IMAGE_URLS ${url}`);

export const env: { [key: string]: any } = value;
