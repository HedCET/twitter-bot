import fetch from 'cross-fetch';
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
  WORDART_FILE_URL: joi.string().uri(),
});

const ENV_FILEPATH = path.resolve(process.env.ENV_FILEPATH || './.env');
const { error, value } = schema.validate({
  ...dotenv.parse(
    fs.existsSync(ENV_FILEPATH) ? fs.readFileSync(ENV_FILEPATH, 'utf8') : '',
  ),
  ...pick(process.env, [...schema._ids._byKey.keys()]),
});

if (error) throw error;

// load WORDART_IMAGE_URLS from local text file
if (fs.existsSync(path.resolve('./.wordarts')))
  value.WORDART_IMAGE_URLS = fs
    .readFileSync(path.resolve('./.wordarts'), 'utf8')
    .split(/\s*[\r\n]+\s*/g)
    .filter((url) => isURL(url))
    .join('|');

// load WORDART_IMAGE_URLS from remote text file
if (value.WORDART_FILE_URL)
  fetch(value.WORDART_FILE_URL).then(async (response) => {
    if (response.status !== 200)
      throw new Error(`invalid URL ${value.WORDART_FILE_URL}`);
    value.WORDART_IMAGE_URLS = (await response.text())
      .split(/\s*[\r\n]+\s*/g)
      .filter((url) => isURL(url))
      .join('|');
  });

export const env: { [key: string]: any } = value;
