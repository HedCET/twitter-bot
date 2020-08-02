import { Injectable, Logger } from '@nestjs/common';
import { throttleTime } from 'rxjs/operators';

import { Neo4jService } from './neo4j.service';
import { RoughRecordMessageService } from './rough.record.message.service';

@Injectable()
export class RoughRecordService {
  constructor(
    private readonly logger: Logger,
    private readonly neo4jService: Neo4jService,
    private readonly roughRecordMessageService: RoughRecordMessageService,
  ) {
    this.roughRecordMessageService.messages
      .pipe(throttleTime(1000 * 60))
      .subscribe(async statuses => {
        for await (const status of statuses || [])
          await this.roughRecordMessageService.removeMessage(status);

        for await (const status of statuses || []) {
          const words = status.full_text
            .replace(/[^\u0d00-\u0d7f ]+/g, ' ')
            .split(/ +/)
            .filter(word => word && 1 < word.length);

          for (let i = 0; i < words.length - 1; i++)
            try {
              await this.neo4jService.write(
                `MERGE (person:nPerson {name: $tweeterName})
                MERGE (word:nWord {text: $wordText})
                MERGE (person)-[wordTweet:rTweet]->(word)
                  ON CREATE SET wordTweet += {count: 1, updatedAt: $updatedAt}
                  ON MATCH SET wordTweet += {count: wordTweet.count + 1, updatedAt: $updatedAt}
                MERGE (nextWord:nWord {text: $nextWordText})
                MERGE (person)-[nextWordTweet:rTweet]->(nextWord)
                  ON CREATE SET nextWordTweet += {count: 1, updatedAt: $updatedAt}
                  ON MATCH SET nextWordTweet += {count: nextWordTweet.count + 1, updatedAt: $updatedAt}
                MERGE (word)-[next:rWord]->(nextWord)
                  ON CREATE SET next += {count: 1, updatedAt: $updatedAt}
                  ON MATCH SET next += {count: next.count + 1, updatedAt: $updatedAt}
                RETURN person.name`,
                {
                  tweeterName: status.user.screen_name,
                  updatedAt: status.created_at,
                  wordText: words[i],
                  nextWordText: words[i + 1],
                },
              );
            } catch (e) {
              this.logger.error(
                e.message || e,
                `${words[i]}|${words[i + 1]}`,
                `RoughRecordService/${status.user.screen_name}`,
              );

              i--; // infinite retry
            }
        }
      });
  }
}
