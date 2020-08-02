import { Injectable } from '@nestjs/common';

import { Neo4jService } from './neo4j.service';

@Injectable()
export class AppService {
  constructor(private readonly neo4jService: Neo4jService) {}

  // search route handler
  async search(query: string = '') {
    const name = query.split(' ')[0];

    const { records: hits } = await this.neo4jService.read(
      `MATCH (p:nPerson)
      WHERE p.name =~ $name
      RETURN p.name
      ORDER BY COALESCE(p.tweetedAt, "1970-01-01T00:00:00.000Z") DESC
      LIMIT 10`,
      {
        name,
      },
    );

    return {
      hits: (hits || []).map(hit => hit.get('p.name')),
      total:
        hits.length < 10
          ? hits.length
          : (
              await this.neo4jService.read(
                `MATCH (p:nPerson)
                WHERE p.name =~ $name
                WITH COUNT(p) AS total
                RETURN total`,
                {
                  name,
                },
              )
            ).records[0]
              .get('total')
              .toNumber(),
    };
  }
}
