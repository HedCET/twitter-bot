import { CACHE_MANAGER, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
// import { Cron } from '@nestjs/schedule';
import { capitalize, each, find, pick, random, shuffle } from 'lodash';
import * as moment from 'moment';
import { Model } from 'mongoose';
import { isJSON } from 'validator';

import { AmqpService } from './amqp.service';
import { env } from './env.validations';
import { model, name } from './users.table';

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
    @Inject(CACHE_MANAGER) private readonly cacheManager,
    private readonly logger: Logger,
    @InjectModel(name) private readonly usersTable: Model<model>,
  ) {}

  // wordart route handler
  async wordart(key: string = '', tags: string = '') {
    // custom cache handler
    let cache = await this.cacheManager.get(`wordart|${tags}`);
    if (!cache) cache = await this.cache(key, tags);

    if (key && -1 < this.services.indexOf(key) && cache[key])
      return cache[key].wordart;
    else {
      const json = {};

      // metadata response
      each(pick(cache, shuffle(this.services)), (value, key) => {
        json[key] = {
          hits: value.tweeters.map(tweeter => tweeter.key),
          startedAt: value.startedAt,
        };
      });

      return json;
    }
  }

  // populate wordart in cache
  // @Cron('0 */15 * * * *')
  private async cache(key: string = '', tags: string = '') {
    if (!key)
      for await (const service of this.services) // loop
        await this.cache(service, tags || 'malayalam');

    if (-1 < this.services.indexOf(key)) {
      const data = {
        startedAt: moment().toISOString(),
        tweeters: [],
        wordart: {},
      };

      // iterate max 24 times (6 hours) or at-least 10 tweeters
      for (let i = 0; data.tweeters.length < 10 && i < 24; i++) {
        data.startedAt = moment(data.startedAt)
          .subtract((i + 1) * 15, 'minutes')
          .toISOString();

        const prop =
          key === 'tweeted_at' ? 'tweetFrequency' : `average${capitalize(key)}`;

        // dynamic projection
        const users = await this.usersTable.find(
          {
            tags: { $in: tags.split('|') },
            tweetedAt: { $gte: data.startedAt },
          },
          { name: 1, [prop]: 1 },
          { limit: 90, sort: { tweetedAt: 'desc' } },
        );

        for (const user of users)
          if (!find(data.tweeters, { key: user.name }) && 0 < (user[prop] || 0))
            data.tweeters.push({
              key: user.name,
              value: Math.ceil(user[prop]),
            });
      }

      if (data.tweeters.length) {
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
                    words: data.tweeters
                      .map(item => `${item.key};${item.value}`)
                      .join('\n'),
                  },
                },
              },
            )
          ).content.toString();
        } catch (e) {
          this.logger.error(e, e.message, `WordartService/${key}`);
        }

        if (content) {
          if (isJSON(content)) {
            const json = JSON.parse(content);

            this.logger.log(
              pick(json, ['statusCode', 'statusText']),
              `WordartService/${key}`,
            );

            if (json.statusCode === 200) {
              data.wordart = json.response;

              // custom caching
              this.cacheManager.set(
                `wordart|${tags}`,
                {
                  ...((await this.cacheManager.get(`wordart|${tags}`)) || {}),
                  [key]: data,
                },
                { ttl: 900 }, // 15 minutes
              );
            } else await this.cache(key);
          } else
            this.logger.error(
              content,
              'invalid JSON response.content',
              `WordartService/${key}`,
            );
        }
      }
    }

    return (await this.cacheManager.get(`wordart|${tags}`)) || {};
  }
}
