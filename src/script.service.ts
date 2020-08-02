import { Injectable, Logger } from '@nestjs/common';
import { omit } from 'lodash';
import { throttleTime } from 'rxjs/operators';
// import Twitter from 'twitter-lite';

import { env } from './env.validations';
import { Neo4jService } from './neo4j.service';
import { ScriptMessageService } from './script.message.service';
import { scripts } from './scripts';

const Twitter = require('twitter-lite');

@Injectable()
export class ScriptService {
  private readonly appProps = [
    'accessRevoked',
    'accessTokenKey',
    'accessTokenSecret',
    'roles',
  ];

  constructor(
    private readonly logger: Logger,
    private readonly neo4jService: Neo4jService,
    private readonly scriptMessageService: ScriptMessageService,
  ) {
    this.logger.log(Object.keys(scripts), 'ScriptService/scripts');

    // script executor
    this.scriptMessageService.messages
      .pipe(throttleTime(1000 * 60))
      .subscribe(async statuses => {
        if (statuses.length) {
          for await (const status of statuses)
            await this.scriptMessageService.removeMessage(status);

          // get executors
          const { records: executors } = await this.neo4jService.read(
            `MATCH (p:nPerson)
            WHERE p.name IN $executors
              AND ((NOT EXISTS (p.accessRevoked)) OR p.accessRevoked <> true)
              AND EXISTS (p.accessTokenKey)
              AND EXISTS (p.accessTokenSecret)
            RETURN p
            ORDER BY COALESCE(p.accessTokenValidatedAt, "1970-01-01T00:00:00.000Z") DESC`,
            {
              executors: Object.keys(scripts),
            },
          );

          for (const nPerson of executors || []) {
            const { properties: executor } = nPerson.get('p');

            // twitter instance
            const client = new Twitter({
              access_token_key: executor.accessTokenKey,
              access_token_secret: executor.accessTokenSecret,
              consumer_key: env.TWITTER_CONSUMER_KEY,
              consumer_secret: env.TWITTER_CONSUMER_SECRET,
            });

            // verify credentials
            try {
              await client.get('account/verify_credentials');
            } catch (e) {
              this.logger.error(
                e,
                'account/verify_credentials',
                `ScriptService/${executor.name}`,
              );

              await this.neo4jService.write(
                `MATCH (p:nPerson {name: $name})
                SET p.accessRevoked = true
                RETURN p.name`,
                {
                  name: executor.name,
                },
              );

              // skip
              continue;
            }

            for await (const status of statuses) {
              const {
                records: [nPerson],
              } = await this.neo4jService.read(
                `MATCH (p:nPerson {name: $name})
                RETURN p`,
                {
                  name: status.user.screen_name,
                },
              );

              if (nPerson) {
                const { properties: tweeter } = nPerson.get('p');

                try {
                  // execute user script
                  await scripts[executor.name]({
                    client,
                    executor: omit(executor, this.appProps),
                    tweeter: omit(tweeter, this.appProps),
                    status,
                  });
                } catch (e) {
                  this.logger.error(
                    e,
                    `${status.user.screen_name}/${status.id_str}`,
                    `scripts/${executor.name}`,
                  );
                }
              }
            }
          }
        }
      });
  }
}
