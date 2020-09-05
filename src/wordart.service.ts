import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { capitalize, find, pick, random, shuffle } from 'lodash';
import * as moment from 'moment';
import { Model } from 'mongoose';
import { isJSON } from 'validator';

import { AmqpService } from './amqp.service';
import {
  model as cachedWordArtsModel,
  name as cachedWordArtsToken,
} from './cachedWordArts.table';
import { env } from './env.validations';
import { model as usersModel, name as usersToken } from './users.table';

@Injectable()
export class WordartService {
  private readonly urls = env.WORDART_IMAGE_URLS.split('|');
  private readonly services = [
    'followers',
    'friends',
    'likes',
    'lists',
    'tweeted_at',
  ];
  private index = random(this.urls.length);

  constructor(
    private readonly amqpService: AmqpService,
    @InjectModel(cachedWordArtsToken)
    private readonly cachedWordArtsTable: Model<cachedWordArtsModel>,
    private readonly logger: Logger,
    @InjectModel(usersToken) private readonly usersTable: Model<usersModel>,
  ) {}

  // wordart route handler
  async wordart(key: string = '', tags: string = '') {
    const cachedWordArts = await this.cachedWordArtsTable.find(
      { _id: { $in: this.services.map(i => `${i}|${tags}`) } },
      { stringifiedJSON: 0 },
    );
    // .populate({ select: '_id,name', path: 'users', match: { tags } });

    if (cachedWordArts.length) {
      if (find(cachedWordArts, { _id: `${key}|${tags}` }))
        return JSON.parse(
          (
            await this.cachedWordArtsTable.findOne(
              { _id: `${key}|${tags}` },
              { stringifiedJSON: 1 },
            )
          ).stringifiedJSON,
        );
      else {
        cachedWordArts.forEach(async ({ _id, startedAt }) => {
          if (moment(startedAt).isBefore(moment().subtract(30, 'minutes'))) {
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
      const $set = {
        startedAt: moment().toISOString(),
        tweeters: [],
      };

      // iterate max 24 times (6 hours) or at-least 10 tweeters
      for (let i = 0; $set.tweeters.length < 10 && i < 24; i++) {
        $set.startedAt = moment($set.startedAt)
          .subtract((i + 1) * 15, 'minutes')
          .toISOString();

        const limit = random(60, 90);
        const prop =
          key === 'tweeted_at' ? 'tweetFrequency' : `average${capitalize(key)}`;

        for (const user of await this.usersTable.find(
          {
            [prop]: { $gt: 0 },
            ...(tags && { tags: { $in: tags.split('|') } }),
            ...(prop === 'tweetFrequency'
              ? { tweetFrequency: { $gt: 7 } }
              : { tweetedAt: { $gte: $set.startedAt } }),
          },
          { name: 1, [prop]: 1 },
          { limit, sort: { tweetedAt: 'desc' } },
        ))
          $set.tweeters.push({
            key: user.name,
            value: Math.ceil(user[prop]),
          });
      }

      if ($set.tweeters.length) {
        let content;

        try {
          content = (
            await this.amqpService.request(
              {},
              {
                sendOpts: {
                  headers: {
                    // randomizing images
                    image: this.urls[this.index++ % this.urls.length],
                    // words in csv format
                    words: $set.tweeters
                      .map(i => `${i.key};${i.value}`)
                      .join('\n'),
                  },
                },
              },
            )
          ).content.toString();
        } catch (e) {
          this.logger.error(e, e.message, `WordartService/${key}/${tags}`);
        }

        if (content) {
          if (isJSON(content)) {
            const json = JSON.parse(content);

            this.logger.log(
              pick(json, ['statusCode', 'statusText']),
              `WordartService/${key}/${tags}`,
            );

            if (json.statusCode === 200)
              await this.cachedWordArtsTable.updateOne(
                { _id: `${key}|${tags}` },
                {
                  $set: {
                    ...$set,
                    stringifiedJSON: JSON.stringify(json.response),
                    tweeters: $set.tweeters.map(i => i.key),
                  },
                },
                { upsert: true },
              );
            else await this.cache(key, tags);
          } else
            this.logger.error(
              content,
              'invalid JSON response.content',
              `WordartService/${key}/${tags}`,
            );
        }
      }
    }

    return true;
  }
}
