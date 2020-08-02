import { CACHE_MANAGER, Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { capitalize, each, find, pick, random } from 'lodash';
import * as moment from 'moment';
import { isJSON } from 'validator';

import { AmqpService } from './amqp.service';
import { Neo4jService } from './neo4j.service';
import { env } from './env.validations';

@Injectable()
export class WordartService {
  private index = random(env.WORDART_IMAGE_URLS.split('|').length);
  private readonly services = [
    'followers',
    'friends',
    'likes',
    'lists',
    'tweeted_at',
  ];

  constructor(
    private readonly amqpService: AmqpService,
    @Inject(CACHE_MANAGER) private readonly cacheManager,
    private readonly logger: Logger,
    private readonly neo4jService: Neo4jService,
  ) {}

  // wordart route handler
  async wordart(key: string = '') {
    // custom cache handler
    let _wordart = await this.cacheManager.get('_wordart');
    if (!_wordart) _wordart = await this._wordart();

    if (key && -1 < this.services.indexOf(key) && _wordart[key])
      return _wordart[key].wordart;
    else {
      const json = {};

      // metadata response
      each(pick(_wordart, this.services), (value, key) => {
        json[key] = {
          hits: value.tweeters.map(tweeter => tweeter.key),
          startAt: value.startAt,
        };
      });

      return json;
    }
  }

  // populate wordart in cache
  @Cron('0 5,15,25,35,45,55 * * * *')
  private async _wordart(key: string = '') {
    if (!key)
      for await (const service of this.services) await this._wordart(service);

    if (-1 < this.services.indexOf(key)) {
      const data = {
        startAt: moment().toISOString(),
        tweeters: [],
        wordart: {},
      };

      // iterate max 30 times & at-least 10 tweeters
      for (let i = 0; data.tweeters.length < 10 && i < 30; i++) {
        data.startAt = moment(data.startAt)
          .subtract((i + 1) * 10, 'minutes')
          .toISOString();

        const prop =
          key === 'tweeted_at' ? 'tweetFrequency' : `average${capitalize(key)}`;

        const { records } = await this.neo4jService.read(
          `MATCH (p:nPerson)
          WHERE $startAt <= p.tweetedAt
          RETURN p.name, p.${prop}
          ORDER BY COALESCE(p.tweetedAt, "1970-01-01T00:00:00.000Z") DESC
          LIMIT 200`,
          {
            startAt: data.startAt,
          },
        );

        for (const record of records) {
          const key = record.get('p.name');
          const value = record.get(`p.${prop}`);

          if (!find(data.tweeters, { key }) && 0 < (value || 0))
            data.tweeters.push({ key, value: Math.ceil(value) });
        }
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
                    image: env.WORDART_IMAGE_URLS.split('|')[
                      this.index++ % env.WORDART_IMAGE_URLS.split('|').length
                    ],
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
                '_wordart',
                {
                  ...((await this.cacheManager.get('_wordart')) || {}),
                  [key]: data,
                },
                { ttl: 0 }, // infinitely
              );
            } else await this._wordart(key);
          } else
            this.logger.error(
              content,
              'invalid JSON response.content',
              `WordartService/${key}`,
            );
        }
      }
    }

    return (await this.cacheManager.get('_wordart')) || {};
  }
}
