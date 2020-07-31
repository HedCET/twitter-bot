import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { get } from 'lodash';
import { Driver, session, Result } from 'neo4j-driver';

import { env } from './env.validations';

@Injectable()
export class Neo4jService implements OnApplicationShutdown {
  private readonly dbName = get(
    env.NEO4J_URL.match(/([^\/]+$)/i),
    '[1]',
    'neo4j',
  );

  constructor(@Inject('NEO4J') private readonly driver: Driver) {}

  async onApplicationShutdown() {
    await this.driver.close();
  }

  getReadSession(dbName?: string) {
    return this.driver.session({
      database: dbName || this.dbName,
      defaultAccessMode: session.READ,
    });
  }

  read(query: string, params?: object, dbName?: string): Result {
    return this.getReadSession(dbName).run(query, params);
  }

  getWriteSession(dbName?: string) {
    return this.driver.session({
      database: dbName || this.dbName,
      defaultAccessMode: session.WRITE,
    });
  }

  write(query: string, params?: object, dbName?: string): Result {
    return this.getWriteSession(dbName).run(query, params);
  }
}
