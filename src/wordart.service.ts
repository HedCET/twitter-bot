import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { connect, connection } from 'amqplib';
import { request } from 'amqplib-rpc';
import { capitalize, compact, find, pick, random, shuffle } from 'lodash';
import * as moment from 'moment';
import { Model } from 'mongoose';
import { isJSON } from 'validator';

import {
  model as cachedWordArtsModel,
  name as cachedWordArtsToken,
} from './cachedWordArts.table';
import { env } from './env.validations';
import { model as usersModel, name as usersToken } from './users.table';

@Injectable()
export class WordartService {
  private readonly urls = env.WORDART_IMAGE_URLS
    ? shuffle(compact(env.WORDART_IMAGE_URLS.split('|')))
    : [];
  private readonly services = [
    'followers',
    'friends',
    'likes',
    'lists',
    'tweeted_at',
  ];
  private index = random(this.urls.length);
  private amqp: connection;

  constructor(
    @InjectModel(cachedWordArtsToken)
    private readonly cachedWordArtsTable: Model<cachedWordArtsModel>,
    private readonly logger: Logger,
    @InjectModel(usersToken) private readonly usersTable: Model<usersModel>,
  ) {}

  // wordart route handler
  async wordart(key: string = '', tags: string = '') {
    const cachedWordArts = await this.cachedWordArtsTable.find(
      { _id: { $in: this.services.map(i => `${i}|${tags}`) } },
      { json: 0 },
    );
    // .populate({ select: '_id,name', path: 'users', match: { tags } });

    if (cachedWordArts.length) {
      if (find(cachedWordArts, { _id: `${key}|${tags}` }))
        return JSON.parse(
          (
            await this.cachedWordArtsTable.findOne(
              { _id: `${key}|${tags}` },
              { json: 1 },
            )
          ).json,
        );
      else {
        cachedWordArts.forEach(async ({ _id, startedAt }) => {
          if (moment(startedAt).isBefore(moment().subtract(15, 'minutes'))) {
            const [key, tags] = _id.split('|');
            await this.cache(key, tags);
          }
        });

        const json = {};

        // metadata response
        for (const { _id, startedAt, tweeters } of shuffle(cachedWordArts))
          json[_id.split('|')[0]] = {
            hits: tweeters,
            startedAt,
          };

        return json;
      }
    } else {
      await this.cache(key, tags);
      return await this.wordart(key, tags);
    }
  }

  // populate wordart
  private async cache(key: string = '', tags: string = '') {
    if (!key)
      for await (const service of this.services) // loop
        await this.cache(service, tags);

    if (-1 < this.services.indexOf(key)) {
      const prop =
        key === 'tweeted_at' ? 'tweetFrequency' : `average${capitalize(key)}`;
      let propVal = 0;

      if (prop === 'tweetFrequency') {
        const [avg] = await this.usersTable.aggregate([
          { $match: { ...(tags && { tags: { $in: tags.split('|') } }) } },
          { $group: { _id: '', avg: { $avg: '$tweetFrequency' } } },
        ]);

        // average tweet frequency
        propVal = avg?.avg ?? 7;
      }

      const $set = {
        startedAt: moment().toISOString(),
        tweeters: [],
      };

      // iterate max 24 times (6 hours) or at-least 10 tweeters
      for (let i = 0; $set.tweeters.length < 10 && i < 24; i++) {
        $set.startedAt = moment($set.startedAt)
          .subtract((i + 1) * 15, 'minutes')
          .toISOString();

        for (const user of await this.usersTable.find(
          {
            ...(tags && { tags: { $in: tags.split('|') } }),
            tweetedAt: { $gte: $set.startedAt },
            [prop]: { $gt: propVal },
          },
          { name: 1, [prop]: 1 },
          {
            limit: random(200, 400),
            sort: { tweetedAt: 'desc' },
          },
        ))
          $set.tweeters.push({
            key: user.name,
            value: Math.ceil(user[prop]),
          });
      }

      if ($set.tweeters.length) {
        if (!this.amqp) this.amqp = await connect(env.WORDART_AMQP_URL);

        let content;

        try {
          content = (
            await request(this.amqp, env.WORDART_AMQP_QUEUE_NAME, {
              words: $set.tweeters.map(i => `${i.key};${i.value}`).join('\n'),
              image: this.urls.length
                ? this.urls[this.index++ % this.urls.length]
                : '',
            })
          ).content.toString();
        } catch (e) {
          this.logger.error(
            e,
            e.message,
            `WordartService/${key}/${tags || '*'}`,
          );
        }

        if (isJSON(content)) {
          const cloud = JSON.parse(content);

          this.logger.log(
            pick(cloud, ['statusCode', 'statusText']),
            `WordartService/${key}/${tags || '*'}`,
          );

          if (cloud.statusCode === 200)
            await this.cachedWordArtsTable.updateOne(
              { _id: `${key}|${tags}` },
              {
                $set: {
                  ...$set,
                  json: cloud.json,
                  tweeters: $set.tweeters.map(i => i.key),
                },
              },
              { upsert: true },
            );
          else await this.cache(key, tags);
        } else
          this.logger.error(
            content,
            'invalid JSON content',
            `WordartService/${key}/${tags || '*'}`,
          );
      }
    }

    return true;
  }
}
