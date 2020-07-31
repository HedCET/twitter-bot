import { Injectable } from '@nestjs/common';

import { Neo4jService } from './neo4j.service';

@Injectable()
export class AppService {
  constructor(private readonly neo4jService: Neo4jService) {}

  // search route handler
  async search(query: string = '') {
    const { records: hits } = await this.neo4jService.read(
      `MATCH (p:nPerson)
      WHERE p.name =~ $query
      RETURN p.name
      ORDER BY p.tweetedAt DESC
      LIMIT 10`,
      {
        query,
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
                WHERE p.name =~ $query
                WITH COUNT(p) AS total
                RETURN total`,
                {
                  query,
                },
              )
            ).records[0].get('total'),
    };
  }
}
